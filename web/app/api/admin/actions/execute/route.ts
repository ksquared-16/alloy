import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { adminActionsOrgTag } from "@/lib/admin/actions/cacheTags";
import { executeAdminAction } from "@/lib/admin/actions/executeAdminAction";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { CREATE_LEAD_ACTION_ENTITY_ID } from "@/lib/admin/actions/createLeadActionConstants";

type ExecuteBody = {
    action_key?: string;
    entity_type?: string;
    entity_id?: string;
    context?: { surface?: string; department_id?: string | null; work_unit_id?: string | null; section_key?: string | null };
    payload?: Record<string, unknown>;
};

/** POST /api/admin/actions/execute — run a resolved action definition (v1). */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);

    let body: ExecuteBody;
    try {
        body = (await request.json()) as ExecuteBody;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const actionKey = body.action_key != null ? String(body.action_key).trim() : "";
    const entityType = body.entity_type != null ? String(body.entity_type).trim() : "";
    let entityId = body.entity_id != null ? String(body.entity_id).trim() : "";
    const createLead = actionKey === "create_lead";
    if (!actionKey || !entityType || (!entityId && !createLead)) {
        return NextResponse.json({ error: "action_key, entity_type, and entity_id are required" }, { status: 400 });
    }
    if (createLead && !entityId) {
        entityId = CREATE_LEAD_ACTION_ENTITY_ID;
    }

    const t0 = Date.now();
    const supabase = createAdminClient();
    const result = await executeAdminAction(supabase, { orgId: ctx.orgId, userId: ctx.userId, accessScope: scopeDimensionsFromAccess(access) }, {
        actionKey,
        entityType,
        entityId,
        context: body.context,
        payload: body.payload,
    });
    const ms = Date.now() - t0;
    if (ms > 200) {
        console.warn("[admin-timing] POST /api/admin/actions/execute", { ms, action_key: actionKey, entity_type: entityType });
    }

    if (!result.ok) {
        return NextResponse.json(
            { ok: false, correlation_id: result.correlation_id, error: result.error, execution_result: null },
            { status: result.status }
        );
    }
    /** Bust action resolver cache so headers / queue rows refresh after mutations. */
    try {
        revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
    } catch (e) {
        console.warn("[POST /api/admin/actions/execute] revalidateTag failed", e);
    }

    return NextResponse.json({
        ok: true,
        correlation_id: result.correlation_id,
        execution_result: result.execution_result,
    });
}
