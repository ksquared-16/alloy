import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { dbGetPublicLinkForForm, dbGetVersion, dbUpdateFormPublicLinkForForm } from "@/lib/admin/forms/formsAdminDb";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

async function validatePinnedVersion(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    formDefinitionId: string,
    versionId: string
): Promise<NextResponse | null> {
    const { data: ver, error } = await dbGetVersion(supabase, orgId, versionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!ver) return jsonError("pinned_form_definition_version_id not found", 404);
    const row = ver as { form_definition_id: string };
    if (row.form_definition_id !== formDefinitionId) {
        return jsonError("pinned version does not belong to this form", 400);
    }
    return null;
}

/** PATCH /api/admin/forms/[formId]/public-links/[linkId] — mutable fields only; no token rotation. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ formId: string; linkId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { formId: rawFormId, linkId: rawLinkId } = await params;
    const formId = parseUuidParam(rawFormId, "formId");
    if (formId instanceof NextResponse) return formId;
    const linkId = parseUuidParam(rawLinkId, "linkId");
    if (linkId instanceof NextResponse) return linkId;

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const supabase = createAdminClient();
    const { data: existing, error: exErr } = await dbGetPublicLinkForForm(supabase, ctx.orgId, formId, linkId);
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    if (!existing) return jsonError("Not found", 404);

    const patch: {
        is_active?: boolean;
        expires_at?: string | null;
        allowed_embed_origins?: string[] | null;
        metadata?: Record<string, unknown>;
        pinned_form_definition_version_id?: string | null;
    } = {};

    if ("is_active" in body) {
        if (typeof body.is_active !== "boolean") return jsonError("is_active must be boolean", 400);
        patch.is_active = body.is_active;
    }

    if ("expires_at" in body) {
        const raw = body.expires_at;
        if (raw === null) patch.expires_at = null;
        else if (typeof raw === "string" && raw.trim()) {
            const t = Date.parse(raw);
            if (Number.isNaN(t)) return jsonError("expires_at must be null or valid ISO 8601 datetime", 400);
            patch.expires_at = new Date(t).toISOString();
        } else {
            return jsonError("expires_at must be null or valid ISO 8601 datetime", 400);
        }
    }

    if ("allowed_embed_origins" in body) {
        const raw = body.allowed_embed_origins;
        if (raw === null) patch.allowed_embed_origins = null;
        else if (Array.isArray(raw) && raw.every((x) => typeof x === "string")) {
            patch.allowed_embed_origins = raw.map((s) => String(s).trim()).filter(Boolean);
        } else {
            return jsonError("allowed_embed_origins must be null or string[]", 400);
        }
    }

    if ("metadata" in body) {
        if (typeof body.metadata !== "object" || body.metadata === null || Array.isArray(body.metadata)) {
            return jsonError("metadata must be an object", 400);
        }
        const meta = { ...(body.metadata as Record<string, unknown>) };
        const label =
            typeof body.label === "string"
                ? body.label.trim()
                : typeof body.name === "string"
                  ? body.name.trim()
                  : "";
        if (label) meta.label = label;
        patch.metadata = meta;
    } else {
        const labelOnly =
            typeof body.label === "string"
                ? body.label.trim()
                : typeof body.name === "string"
                  ? body.name.trim()
                  : "";
        if (labelOnly) {
            const curMeta =
                existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
                    ? { ...(existing.metadata as Record<string, unknown>) }
                    : {};
            curMeta.label = labelOnly;
            patch.metadata = curMeta;
        }
    }

    if ("pinned_form_definition_version_id" in body) {
        const v = body.pinned_form_definition_version_id;
        if (v === null || v === undefined || v === "") {
            patch.pinned_form_definition_version_id = null;
        } else if (typeof v === "string") {
            const p = parseUuidParam(v, "pinned_form_definition_version_id");
            if (p instanceof NextResponse) return p;
            const bad = await validatePinnedVersion(supabase, ctx.orgId, formId, p);
            if (bad) return bad;
            patch.pinned_form_definition_version_id = p;
        } else {
            return jsonError("pinned_form_definition_version_id must be a UUID string or null", 400);
        }
    }

    if (Object.keys(patch).length === 0) return jsonError("No valid fields to update", 400);

    const { data, error } = await dbUpdateFormPublicLinkForForm(supabase, ctx.orgId, formId, linkId, patch);
    if (error) {
        if (error.code === "PGRST116") return jsonError("Not found", 404);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return jsonData(data);
}
