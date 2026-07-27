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
 * P2.S1 / P2.S2: Lead / Enrollment Mutation keys → facade → Mutation Runtime.
 * P3.S1: `add_parent_guardian` / `link_existing_person` → facade → Relationship Framework.
 * Other keys keep `executeAdminAction`. Dedicated relationship-actions routes remain.
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
    /** Correlated destructive/replacement preview token (P4). */
    preview_token?: string;
    previewToken?: string;
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
                    previewToken:
                        typeof body.preview_token === "string"
                            ? body.preview_token
                            : typeof body.previewToken === "string"
                              ? body.previewToken
                              : undefined,
                    executionSubject: { entityType, entityId },
                    departmentId: body.context?.department_id ?? null,
                    workUnitId: body.context?.work_unit_id ?? null,
                },
                server: {
                    orgId: runtimeCtx.orgId,
                    userId: runtimeCtx.userId,
                    actorRole: ctx.role,
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
                result.executionOwner === "relationship_runtime"
                    ? "command_runtime_relationship"
                    : result.executionOwner === "mutation_runtime"
                      ? result.diagnostics.some((d) => d.code.includes("child_enrollment"))
                          ? "command_runtime_child_enrollment_mutation"
                          : "command_runtime_lead_status_mutation"
                      : result.executionOwner === "admin_action"
                        ? "command_runtime_destructive_replacement"
                        : result.executionOwner === "tour_domain"
                          ? result.canonicalCapabilityKey === "cancel_tour"
                              ? "command_runtime_destructive_replacement"
                              : "command_runtime_tour"
                          : "command_runtime_registered_action";

            const mutationDomain =
                result.executionOwner !== "mutation_runtime"
                    ? null
                    : result.diagnostics.some((d) => d.code.includes("child_enrollment"))
                      ? "enrollment_status"
                      : "lead_status";

            const adapterName =
                result.executionOwner === "relationship_runtime"
                    ? "relationship"
                    : result.executionOwner === "mutation_runtime"
                      ? mutationDomain === "enrollment_status"
                          ? "child_enrollment_mutation"
                          : "lead_status_mutation"
                      : result.executionOwner === "admin_action"
                        ? result.ok && "deleteLeadResult" in result && result.deleteLeadResult
                          ? "delete_lead"
                          : "primary_contact_replacement"
                        : result.executionOwner === "tour_domain"
                          ? result.ok && "cancelTourResult" in result && result.cancelTourResult
                              ? "cancel_tour"
                              : "tour_reschedule"
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

            // Success — RegisteredAction, Mutation Runtime, or Relationship Runtime
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

            if (result.executionOwner === "relationship_runtime" && result.relationshipResult) {
                try {
                    revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
                } catch (e) {
                    console.warn("[POST /api/admin/actions/execute] revalidateTag failed", e);
                }
                return apiOk(
                    {
                        execution_result: {
                            kind: "relationship",
                            relationship_result: result.relationshipResult,
                        },
                        affected_id:
                            result.relationshipResult.person_id ??
                            result.relationshipResult.child_person_id ??
                            entityId,
                    },
                    { request, correlationId: result.invocationId }
                );
            }

            if (result.executionOwner === "admin_action" && result.status === "previewed") {
                return apiOk(
                    {
                        execution_result: {
                            kind:
                                result.canonicalCapabilityKey === "delete_lead"
                                    ? "destructive_preview"
                                    : "replacement_preview",
                            impact_preview: result.impactPreview,
                        },
                        affected_id: entityId,
                    },
                    { request, correlationId: result.invocationId }
                );
            }

            if (result.executionOwner === "admin_action" && result.deleteLeadResult) {
                try {
                    revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
                } catch (e) {
                    console.warn("[POST /api/admin/actions/execute] revalidateTag failed", e);
                }
                return apiOk(
                    {
                        execution_result: {
                            kind: "destructive_delete",
                            delete_lead_result: result.deleteLeadResult,
                        },
                        ok: true,
                        result: {
                            deleted: result.deleteLeadResult.deleted,
                            orphans: result.deleteLeadResult.orphans,
                            audit_logged: result.deleteLeadResult.audit_logged,
                        },
                        affected_id: result.deleteLeadResult.opportunity_id,
                    },
                    { request, correlationId: result.invocationId }
                );
            }

            if (result.executionOwner === "admin_action" && result.replacementResult) {
                try {
                    revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
                } catch (e) {
                    console.warn("[POST /api/admin/actions/execute] revalidateTag failed", e);
                }
                return apiOk(
                    {
                        execution_result: {
                            kind: "replacement",
                            replacement_result: result.replacementResult,
                        },
                        ok: true,
                        previous_primary_person_id:
                            result.replacementResult.previous_primary_person_id,
                        customer_id: result.replacementResult.customer_id,
                        primary_person_id: result.replacementResult.new_primary_person_id,
                        opportunities_updated: result.replacementResult.opportunities_updated,
                        opportunity_ids: result.replacementResult.opportunity_ids,
                        affected_id: result.replacementResult.new_primary_person_id,
                    },
                    { request, correlationId: result.invocationId }
                );
            }

            if (result.executionOwner === "tour_domain" && result.status === "previewed") {
                return apiOk(
                    {
                        execution_result: {
                            kind:
                                result.canonicalCapabilityKey === "cancel_tour"
                                    ? "destructive_preview"
                                    : "tour",
                            impact_preview: result.impactPreview,
                            tour_preview: result.tourPreview,
                        },
                        affected_id: entityId,
                    },
                    { request, correlationId: result.invocationId }
                );
            }

            if (result.executionOwner === "tour_domain" && result.cancelTourResult) {
                try {
                    revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
                } catch (e) {
                    console.warn("[POST /api/admin/actions/execute] revalidateTag failed", e);
                }
                return apiOk(
                    {
                        execution_result: {
                            kind: "tour_cancel",
                            cancel_tour_result: result.cancelTourResult,
                        },
                        ok: true,
                        booking: {
                            id: result.cancelTourResult.booking_id,
                            opportunity_id: result.cancelTourResult.opportunity_id,
                            status_key: result.cancelTourResult.status_key,
                            start_at: result.cancelTourResult.start_at,
                            end_at: result.cancelTourResult.end_at,
                            timezone: result.cancelTourResult.timezone,
                            location_id: result.cancelTourResult.location_id,
                            cancel_reason: result.cancelTourResult.cancel_reason,
                        },
                        message: result.cancelTourResult.message,
                        affected_id: result.cancelTourResult.booking_id,
                    },
                    { request, correlationId: result.invocationId }
                );
            }

            if (result.executionOwner === "tour_domain" && result.tourResult) {
                try {
                    revalidateTag(adminActionsOrgTag(ctx.orgId), "max");
                } catch (e) {
                    console.warn("[POST /api/admin/actions/execute] revalidateTag failed", e);
                }
                return apiOk(
                    {
                        execution_result: {
                            kind: "tour",
                            tour_result: result.tourResult.tour_result,
                        },
                        ok: true,
                        booking: {
                            id: result.tourResult.tour_result.booking_id,
                            opportunity_id: result.tourResult.tour_result.opportunity_id,
                            status_key: result.tourResult.tour_result.status_key,
                            start_at: result.tourResult.tour_result.start_at,
                            end_at: result.tourResult.tour_result.end_at,
                            timezone: result.tourResult.tour_result.timezone,
                            location_id: result.tourResult.tour_result.location_id,
                        },
                        message: result.tourResult.tour_result.message,
                        affected_id: result.tourResult.tour_result.booking_id,
                    },
                    { request, correlationId: result.invocationId }
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
