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
import { apiOk, apiError } from "@/lib/api/apiResponse";
import { logCommandExecutePathDiagnostic } from "@/lib/platform/commands/runtime/commandExecuteCompatDiagnostics";
import { isCommandRuntimeFacadeExecutionSupported } from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import type { CommandInvocationOrigin } from "@/lib/platform/commands/runtime/commandRuntimeTypes";
import type { CommandOperationalContext } from "@/lib/platform/commands/runtime/commandRuntimeTypes";

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
 *
 * P1.S2: RegisteredAction capabilities execute through the Command Runtime facade,
 * which delegates once to `runRegisteredAction`.
 * P2.S1: `update_lead_status` / `close_lead` execute through the facade → Mutation Runtime.
 * Other keys keep `executeAdminAction`. `/api/admin/mutations/execute` remains unchanged.
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
    context?: {
        surface?: string;
        department_id?: string | null;
        work_unit_id?: string | null;
        section_key?: string | null;
        process_key?: string | null;
        origin?: string | null;
        /** Ignored if present — never authoritative. */
        actor?: unknown;
        org_id?: unknown;
        execution_owner?: unknown;
    };
    payload?: Record<string, unknown>;
    /** Optional preview mode — defaults to execute (preserves historical route). */
    mode?: "preview" | "execute";
    confirmation?: { confirmed?: boolean; confirmationValue?: string };
};

function mapOrigin(raw: string | null | undefined): CommandInvocationOrigin {
    const v = (raw ?? "").trim().toLowerCase();
    if (v === "bos") return "bos";
    if (v === "automation" || v === "workflow") return "automation";
    if (v === "api") return "api";
    if (v === "system") return "system";
    return "operator";
}

