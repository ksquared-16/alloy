/**
 * Validate reconciliation payload against preflight candidates.
 */

import type {
    StageTransitionReconciliationPayload,
    StageTransitionReconciliationPreflight,
} from "@/lib/lifecycle/stageTransitionReconciliationTypes";

export function validateStageTransitionReconciliationPayload(
    preflight: StageTransitionReconciliationPreflight,
    payload: unknown,
): { ok: true; reconciliation: StageTransitionReconciliationPayload } | { ok: false; message: string } {
    if (!preflight.required) {
        return { ok: true, reconciliation: { work: [] } };
    }
    if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
        return { ok: false, message: "stage_transition_reconciliation is required" };
    }
    const raw = payload as Record<string, unknown>;
    const workRaw = raw.work;
    if (!Array.isArray(workRaw)) {
        return { ok: false, message: "stage_transition_reconciliation.work must be an array" };
    }

    const allowedIds = new Set(preflight.open_work.map((w) => w.work_id));
    const work: StageTransitionReconciliationPayload["work"] = [];

    for (const item of workRaw) {
        if (item == null || typeof item !== "object" || Array.isArray(item)) {
            return { ok: false, message: "Invalid work reconciliation entry" };
        }
        const o = item as Record<string, unknown>;
        const workId = typeof o.work_id === "string" ? o.work_id.trim() : "";
        const resolution = o.resolution;
        if (!workId || !allowedIds.has(workId)) {
            return { ok: false, message: `Invalid work_id in reconciliation: ${workId || "(empty)"}` };
        }
        if (resolution !== "completed" && resolution !== "skipped" && resolution !== "carry_forward") {
            return { ok: false, message: `Invalid resolution for work ${workId}` };
        }
        work.push({ work_id: workId, resolution });
    }

    if (work.length !== preflight.open_work.length) {
        return { ok: false, message: "Reconciliation must include every prior-stage open work item" };
    }

    let attention: StageTransitionReconciliationPayload["attention"];
    if (preflight.has_attention) {
        const att = raw.attention;
        if (att !== "cleared" && att !== "carry_forward") {
            return { ok: false, message: "attention resolution is required when needs-attention is active" };
        }
        attention = att;
    }

    return { ok: true, reconciliation: { work, ...(attention ? { attention } : {}) } };
}
