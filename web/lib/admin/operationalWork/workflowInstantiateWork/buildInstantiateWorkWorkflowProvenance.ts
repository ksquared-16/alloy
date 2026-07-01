import type { InstantiateWorkWorkflowProvenanceV1 } from "@/lib/admin/operationalWork/workflowInstantiateWork/types";

function trimOrNull(v: string | null | undefined): string | null {
    if (v == null) return null;
    const s = v.trim();
    return s || null;
}

/** Build stable workflow provenance + idempotency key for instantiate_work actions. */
export function buildInstantiateWorkWorkflowProvenance(params: {
    workflowRunId: string;
    actionOrder: number;
    actorUserId?: string | null;
    workflowId?: string | null;
    eventId?: string | null;
}): InstantiateWorkWorkflowProvenanceV1 {
    const workflowRunId = params.workflowRunId.trim();
    const actionOrder = Number.isFinite(params.actionOrder) ? Math.max(0, Math.floor(params.actionOrder)) : 0;
    const actorUserId = trimOrNull(params.actorUserId ?? null);
    const workflowId = trimOrNull(params.workflowId ?? null);
    const eventId = trimOrNull(params.eventId ?? null);

    const provenance: InstantiateWorkWorkflowProvenanceV1 = {
        source: "workflow",
        workflow_run_id: workflowRunId,
        idempotency_key: `${workflowRunId}:${actionOrder}`,
    };

    if (workflowId) provenance.workflow_id = workflowId;
    if (eventId) provenance.event_id = eventId;
    if (actorUserId) provenance.created_by_user_id = actorUserId;

    return provenance;
}