function mapOperationalContext(input: {
    surface?: string | null;
    workUnitId?: string | null;
}): CommandOperationalContext {
    const surface = (input.surface ?? "").trim();
    if (surface === "record_header" || surface === "focus_panel" || surface === "drawer") {
        return "focus_panel";
    }
    if (surface === "bos" || surface === "bos_recommendations") return "bos";
    if (surface === "queue" || surface === "queue_row") return "queue";
    if (input.workUnitId) return "work_unit";
    if (surface === "work_unit") return "work_unit";
    return "open";
}

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
    const mode = body.mode === "preview" ? "preview" : "execute";
    const facadeSupported = isCommandRuntimeFacadeExecutionSupported(actionKey);

    // P1.S2 RegisteredAction / P2.S1 Lead Status Mutation → Command Runtime (exactly once).
    // Client cannot select execution_owner / actor / org_id / domain.
    if (facadeSupported) {
        let delegated = false;
        try {
            const result = await executeCommandInvocation({
                request: {
                    invocation: {
                        commandKey: actionKey,
                        origin: mapOrigin(body.context?.origin),
                        operationalContext: mapOperationalContext({
                            surface: body.context?.surface,
                            workUnitId: body.context?.work_unit_id,
                        }),
                        surface: body.context?.surface ?? null,
                        workUnitId: body.context?.work_unit_id ?? null,
                        processKey: body.context?.process_key ?? null,
                        providedSubject: { entityType, entityId },
                        inputValues: body.payload,
                        // Intentionally omit client actor — server context wins inside execute.
                    },
                    mode,
                    confirmation:
                        body.confirmation && typeof body.confirmation.confirmed === "boolean"
                            ? {
                                  confirmed: body.confirmation.confirmed,
                                  confirmationValue: body.confirmation.confirmationValue,
                              }
                            : undefined,
                    executionSubject: { entityType, entityId },
                    departmentId: body.context?.department_id ?? null,
                    workUnitId: body.context?.work_unit_id ?? null,
                },
                server: {
                    orgId: runtimeCtx.orgId,
                    userId: runtimeCtx.userId,
                    accessScope: runtimeCtx.accessScope,
                    supabase,
                },
            });
            delegated = result.ok || ("delegated" in result && result.delegated === true);

            const elapsed = Date.now() - t0;
            if (elapsed > 200) {
                console.warn("[admin-timing] POST /api/admin/actions/execute (command-runtime)", {
                    ms: elapsed,
                    action_key: actionKey,
                    entity_type: entityType,
                });
            }

            const compatPath =
                result.executionOwner === "mutation_runtime"
                    ? result.diagnostics.some((d) =>
                          d.code.includes("child_enrollment")
                      )
                        ? "command_runtime_child_enrollment_mutation"
                        : "command_runtime_lead_status_mutation"
                    : "command_runtime_registered_action";

            const mutationDomain =
                result.executionOwner !== "mutation_runtime"
                    ? null
                    : result.diagnostics.some((d) => d.code.includes("child_enrollment"))
                      ? "enrollment_status"
                      : "lead_status";

            const adapterName =
                result.executionOwner === "mutation_runtime"
                    ? mutationDomain === "enrollment_status"
                        ? "child_enrollment_mutation"
                        : "lead_status_mutation"
                    : "registered_action";

            logCommandExecutePathDiagnostic({
                requestedKey: actionKey,
                path: compatPath,
                facadeSupported: true,
                origin: body.context?.origin,
                operationalContext: body.context?.surface,
                resultCategory: result.ok
                    ? "success"
                    : result.status === "blocked"
                      ? "blocked"
                      : "failure",
                invocationId: result.invocationId,
                mode,
                adapter: adapterName,
                mutationDomain,
                delegated,
            });

            if (!result.ok) {
                // After delegation, never fall through to executeAdminAction.
                if (result.mutationResult && result.mutationResult.status === "blocked") {
                    return apiError(
                        "ACTION_BLOCKED",
                        result.mutationResult.blockedReason || result.error.operatorMessage,
                        400,
                        {
                            blockers: [
                                {
                                    code: result.mutationResult.blockedCode,
                                    message: result.mutationResult.blockedReason,
                                },
                            ],
                            mutation_result: result.mutationResult,
                        },
                        { request, correlationId: result.invocationId }
                    );
                }
                if (result.actionResult && result.actionResult.ok === false) {
                    const runtimeResult = result.actionResult;
                    const details = {
                        ...(runtimeResult.blockers ? { blockers: runtimeResult.blockers } : {}),
                        ...(runtimeResult.completionRequirements ?
                            { completion_requirements: runtimeResult.completionRequirements }
                        :   {}),
                        ...(runtimeResult.actionPreflight ?
                            { action_preflight: runtimeResult.actionPreflight }
                        :   {}),
                    };
                    const blocked = Object.keys(details).length > 0;
                    return apiError(
                        blocked ? "ACTION_BLOCKED" : codeForStatus(runtimeResult.status),
                        runtimeResult.error || result.error.operatorMessage,
                        runtimeResult.status,
                        blocked ? details : undefined,
                        { request, correlationId: runtimeResult.correlationId }
                    );
                }
                const status =
                    result.status === "confirmation_required"
                        ? 400
                        : result.status === "unavailable"
                          ? 404
                          : result.status === "unauthorized"
                            ? 403
                            : 400;
                return apiError(
                    result.error.code === "confirmation_required"
                        ? "BAD_REQUEST"
                        : codeForStatus(status),
                    result.error.operatorMessage,
                    status,
                    undefined,
                    { request, correlationId: result.invocationId }
                );
            }

            // Success — RegisteredAction or Mutation Runtime
            if (result.executionOwner === "mutation_runtime" && result.mutationResult) {
                if (result.mutationResult.status === "committed") {
                    try {
                        revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
                    } catch (e) {
                        console.warn("[POST /api/admin/actions/execute] revalidateTag failed", e);
                    }
                }
                const mutationId =
                    result.mutationResult.status === "committed"
                        ? result.mutationResult.mutationId
                        : result.invocationId;
                return apiOk(
                    {
                        execution_result: {
                            kind: "mutation",
                            mutation_result: result.mutationResult,
                        },
                        affected_id: entityId,
                    },
                    { request, correlationId: mutationId }
                );
            }

            if (!result.actionResult) {
                return apiError("INTERNAL", "Action failed", 500, undefined, {
                    request,
                    correlationId: result.invocationId,
                });
            }

            try {
                revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
            } catch (e) {
                console.warn("[POST /api/admin/actions/execute] revalidateTag failed", e);
            }
            return apiOk(
                {
                    execution_result: result.actionResult.result.detail,
                    affected_id: result.actionResult.result.affectedId,
                },
                { request, correlationId: result.actionResult.correlationId }
            );
        } catch (e) {
            // If we already delegated, do not fall back — surface failure.
            if (delegated) {
                console.error(
                    "[POST /api/admin/actions/execute] command-runtime post-delegation failure",
                    e
                );
                return apiError("INTERNAL", "Action failed", 500, undefined, { request });
            }
            throw e;
        }
    }

    // Compatibility path: adapted / legacy / unregistered keys — executeAdminAction.
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

    logCommandExecutePathDiagnostic({
        requestedKey: actionKey,
        path: "execute_admin_action_fallback",
        facadeSupported: false,
        origin: body.context?.origin,
        operationalContext: body.context?.surface,
        resultCategory: result.ok ? "success" : "failure",
    });

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
