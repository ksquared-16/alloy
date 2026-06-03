import type { InstantiateWorkResult } from "@/lib/admin/operationalWork/operationalWorkTypes";
import type { InstantiateWorkWorkflowActionPayloadV1 } from "@/lib/admin/operationalWork/workflowInstantiateWork/types";

export type InstantiateWorkWorkflowActionOutcome = "created" | "deduped" | "skipped" | "rejected";

export type InstantiateWorkWorkflowActionOutputs = {
    outcome: InstantiateWorkWorkflowActionOutcome;
    work_definition_key: string;
    subject_fingerprint?: string;
    dedupe_key?: string | null;
    /** Created work id. */
    work_id?: string;
    /** Existing open work id when deduped. */
    existing_work_id?: string;
    /** Back-compat alias for work_id / existing_work_id. */
    task_id?: string;
    reason?: string;
    message?: string;
    error?: string;
};

export function buildInstantiateWorkWorkflowActionOutputs(params: {
    parsed: InstantiateWorkWorkflowActionPayloadV1;
    result: InstantiateWorkResult;
    subjectFingerprint?: string;
    outcomeOverride?: InstantiateWorkWorkflowActionOutcome;
}): InstantiateWorkWorkflowActionOutputs {
    const outcome = params.outcomeOverride;
    const subjectFingerprint = params.subjectFingerprint;
    const key = params.parsed.work_definition_key;

    if (params.result.status === "created" || params.result.status === "aggregated") {
        const workId = params.result.work.id;
        return {
            outcome: outcome ?? "created",
            work_definition_key: key,
            subject_fingerprint: subjectFingerprint,
            dedupe_key: params.result.dedupeKey,
            work_id: workId,
            task_id: workId,
        };
    }

    if (params.result.status === "deduped") {
        const existingId = params.result.existingWork.id;
        return {
            outcome: outcome ?? "deduped",
            work_definition_key: key,
            subject_fingerprint: subjectFingerprint,
            dedupe_key: params.result.dedupeKey,
            existing_work_id: existingId,
            task_id: existingId,
            reason: params.result.reason,
        };
    }

    return {
        outcome: outcome ?? "rejected",
        work_definition_key: key,
        subject_fingerprint: subjectFingerprint,
        dedupe_key: params.result.dedupeKey,
        error: params.result.error,
        message: params.result.message,
        reason: params.result.reason,
    };
}

export function formatInstantiateWorkWorkflowActionLog(outputs: InstantiateWorkWorkflowActionOutputs): string {
    const base = `instantiate_work: ${outputs.outcome}`;
    const parts = [`definition=${outputs.work_definition_key}`];
    if (outputs.work_id) parts.push(`work_id=${outputs.work_id}`);
    if (outputs.existing_work_id) parts.push(`existing_work_id=${outputs.existing_work_id}`);
    if (outputs.dedupe_key) parts.push(`dedupe_key=${outputs.dedupe_key}`);
    if (outputs.subject_fingerprint) parts.push(`subject=${outputs.subject_fingerprint}`);
    if (outputs.reason) parts.push(`reason=${outputs.reason}`);
    if (outputs.message) parts.push(`message=${outputs.message}`);
    return `${base} (${parts.join(", ")})`;
}
