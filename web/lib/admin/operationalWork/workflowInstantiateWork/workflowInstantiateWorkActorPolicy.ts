import type { OperationalWorkInstantiateProvenance } from "@/lib/admin/operationalWork/operationalWorkTypes";
import { isTaskAssistV1Uuid } from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import { buildInstantiateWorkWorkflowProvenance } from "@/lib/admin/operationalWork/workflowInstantiateWork/buildInstantiateWorkWorkflowProvenance";
import type { InstantiateWorkWorkflowSubjectMappingV1 } from "@/lib/admin/operationalWork/workflowInstantiateWork/types";

export type WorkflowInstantiateExecutorSource = "actor" | "record_owner";

export type ResolveWorkflowInstantiateActorResult =
    | {
          ok: true;
          executorUserId: string;
          actorUserId: string | null;
          executorSource: WorkflowInstantiateExecutorSource;
      }
    | { ok: false; error: "WORKFLOW_ACTOR_UNAVAILABLE"; message: string };

/** Operator-facing failure when neither actor nor record owner can execute instantiate_work. */
export const WORKFLOW_INSTANTIATE_ACTOR_UNAVAILABLE_MESSAGE =
    "instantiate_work requires payload.actor_user_id (event actor) or opportunity.assigned_to (record owner) as service executor — no synthetic system user is used";

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function isUuid(v: string): boolean {
    return isTaskAssistV1Uuid(v);
}

/**
 * Resolve who executes instantiateWorkFromDefinition.
 * Actor (created_by) and executor (service userId) are distinct when record owner fallback is used.
 */
export function resolveWorkflowInstantiateActor(
    workflowPayload: Record<string, unknown>,
): ResolveWorkflowInstantiateActorResult {
    const actorUserIdRaw = trimOrNull(workflowPayload.actor_user_id);
    const actorUserId = actorUserIdRaw && isUuid(actorUserIdRaw) ? actorUserIdRaw : null;

    if (actorUserId) {
        return { ok: true, executorUserId: actorUserId, actorUserId, executorSource: "actor" };
    }

    const opportunity =
        workflowPayload.opportunity != null && typeof workflowPayload.opportunity === "object"
            ? (workflowPayload.opportunity as Record<string, unknown>)
            : null;
    const ownerRaw = trimOrNull(opportunity?.assigned_to);
    const ownerUserId = ownerRaw && isUuid(ownerRaw) ? ownerRaw : null;

    if (ownerUserId) {
        return {
            ok: true,
            executorUserId: ownerUserId,
            actorUserId: null,
            executorSource: "record_owner",
        };
    }

    return {
        ok: false,
        error: "WORKFLOW_ACTOR_UNAVAILABLE",
        message: WORKFLOW_INSTANTIATE_ACTOR_UNAVAILABLE_MESSAGE,
    };
}

/** @deprecated Use resolveWorkflowInstantiateActor — returns executor user id only. */
export function resolveWorkflowInstantiateUserId(workflowPayload: Record<string, unknown>): string | null {
    const resolved = resolveWorkflowInstantiateActor(workflowPayload);
    return resolved.ok ? resolved.executorUserId : null;
}

/** Build persisted operational work provenance for workflow instantiate_work actions. */
export function buildWorkflowInstantiateOperationalProvenance(params: {
    workflowRunId: string;
    workflowId: string;
    actionOrder: number;
    workflowActionId?: string | null;
    eventId?: string | null;
    eventType?: string | null;
    actorUserId?: string | null;
    executorUserId: string;
    executorSource: WorkflowInstantiateExecutorSource;
    subjectMapping: InstantiateWorkWorkflowSubjectMappingV1;
    actionPayloadVersion: number;
}): OperationalWorkInstantiateProvenance {
    const base = buildInstantiateWorkWorkflowProvenance({
        workflowRunId: params.workflowRunId,
        actionOrder: params.actionOrder,
        actorUserId: params.actorUserId,
        workflowId: params.workflowId,
        eventId: params.eventId,
    });

    const provenance: OperationalWorkInstantiateProvenance = {
        source: "workflow",
        workflow_run_id: base.workflow_run_id,
        idempotency_key: base.idempotency_key,
        executor_user_id: params.executorUserId.trim(),
        workflow_id: params.workflowId.trim(),
        workflow_action_order: params.actionOrder,
        workflow_subject_mapping_mode: params.subjectMapping.mode,
        workflow_action_payload_version: params.actionPayloadVersion,
    };

    const actorUserId = trimOrNull(params.actorUserId);
    if (actorUserId) provenance.created_by_user_id = actorUserId;

    const eventId = trimOrNull(params.eventId);
    if (eventId) provenance.workflow_event_id = eventId;
    const eventType = trimOrNull(params.eventType);
    if (eventType) provenance.workflow_event_type = eventType;

    const actionId = trimOrNull(params.workflowActionId);
    if (actionId) provenance.workflow_action_id = actionId;

    return provenance;
}
