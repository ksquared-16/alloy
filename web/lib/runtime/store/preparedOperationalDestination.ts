/**
 * Prepared Operational Destination — the canonical prepared unit (Phase B · §2 of
 * docs/platform/runtime/workspace-operational-preparation-runtime.md).
 *
 * `PreparedWorkUnitSnapshot` is retired (§2.1). The prepared object is not a Work Unit — it is a
 * **destination**: Work Unit + Work View + queue state + selected subject + Focus-Panel mode,
 * addressed by its {@link DestinationId} (§1.3). It carries the atomic, **commit-critical-only**
 * Preparation answer (§3) — no Settlement — so the store can hold the queue window × mode set ×
 * adjacent views at once (§2.2).
 *
 * Immutable: a refresh produces a NEW destination; latest-wins swaps it whole — never a mixed
 * subject (§Invariant 3). Pure module (types + transitions); the store owns lifecycle.
 */

import type { DestinationId, FocusMode } from "@/lib/runtime/graph/destinationId";
import { destinationIdKey } from "@/lib/runtime/graph/destinationId";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

/** Preparation priority band (§5). 0 = the committing destination; 5 = idle/offscreen. */
export type PreparationPriority = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Status (§2.2 / §11 classification matrix):
 *  - `preparing` — inflight; no answer yet. Commit awaits it.
 *  - `ready`     — answer present, scope + composition + data coherent. Commit-ready.
 *  - `stale`     — data changed (metrics/rows) but still committable; refresh after commit (§11).
 *  - `invalid`   — scope/composition changed (graph or config revision); must re-prepare, never commit.
 */
export type DestinationStatus = "preparing" | "ready" | "stale" | "invalid";

/**
 * Reference into the shared subject truth (§9), NOT a copy. A subject's Work and Activity
 * destinations share one projection — no duplicated record fetch. Phase B models the ref minimally
 * (the committed subject id); the shared projection store arrives in Phase I.
 */
export type SharedSubjectProjectionRef = {
    subjectId: string | null;
};

export type PreparedOperationalDestination = {
    readonly id: DestinationId;
    /** `destinationIdKey(id)` — the store key + K2 resource key (memoized, §Invariant 4). */
    readonly key: string;
    /** The atomic commit-critical Preparation answer; `null` while preparing. */
    readonly answer: ProvisioningAnswer | null;
    readonly subjectRef: SharedSubjectProjectionRef;
    readonly focusMode: FocusMode | null;
    readonly status: DestinationStatus;
    readonly preparedAt: number;
    /** §1.4 scope coherence — O(1) equality check against the current graph's `revisionToken`. */
    readonly graphRevisionToken: string;
    /** §8 composition coherence — O(1) commit check against the current surface config revision. */
    readonly configRevision: number;
    /** §7/§10 data coherence (metrics/rows); `null` until known. */
    readonly dataRevision: number | null;
    readonly priority: PreparationPriority;
    /** One preparation per id (dedup, §2.2); the inflight answer promise while `preparing`. */
    readonly inflight: Promise<ProvisioningAnswer> | null;
};

export type PreparingInit = {
    id: DestinationId;
    graphRevisionToken: string;
    configRevision: number;
    priority: PreparationPriority;
    inflight: Promise<ProvisioningAnswer>;
    preparedAt: number;
};

/** Construct a `preparing` destination (answer not yet known). */
export function preparingDestination(init: PreparingInit): PreparedOperationalDestination {
    return {
        id: init.id,
        key: destinationIdKey(init.id),
        answer: null,
        subjectRef: { subjectId: init.id.subjectId },
        focusMode: init.id.focusMode,
        status: "preparing",
        preparedAt: init.preparedAt,
        graphRevisionToken: init.graphRevisionToken,
        configRevision: init.configRevision,
        dataRevision: null,
        priority: init.priority,
        inflight: init.inflight,
    };
}

/** The committed subject id an answer resolved to (the Record of Attention), if operational. */
export function subjectIdFromAnswer(answer: ProvisioningAnswer): string | null {
    return answer.terminal === "operational" ? answer.recordOfAttention.id : null;
}

/**
 * Transition a `preparing` destination to `ready` with its resolved answer. Immutable — returns a
 * new object. The subject ref is pinned from the answer's Record of Attention (§1.3: default-subject
 * resolved at prepare time becomes concrete), keeping the destination internally coherent.
 */
export function readyDestination(
    prev: PreparedOperationalDestination,
    answer: ProvisioningAnswer,
    dataRevision: number | null,
): PreparedOperationalDestination {
    const resolvedSubject = subjectIdFromAnswer(answer) ?? prev.id.subjectId;
    return {
        ...prev,
        id: { ...prev.id, subjectId: resolvedSubject },
        answer,
        subjectRef: { subjectId: resolvedSubject },
        status: "ready",
        dataRevision,
        inflight: null,
    };
}

/** Mark a destination `stale` (data changed; still committable, §11). Immutable. */
export function staleDestination(
    prev: PreparedOperationalDestination,
): PreparedOperationalDestination {
    return prev.status === "stale" ? prev : { ...prev, status: "stale" };
}

/** Mark a destination `invalid` (scope/composition changed; must re-prepare, §11). Immutable. */
export function invalidDestination(
    prev: PreparedOperationalDestination,
): PreparedOperationalDestination {
    return prev.status === "invalid" ? prev : { ...prev, status: "invalid", inflight: null };
}

/** A destination is committable when it is `ready` or `stale` and has an answer — never `invalid`. */
export function isCommittable(d: PreparedOperationalDestination): boolean {
    return (d.status === "ready" || d.status === "stale") && d.answer !== null;
}
