import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import {
    resolveAssignedStatusKeysForStage,
    stageSavedStatusKeys,
} from "@/lib/lifecycle/lifecycleActivationStep3";

export type LifecycleStageStatusKeysSource = "explicit" | "payload" | "none";

export type LifecycleStageStatusKeysResolution = {
    keys: string[];
    source: LifecycleStageStatusKeysSource;
    payloadKeys: string[];
    explicitKeys: string[];
};

/** Normalize status keys for queue sync (trim, dedupe, preserve order). */
export function normalizeLifecycleStageStatusKeys(keys: readonly string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of keys) {
        const k = String(raw ?? "").trim();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(k);
    }
    return out;
}

/**
 * Resolve status keys for lifecycle stage queue save/sync.
 * Priority: explicit (board/card) → status-stages payload → none.
 */
export function resolveLifecycleStageStatusKeysForQueueSync(opts: {
    stageKey: string;
    explicitStatusKeys?: readonly string[];
    statusStagesPayload?: EnrollmentStatusStagesPayload | null;
}): LifecycleStageStatusKeysResolution {
    const stageKey = opts.stageKey.trim();
    const explicitKeys = normalizeLifecycleStageStatusKeys(opts.explicitStatusKeys ?? []);
    if (explicitKeys.length > 0) {
        return { keys: explicitKeys, source: "explicit", payloadKeys: [], explicitKeys };
    }

    const payload = opts.statusStagesPayload;
    if (!stageKey || !payload) {
        return { keys: [], source: "none", payloadKeys: [], explicitKeys: [] };
    }

    const assigned = resolveAssignedStatusKeysForStage(payload, stageKey, { activationOwned: true });
    const bucket = stageSavedStatusKeys(payload, stageKey);
    const payloadKeys = normalizeLifecycleStageStatusKeys(
        assigned.length > 0 ? assigned : bucket
    );
    if (payloadKeys.length > 0) {
        return { keys: payloadKeys, source: "payload", payloadKeys, explicitKeys: [] };
    }

    return { keys: [], source: "none", payloadKeys: [], explicitKeys: [] };
}

export class LifecycleStageStatusAssignmentHandoffError extends Error {
    readonly stageKey: string;
    readonly explicitKeys: string[];
    readonly payloadKeys: string[];

    constructor(stageKey: string, detail: { explicitKeys: string[]; payloadKeys: string[] }) {
        const sk = stageKey.trim() || "(unknown)";
        super(
            `No statuses resolved for stage "${sk}" during queue sync. ` +
                `explicit=[${detail.explicitKeys.join(", ")}] payload=[${detail.payloadKeys.join(", ")}]. ` +
                `Save statuses for this stage, then save Work Unit Queue again.`
        );
        this.name = "LifecycleStageStatusAssignmentHandoffError";
        this.stageKey = sk;
        this.explicitKeys = detail.explicitKeys;
        this.payloadKeys = detail.payloadKeys;
    }
}
