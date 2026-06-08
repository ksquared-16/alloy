import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { departmentIdAllowed, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { dbUpdateFormDefinition } from "@/lib/admin/forms/formsAdminDb";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import {
    buildLifecycleUsageMetadataPatch,
} from "@/lib/forms/lifecycle/formLifecycleUsageMetadata";
import { loadFormLifecycleCoveragePayload } from "@/lib/forms/lifecycle/loadFormLifecycleCoveragePayload";

function metaObject(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
}

/** GET /api/admin/forms/[formId]/lifecycle-coverage */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { formId: rawId } = await params;
    const formId = parseUuidParam(rawId, "formId");
    if (formId instanceof NextResponse) return formId;

    const supabase = createAdminClient();
    const payload = await loadFormLifecycleCoveragePayload(supabase, ctx.orgId, formId);
    if (!payload) return jsonError("Not found", 404);

    return jsonData(payload);
}

/** PATCH /api/admin/forms/[formId]/lifecycle-coverage — save lifecycle_usage_v1 (+ sync intake_intent). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const { formId: rawId } = await params;
    const formId = parseUuidParam(rawId, "formId");
    if (formId instanceof NextResponse) return formId;

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const usageRaw = body.lifecycle_usage_v1 ?? body.lifecycle_usage;
    if (!usageRaw || typeof usageRaw !== "object" || Array.isArray(usageRaw)) {
        return jsonError("lifecycle_usage_v1 is required", 400);
    }

    const department_id =
        typeof (usageRaw as { department_id?: unknown }).department_id === "string"
            ? (usageRaw as { department_id: string }).department_id.trim()
            : "";
    const stage_key =
        typeof (usageRaw as { stage_key?: unknown }).stage_key === "string"
            ? (usageRaw as { stage_key: string }).stage_key.trim()
            : "";
    const intake_intent =
        typeof (usageRaw as { intake_intent?: unknown }).intake_intent === "string"
            ? (usageRaw as { intake_intent: string }).intake_intent.trim()
            : "";
    const process_id =
        typeof (usageRaw as { process_id?: unknown }).process_id === "string"
            ? (usageRaw as { process_id: string }).process_id.trim() || null
            : null;

    if (!department_id) return jsonError("department_id is required", 400);
    if (!stage_key) return jsonError("stage_key is required", 400);
    if (!intake_intent) return jsonError("intake_intent is required", 400);

    if (!departmentIdAllowed(dim, department_id)) {
        return jsonError("Not found", 404);
    }

    const supabase = createAdminClient();

    const { data: existingForm, error: loadErr } = await supabase
        .from("form_definitions")
        .select("metadata")
        .eq("org_id", ctx.orgId)
        .eq("id", formId)
        .maybeSingle();

    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    if (!existingForm) return jsonError("Not found", 404);

    const existingMetadata = metaObject((existingForm as { metadata?: unknown }).metadata);

    let nextMetadata: Record<string, unknown>;
    try {
        nextMetadata = buildLifecycleUsageMetadataPatch(
            { department_id, stage_key, intake_intent, process_id },
            existingMetadata
        );
    } catch (e) {
        return jsonError(e instanceof Error ? e.message : "Invalid lifecycle usage", 400);
    }

    const { data: updated, error: updateErr } = await dbUpdateFormDefinition(supabase, ctx.orgId, formId, {
        metadata: nextMetadata,
    });

    if (updateErr) {
        if (updateErr.code === "PGRST116") return jsonError("Not found", 404);
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    const payload = await loadFormLifecycleCoveragePayload(supabase, ctx.orgId, formId);
    if (!payload) return jsonError("Not found", 404);

    return jsonData({
        form: updated,
        ...payload,
    });
}
