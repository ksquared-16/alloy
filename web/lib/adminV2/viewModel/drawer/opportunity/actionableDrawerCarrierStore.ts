"use client";

import {
    actionableCarrierDescribesSubject,
    type ActionableDrawerCarrier,
} from "@/lib/adminV2/viewModel/drawer/opportunity/actionableDrawerCarrier";

/**
 * WHERE PHASE 1 WAITS BETWEEN ARRIVING AND BEING MOUNTED.
 *
 * The drawer's view-model promise settles only on phase 2, so the carrier cannot be its return
 * value: it has to reach the panel by a side channel while that promise is still outstanding. This
 * is that channel and nothing more — it fetches nothing, resolves nothing and decides nothing. It
 * holds carriers the ONE existing drawer fetch seam already produced, and hands them back only to a
 * caller that can name the subject it is asking about.
 *
 * IT IS NOT A CACHE OF TRUTH. An entry is dropped the moment the full view model for that subject
 * arrives, so the carrier can never be the answer once a better one exists, and a carrier can never
 * outlive the lifecycle that produced it by more than the few entries below.
 *
 * HOVER MAY FILL IT; ONLY SELECTION MAY READ IT. Prewarm populates this store exactly as selection
 * does — that is the whole point of arriving before the click — but nothing here mounts anything.
 * The panel asks for the carrier belonging to the subject it has ALREADY committed to, so a
 * speculatively warmed carrier for a row the operator never clicked is simply never requested.
 */

type Entry = { carrier: ActionableDrawerCarrier; storedAt: number };

/**
 * Small on purpose. The operator is switching between a handful of rows; a larger store would only
 * extend how long a superseded carrier can sit around waiting to be asked for.
 */
const MAX_ENTRIES = 8;

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

/*
 * KEYED BY THE OPPORTUNITY ALONE.
 *
 * The participation lens is not part of the key because it is not part of the carrier's identity:
 * the header action set is resolved without any participation, so one opportunity has one action
 * set whatever lens asked for it. Including the lens made the hover-warmed carrier (which asserts
 * the row's own id) unreachable to the panel (which asserts none) — a store with a writer and no
 * reader, on deployed 8e749e03.
 */
function keyOf(opportunityId: string): string {
    return opportunityId;
}

function notify(): void {
    for (const l of [...listeners]) {
        try {
            l();
        } catch {
            /* one bad subscriber must not stop the others */
        }
    }
}

/**
 * WHEN PHASE 1 ARRIVED, for measurement.
 *
 * Deliberately NOT gated on NODE_ENV, by the same reasoning as the reveal-gate diagnostic: the
 * question "did the carrier arrive before the click, or after it" can only be answered on the build
 * the measurements actually run against. It records timing and counts — never an action's payload.
 */
function recordCarrierArrival(carrier: ActionableDrawerCarrier): void {
    if (typeof window === "undefined") return;
    try {
        const w = window as Window & {
            __ALLOY_CARRIER_DIAG__?: Array<Record<string, unknown>>;
        };
        w.__ALLOY_CARRIER_DIAG__ = w.__ALLOY_CARRIER_DIAG__ ?? [];
        w.__ALLOY_CARRIER_DIAG__.push({
            t: Math.round(performance.now()),
            subject: carrier.subject.opportunity_id,
            lens: carrier.subject.attention_subject_id,
            actions: carrier.header_menu.length,
            executable: carrier.header_menu.filter((a) => a.readiness === "CARRIER_SAFE").length,
            flushed_at_ms: carrier.flushed_at_ms,
        });
    } catch {
        /* a diagnostic may never break a delivery */
    }
}

/** Phase 1 landed. Validated by the fetch seam before it ever reaches here. */
export function publishActionableDrawerCarrier(carrier: ActionableDrawerCarrier): void {
    recordCarrierArrival(carrier);
    const key = keyOf(carrier.subject.opportunity_id);
    entries.set(key, { carrier, storedAt: Date.now() });
    while (entries.size > MAX_ENTRIES) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
    }
    notify();
}

/**
 * Phase 2 landed for this subject. The carrier has been superseded by a complete answer and must
 * not be readable any more — keeping it would let a stale action set reappear underneath a resolved
 * drawer on a later render.
 */
export function retireActionableDrawerCarrier(opportunityId: string | null | undefined): void {
    const id = opportunityId?.trim();
    if (!id) return;
    if (entries.delete(keyOf(id))) notify();
}

/** The carrier for exactly this subject, or null. Never an approximate match. */
export function peekActionableDrawerCarrier(selected: {
    opportunityId: string | null | undefined;
    attentionSubjectId?: string | null;
}): ActionableDrawerCarrier | null {
    const id = selected.opportunityId?.trim();
    if (!id) return null;
    const entry = entries.get(keyOf(id));
    if (!entry) return null;
    // Re-validated on the way out as well as on the way in: the guard that makes a late B carrier
    // unmountable under C is cheap, and running it at BOTH ends means neither a store bug nor a
    // caller bug alone can put one subject's actions under another's identity.
    return actionableCarrierDescribesSubject(entry.carrier, selected) ? entry.carrier : null;
}

export function subscribeToActionableDrawerCarriers(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Test seam only. Never called by the runtime. */
export function clearActionableDrawerCarriersForTests(): void {
    entries.clear();
    notify();
}
