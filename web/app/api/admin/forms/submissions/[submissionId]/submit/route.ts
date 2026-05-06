import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { validateFormPayload, type FormPayload } from "@/lib/forms/validateSubmission";
import { dbGetSubmission, dbGetVersion, dbSubmitSubmission } from "@/lib/admin/forms/formsAdminDb";
import { jsonData, jsonError, jsonValidationErrors, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { persistFormSubmissionSignatures } from "@/lib/forms/signatures/persistFormSubmissionSignatures";
import { emitFormSignedSafe, emitFormSubmittedSafe } from "@/lib/forms/workflow/formSubmissionEvents";

/** POST /api/admin/forms/submissions/[submissionId]/submit — draft → submitted (admin only). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { submissionId: raw } = await params;
    const submissionId = parseUuidParam(raw, "submissionId");
    if (submissionId instanceof NextResponse) return submissionId;

    let body: Record<string, unknown> = {};
    try {
        const parsed = await request.json();
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            body = parsed as Record<string, unknown>;
        }
    } catch {
        /* empty body allowed */
    }

    const optionValuesRaw = body.option_values_by_field_id;
    const optionValuesByFieldId =
        optionValuesRaw &&
        typeof optionValuesRaw === "object" &&
        !Array.isArray(optionValuesRaw) &&
        optionValuesRaw !== null
            ? Object.fromEntries(
                  Object.entries(optionValuesRaw as Record<string, unknown>).map(([k, v]) => [
                      k,
                      Array.isArray(v) ? v.map(String) : [],
                  ])
              )
            : undefined;

    const supabase = createAdminClient();
    const { data: sub, error: sErr } = await dbGetSubmission(supabase, ctx.orgId, submissionId);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    if (!sub) return jsonError("Not found", 404);

    const subRow = sub as { status: string; form_definition_version_id: string; payload: Record<string, unknown> };
    if (subRow.status !== "draft") {
        return jsonError("Only draft submissions can be submitted", 409);
    }

    const { data: version, error: vErr } = await dbGetVersion(supabase, ctx.orgId, subRow.form_definition_version_id);
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
    if (!version) return jsonError("Version not found", 404);

    const schemaJson = (version as { schema_json: unknown }).schema_json;
    const payloadToValidate =
        body.payload !== undefined && typeof body.payload === "object" && !Array.isArray(body.payload)
            ? (body.payload as Record<string, unknown>)
            : subRow.payload;

    const validated = validateFormPayload({
        schemaJson,
        payload: payloadToValidate,
        mode: "submit",
        optionValuesByFieldId,
    });
    if (!validated.ok) {
        return jsonValidationErrors("Invalid submission payload", validated.errors);
    }

    const finalPayload = validated.payload as unknown as Record<string, unknown>;

    const { data, error } = await dbSubmitSubmission(supabase, ctx.orgId, submissionId, finalPayload, ctx.userId);
    if (error) {
        if (error.code === "PGRST116" || error.message?.toLowerCase().includes("rows")) {
            return jsonError("Submission is not draft or was modified concurrently", 409);
        }
        if (error.message?.includes("form_submissions:")) {
            return jsonError(error.message, 409);
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const submittedRow = data as Record<string, unknown>;
    const sigRes = await persistFormSubmissionSignatures(supabase, {
        orgId: ctx.orgId,
        formSubmissionId: submissionId,
        schema: validated.schema,
        payload: validated.payload as FormPayload,
        signerIpHash: null,
    });
    if ("error" in sigRes) {
        return NextResponse.json({ error: sigRes.error, code: "SIGNATURE_PERSIST" }, { status: 500 });
    }

    await emitFormSubmittedSafe(submittedRow as Parameters<typeof emitFormSubmittedSafe>[0]);
    if (sigRes.inserted > 0) {
        await emitFormSignedSafe(submittedRow as Parameters<typeof emitFormSignedSafe>[0]);
    }

    return jsonData(data);
}
