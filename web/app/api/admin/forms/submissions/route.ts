import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { validateFormPayload } from "@/lib/forms/validateSubmission";
import { dbGetVersion, dbInsertSubmission, dbListSubmissions } from "@/lib/admin/forms/formsAdminDb";
import { jsonData, jsonError, jsonValidationErrors, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

function readFilter(searchParams: URLSearchParams, key: string): string | undefined {
    const v = searchParams.get(key)?.trim();
    return v && v.length > 0 ? v : undefined;
}

function optionalFk(
    body: Record<string, unknown>,
    key: string
): { ok: true; value: string | null | undefined } | { ok: false; response: NextResponse } {
    if (!(key in body)) return { ok: true, value: undefined };
    const val = body[key];
    if (val === null) return { ok: true, value: null };
    if (typeof val !== "string") {
        return { ok: false, response: jsonError(`${key} must be a UUID string or null`, 400) };
    }
    const p = parseUuidParam(val, key);
    if (p instanceof NextResponse) return { ok: false, response: p };
    return { ok: true, value: p };
}

/** GET /api/admin/forms/submissions */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const filters: {
        form_definition_id?: string;
        form_definition_version_id?: string;
        status?: string;
        person_id?: string;
        customer_id?: string;
        customer_member_id?: string;
        opportunity_id?: string;
        limit?: number;
    } = {
        limit: Math.min(500, Math.max(1, Number(searchParams.get("limit") ?? "100") || 100)),
    };

    const fid = readFilter(searchParams, "form_definition_id");
    if (fid) {
        const p = parseUuidParam(fid, "form_definition_id");
        if (p instanceof NextResponse) return p;
        filters.form_definition_id = p;
    }
    const vid = readFilter(searchParams, "form_definition_version_id");
    if (vid) {
        const p = parseUuidParam(vid, "form_definition_version_id");
        if (p instanceof NextResponse) return p;
        filters.form_definition_version_id = p;
    }
    const st = readFilter(searchParams, "status");
    if (st) {
        if (st !== "draft" && st !== "submitted" && st !== "void") {
            return jsonError("status must be draft, submitted, or void", 400);
        }
        filters.status = st;
    }
    for (const [qkey, fkey] of [
        ["person_id", "person_id"],
        ["customer_id", "customer_id"],
        ["customer_member_id", "customer_member_id"],
        ["opportunity_id", "opportunity_id"],
    ] as const) {
        const raw = readFilter(searchParams, qkey);
        if (raw) {
            const p = parseUuidParam(raw, qkey);
            if (p instanceof NextResponse) return p;
            filters[fkey] = p;
        }
    }

    const supabase = createAdminClient();
    const { data, error } = await dbListSubmissions(supabase, ctx.orgId, filters);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const response = jsonData(data ?? []);
    response.headers.set("X-Admin-Org-Id", ctx.orgId);
    return response;
}

/** POST /api/admin/forms/submissions — draft submission (admin only). */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const versionIdRaw = typeof body.form_definition_version_id === "string" ? body.form_definition_version_id : "";
    const versionId = parseUuidParam(versionIdRaw, "form_definition_version_id");
    if (versionId instanceof NextResponse) return versionId;

    const payload =
        body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
            ? (body.payload as Record<string, unknown>)
            : { values: {} };

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
    const { data: version, error: vErr } = await dbGetVersion(supabase, ctx.orgId, versionId);
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
    if (!version) return jsonError("Version not found", 404);

    const vrow = version as { form_definition_id: string; schema_json: unknown };
    const validated = validateFormPayload({
        schemaJson: vrow.schema_json,
        payload,
        mode: "draft",
        optionValuesByFieldId,
    });
    if (!validated.ok) {
        return jsonValidationErrors("Invalid submission payload", validated.errors);
    }

    const meta =
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : {};

    const personFk = optionalFk(body, "person_id");
    if (!personFk.ok) return personFk.response;
    const customerFk = optionalFk(body, "customer_id");
    if (!customerFk.ok) return customerFk.response;
    const memberFk = optionalFk(body, "customer_member_id");
    if (!memberFk.ok) return memberFk.response;
    const oppFk = optionalFk(body, "opportunity_id");
    if (!oppFk.ok) return oppFk.response;

    const { data, error } = await dbInsertSubmission(supabase, {
        org_id: ctx.orgId,
        form_definition_id: vrow.form_definition_id,
        form_definition_version_id: versionId,
        status: "draft",
        payload: validated.payload as unknown as Record<string, unknown>,
        person_id: personFk.value,
        customer_id: customerFk.value,
        customer_member_id: memberFk.value,
        opportunity_id: oppFk.value,
        created_by_user_id: ctx.userId,
        metadata: meta,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return jsonData(data, { status: 201 });
}
