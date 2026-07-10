import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    dbGetFormDefinition,
    dbListFormIdsWithPublishedVersion,
    dbListVersionsForForm,
    dbUpdateFormDefinition,
} from "@/lib/admin/forms/formsAdminDb";
import { deleteFormDefinitionForAdmin } from "@/lib/admin/forms/deleteFormDefinitionForAdmin";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

/** GET /api/admin/forms/[formId] */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { formId: rawId } = await params;
    const formId = parseUuidParam(rawId, "formId");
    if (formId instanceof NextResponse) return formId;

    const supabase = createAdminClient();
    const { data: form, error: formErr } = await dbGetFormDefinition(supabase, ctx.orgId, formId);
    if (formErr) return NextResponse.json({ error: formErr.message }, { status: 500 });
    if (!form) return jsonError("Not found", 404);

    const { data: versions, error: vErr } = await dbListVersionsForForm(supabase, ctx.orgId, formId);
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

    const { data: pubRows, error: pubErr } = await dbListFormIdsWithPublishedVersion(supabase, ctx.orgId);
    if (pubErr) return NextResponse.json({ error: pubErr.message }, { status: 500 });
    const publishedFormIds = new Set(
        (pubRows ?? []).map((r) => (r as { form_definition_id: string }).form_definition_id).filter(Boolean)
    );

    return jsonData({
        ...form,
        versions: versions ?? [],
        has_published_version: publishedFormIds.has(formId),
    });
}

/** PATCH /api/admin/forms/[formId] — admin only; key is immutable. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { formId: rawId } = await params;
    const formId = parseUuidParam(rawId, "formId");
    if (formId instanceof NextResponse) return formId;

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const patch: {
        name?: string;
        description?: string | null;
        kind?: string;
        is_active?: boolean;
        metadata?: Record<string, unknown>;
    } = {};

    if (body.name !== undefined) {
        if (typeof body.name !== "string" || !body.name.trim()) return jsonError("name must be a non-empty string", 400);
        patch.name = body.name.trim();
    }
    if (body.description !== undefined) {
        patch.description = typeof body.description === "string" ? body.description.trim() || null : null;
    }
    if (body.kind !== undefined) {
        const k = typeof body.kind === "string" ? body.kind.trim() : "";
        if (k !== "state" && k !== "center") return jsonError("kind must be state or center", 400);
        patch.kind = k;
    }
    if (body.is_active !== undefined) {
        if (typeof body.is_active !== "boolean") return jsonError("is_active must be boolean", 400);
        patch.is_active = body.is_active;
    }
    if (body.metadata !== undefined) {
        if (typeof body.metadata !== "object" || body.metadata === null || Array.isArray(body.metadata)) {
            return jsonError("metadata must be an object", 400);
        }
        patch.metadata = body.metadata as Record<string, unknown>;
    }

    if (Object.keys(patch).length === 0) return jsonError("No valid fields to update", 400);

    const supabase = createAdminClient();
    const { data, error } = await dbUpdateFormDefinition(supabase, ctx.orgId, formId, patch);
    if (error) {
        if (error.code === "PGRST116") return jsonError("Not found", 404);
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return jsonData(data);
}

/** DELETE /api/admin/forms/[formId] — hard-delete draft-only forms (admin). Published → use archive. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { formId: rawId } = await params;
    const formId = parseUuidParam(rawId, "formId");
    if (formId instanceof NextResponse) return formId;

    const supabase = createAdminClient();
    try {
        const result = await deleteFormDefinitionForAdmin(supabase, ctx.orgId, formId);
        if (!result.ok) return jsonError(result.message, result.status);
        return jsonData({ deleted: true, ...result.deleted });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
    }
}
