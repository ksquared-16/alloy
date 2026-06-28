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
import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";
import { runRegisteredAction } from "@/lib/adminV2/actions/actionExecutor";
import { CORRELATION_ID_HEADER, resolveCorrelationId } from "@/lib/api/correlationId";

/**
 * Phase 2 contract (transitional): success responses are additive — they include
 * the canonical `data` plus `correlation_id` and the `x-correlation-id` header,
 * while preserving the existing top-level fields (`execution_result`, etc.) that
 * ~15 client call sites still read. Failure/bad-request bodies are intentionally
 * left on the legacy shape until those consumers migrate (see audit / next batch).
 * @see docs/api/api-response-contract.md
 */
function withCorrelation(
    body: Record<string, unknown>,
    correlationId: string,
    init?: { status?: number }
): NextResponse {
    const res = NextResponse.json({ ...body, correlation_id: correlationId }, init);
    res.headers.set(CORRELATION_ID_HEADER, correlationId);
    return res;
}

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
    const runtimeCtx = { orgId: ctx.orgId, userId: ctx.userId, accessScope: scopeDimensionsFromAccess(access) };

    // Registered actions (e.g. update_status, create_lead) run through the canonical
    // Action Runtime so manual UI and BOS execute through the same validated path.
    // All other keys keep their existing executeAdminAction path unchanged.
    if (getRegisteredAction(actionKey)) {
        const runtimeResult = await runRegisteredAction(supabase, runtimeCtx, {
            actionKey,
            entityType,
            entityId,
            context: body.context,
            payload: body.payload,
        });
        const elapsed = Date.now() - t0;
        if (elapsed > 200) {
            console.warn("[admin-timing] POST /api/admin/actions/execute (runtime)", { ms: elapsed, action_key: actionKey, entity_type: entityType });
        }
        if (!runtimeResult.ok) {
            return withCorrelation(
                {
                    ok: false,
                    error: runtimeResult.error,
                    execution_result: null,
                    ...(runtimeResult.blockers ? { blockers: runtimeResult.blockers } : {}),
                    ...(runtimeResult.completionRequirements ?
                        { completion_requirements: runtimeResult.completionRequirements }
                    :   {}),
                    ...(runtimeResult.actionPreflight ? { action_preflight: runtimeResult.actionPreflight } : {}),
                },
                resolveCorrelationId(request, runtimeResult.correlationId),
                { status: runtimeResult.status }
            );
        }
        try {
            revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
        } catch (e) {
            console.warn("[POST /api/admin/actions/execute] revalidateTag failed", e);
        }
        return withCorrelation(
            {
                ok: true,
                data: {
                    execution_result: runtimeResult.result.detail,
                    affected_id: runtimeResult.result.affectedId,
                },
                execution_result: runtimeResult.result.detail,
                affected_id: runtimeResult.result.affectedId,
            },
            resolveCorrelationId(request, runtimeResult.correlationId)
        );
    }

    const result = await executeAdminAction(supabase, runtimeCtx, {
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
        return withCorrelation(
            {
                ok: false,
                error: result.error,
                execution_result: null,
                ...(result.completion_requirements ?
                    { completion_requirements: result.completion_requirements }
                :   {}),
                ...(result.effective_requirements ?
                    { effective_requirements: result.effective_requirements }
                :   {}),
                ...(result.action_preflight ? { action_preflight: result.action_preflight } : {}),
            },
            resolveCorrelationId(request, result.correlation_id),
            { status: result.status }
        );
    }
    /** Bust action resolver cache so headers / queue rows refresh after mutations. */
    try {
        revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
    } catch (e) {
        console.warn("[POST /api/admin/actions/execute] revalidateTag failed", e);
    }

    return withCorrelation(
        {
            ok: true,
            data: { execution_result: result.execution_result },
            execution_result: result.execution_result,
        },
        resolveCorrelationId(request, result.correlation_id)
    );
}
