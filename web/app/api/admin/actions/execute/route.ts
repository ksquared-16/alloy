import { NextRequest } from "next/server";
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
import { apiOk, apiError } from "@/lib/api/apiResponse";

/**
 * Phase 2B contract (fully migrated): this route emits the standard envelope.
 *
 * - Success: `{ ok: true, data: { execution_result, affected_id? }, correlation_id }`
 * - Failure: `{ ok: false, error: { code, message, details? }, correlation_id }`
 *
 * Action-blocked failures (unmet completion/preflight requirements) use the stable
 * `ACTION_BLOCKED` code and carry `completion_requirements` / `effective_requirements`
 * / `action_preflight` / `blockers` under `error.details`. Auth-gate responses
 * (401/403) remain owned by `requireAdminOrOps` / `adminContextFailureResponse`.
 * @see docs/api/api-response-contract.md
 * @see docs/api/actions-execute-envelope-audit.md
 */

/** Map a preserved HTTP status to a stable error code for the failure envelope. */
function codeForStatus(status: number): string {
    switch (status) {
        case 400:
            return "BAD_REQUEST";
        case 401:
            return "UNAUTHORIZED";
        case 403:
            return "FORBIDDEN";
        case 404:
            return "NOT_FOUND";
        case 409:
            return "CONFLICT";
        case 422:
            return "VALIDATION_ERROR";
        default:
            return status >= 500 ? "INTERNAL" : "BAD_REQUEST";
    }
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
        return apiError("BAD_REQUEST", "Invalid JSON", 400, undefined, { request });
    }

    const actionKey = body.action_key != null ? String(body.action_key).trim() : "";
    const entityType = body.entity_type != null ? String(body.entity_type).trim() : "";
    let entityId = body.entity_id != null ? String(body.entity_id).trim() : "";
    const createLead = actionKey === "create_lead";
    if (!actionKey || !entityType || (!entityId && !createLead)) {
        return apiError("BAD_REQUEST", "action_key, entity_type, and entity_id are required", 400, undefined, {
            request,
        });
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
            const details = {
                ...(runtimeResult.blockers ? { blockers: runtimeResult.blockers } : {}),
                ...(runtimeResult.completionRequirements ?
                    { completion_requirements: runtimeResult.completionRequirements }
                :   {}),
                ...(runtimeResult.actionPreflight ? { action_preflight: runtimeResult.actionPreflight } : {}),
            };
            const blocked = Object.keys(details).length > 0;
            return apiError(
                blocked ? "ACTION_BLOCKED" : codeForStatus(runtimeResult.status),
                runtimeResult.error || "Action failed",
                runtimeResult.status,
                blocked ? details : undefined,
                { request, correlationId: runtimeResult.correlationId }
            );
        }
        try {
            revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
        } catch (e) {
            console.warn("[POST /api/admin/actions/execute] revalidateTag failed", e);
        }
        return apiOk(
            {
                execution_result: runtimeResult.result.detail,
                affected_id: runtimeResult.result.affectedId,
            },
            { request, correlationId: runtimeResult.correlationId }
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
        const details = {
            ...(result.completion_requirements ?
                { completion_requirements: result.completion_requirements }
            :   {}),
            ...(result.effective_requirements ? { effective_requirements: result.effective_requirements } : {}),
            ...(result.action_preflight ? { action_preflight: result.action_preflight } : {}),
        };
        const blocked = Object.keys(details).length > 0;
        return apiError(
            blocked ? "ACTION_BLOCKED" : codeForStatus(result.status),
            result.error || "Action failed",
            result.status,
            blocked ? details : undefined,
            { request, correlationId: result.correlation_id }
        );
    }
    /** Bust action resolver cache so headers / queue rows refresh after mutations. */
    try {
        revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
    } catch (e) {
        console.warn("[POST /api/admin/actions/execute] revalidateTag failed", e);
    }

    return apiOk({ execution_result: result.execution_result }, { request, correlationId: result.correlation_id });
}
