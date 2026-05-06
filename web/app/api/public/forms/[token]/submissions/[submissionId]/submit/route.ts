import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { validateFormPayload, type FormPayload } from "@/lib/forms/validateSubmission";
import { validateFormSchema } from "@/lib/forms/schema";
import { normalizeValidationErrors } from "@/lib/forms/validateSubmission";
import { ZodError } from "zod";
import { resolvePublicFormLinkByToken } from "@/lib/public/forms/resolvePublicFormLink";
import { isEmbedOriginAllowed, requestEmbedOrigin } from "@/lib/public/forms/embedOrigin";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import { hashClientIp } from "@/lib/public/forms/clientIpHash";
import { mergePublicSubmissionMeta } from "@/lib/public/forms/publicPayloadMeta";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";
import { applyFormLeadCaptureIntake } from "@/lib/forms/intake/applyFormLeadCaptureIntake";
import { persistFormSubmissionSignatures } from "@/lib/forms/signatures/persistFormSubmissionSignatures";
import { emitFormSignedSafe, emitFormSubmittedSafe } from "@/lib/forms/workflow/formSubmissionEvents";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/** POST /api/public/forms/[token]/submissions/[submissionId]/submit */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ token: string; submissionId: string }> }
) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return publicErr("Server misconfiguration", 500);
    }

    const { token: rawToken, submissionId } = await params;
    if (!submissionId || !UUID_RE.test(submissionId)) return publicErr("Invalid submission id", 400);

    const token = plaintextToken(rawToken ?? "");
    if (!token.trim()) return publicErr("Missing token", 400);

    const supabase = createServiceRoleClient();
    const resolved = await resolvePublicFormLinkByToken(supabase, token);
    if (!resolved.ok) {
        const codeMap = { NOT_FOUND: 404, INACTIVE: 403, EXPIRED: 403, NO_PUBLISHED_VERSION: 409 };
        return publicErr(resolved.error.message, codeMap[resolved.error.code] ?? 400, { code: resolved.error.code });
    }

    const ctx = resolved.value;
    const origin = requestEmbedOrigin(request);
    if (!isEmbedOriginAllowed(origin, ctx.allowedEmbedOrigins)) {
        return publicErr("Origin not allowed for this form embed", 403, { code: "ORIGIN_FORBIDDEN" });
    }

    let body: Record<string, unknown> = {};
    try {
        const parsed = await request.json();
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch {
        /* empty body */
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

    const { data: existing, error: loadErr } = await supabase
        .from("form_submissions")
        .select("*")
        .eq("id", submissionId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (loadErr) return publicErr(loadErr.message, 500);
    if (!existing) return publicErr("Not found", 404);

    const sub = existing as {
        status: string;
        created_via_public_link_id: string | null;
        form_definition_version_id: string;
        payload: Record<string, unknown>;
        person_id: string | null;
        customer_id: string | null;
        customer_member_id: string | null;
        opportunity_id: string | null;
    };

    if (sub.created_via_public_link_id !== ctx.linkId) return publicErr("Not found", 404);
    if (sub.status !== "draft") {
        return publicErr("Only draft submissions can be submitted", 409, { code: "NOT_DRAFT" });
    }
    if (sub.form_definition_version_id !== ctx.formDefinitionVersionId) {
        return publicErr("Submission version does not match current published link target", 409, {
            code: "VERSION_MISMATCH",
        });
    }

    const { data: ver } = await supabase
        .from("form_definition_versions")
        .select("schema_json")
        .eq("id", ctx.formDefinitionVersionId)
        .maybeSingle();
    const schemaJson = (ver as { schema_json?: unknown } | null)?.schema_json ?? ctx.schemaJson;

    try {
        validateFormSchema(schemaJson);
    } catch (e) {
        if (e instanceof ZodError) {
            return publicErr("Invalid published schema", 500, { validation_errors: normalizeValidationErrors(e) });
        }
        throw e;
    }

    const payloadToValidate =
        body.payload !== undefined && typeof body.payload === "object" && !Array.isArray(body.payload)
            ? (body.payload as Record<string, unknown>)
            : sub.payload;

    const validated = validateFormPayload({
        schemaJson,
        payload: payloadToValidate,
        mode: "submit",
        optionValuesByFieldId,
    });
    if (!validated.ok) {
        return publicErr("Invalid submission payload", 400, { validation_errors: validated.errors });
    }

    const ipHash = hashClientIp(request);
    let finalPayload: FormPayload = {
        ...validated.payload,
        meta: mergePublicSubmissionMeta(validated.payload.meta as Record<string, unknown> | undefined, ipHash),
    };

    let personId = sub.person_id;
    let customerId = sub.customer_id;
    let customerMemberId = sub.customer_member_id;
    let opportunityId = sub.opportunity_id;

    const metaRecord = ctx.linkMetadata as Record<string, unknown> | undefined;
    if (linkRequiresLeadCapture(metaRecord)) {
        try {
            const intakeResult = await applyFormLeadCaptureIntake(supabase, {
                orgId: ctx.orgId,
                defaultVerticalId:
                    typeof metaRecord?.default_vertical_id === "string" ? metaRecord.default_vertical_id : null,
                defaultOpportunityStatusKey:
                    typeof metaRecord?.default_opportunity_status_key === "string"
                        ? metaRecord.default_opportunity_status_key
                        : null,
                payload: finalPayload,
                existingPersonId: personId,
                existingCustomerId: customerId,
                existingCustomerMemberId: customerMemberId,
                existingOpportunityId: opportunityId,
            });
            personId = intakeResult.person_id;
            customerId = intakeResult.customer_id;
            customerMemberId = intakeResult.customer_member_id;
            opportunityId = intakeResult.opportunity_id;
            finalPayload = {
                ...finalPayload,
                meta: {
                    ...((finalPayload.meta ?? {}) as Record<string, unknown>),
                    intake_resolution_path: intakeResult.resolution_path,
                },
            };
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Intake failed";
            return publicErr(msg, 400, { code: "INTAKE_FAILED" });
        }
    }

    const { data: updated, error: upErr } = await supabase
        .from("form_submissions")
        .update({
            status: "submitted",
            payload: finalPayload as unknown as Record<string, unknown>,
            submitted_at: new Date().toISOString(),
            submitted_by_user_id: null,
            person_id: personId,
            customer_id: customerId,
            customer_member_id: customerMemberId,
            opportunity_id: opportunityId,
        })
        .eq("id", submissionId)
        .eq("org_id", ctx.orgId)
        .eq("created_via_public_link_id", ctx.linkId)
        .eq("status", "draft")
        .select("*")
        .single();

    if (upErr) {
        if (upErr.code === "PGRST116") {
            return publicErr("Submission could not be finalized (conflict or not draft)", 409);
        }
        if (upErr.message?.includes("form_submissions:")) {
            return publicErr(upErr.message, 409);
        }
        return publicErr(upErr.message, 400);
    }

    const submittedRow = updated as Record<string, unknown>;
    const meta = finalPayload.meta as Record<string, unknown> | undefined;
    const signerIpHash =
        typeof meta?.client_ip_hash === "string" && meta.client_ip_hash.trim() ? meta.client_ip_hash.trim() : ipHash;

    const sigRes = await persistFormSubmissionSignatures(supabase, {
        orgId: ctx.orgId,
        formSubmissionId: submissionId,
        schema: validated.schema,
        payload: finalPayload,
        signerIpHash,
    });
    if ("error" in sigRes) {
        return publicErr(sigRes.error, 500, { code: "SIGNATURE_PERSIST" });
    }

    await emitFormSubmittedSafe(submittedRow as Parameters<typeof emitFormSubmittedSafe>[0]);
    if (sigRes.inserted > 0) {
        await emitFormSignedSafe(submittedRow as Parameters<typeof emitFormSignedSafe>[0]);
    }

    const { org_id: _o, ...rest } = submittedRow;
    void _o;
    return publicOk(rest);
}
