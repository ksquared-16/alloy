"use client";

import { markTruthPatchMerged } from "@/lib/adminV2/viewModel/drawer/opportunity/drawerTruthPatchDiag";
import {
    drawerTruthPatchDescribesSubject,
    mergeDrawerTruthPatchFields,
    type DrawerTruthPatch,
} from "@/lib/adminV2/viewModel/drawer/opportunity/drawerTruthPatch";
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

/*
 * ONE ENTRY PER SUBJECT, CARRYING BOTH PROGRESSIVE PHASES.
 *
 * The action carrier and the progressive truth patch are two facts about the same selected subject,
 * arriving on the same stream and superseded by the same phase 2. Giving the patch its own store
 * would mean a second lifetime, a second retirement and a second chance for one of them to outlive
 * the drawer that replaced it. They share this entry, so `retireActionableDrawerCarrier` retires
 * both and neither can be read underneath a resolved drawer.
 *
 * Either half may be null: the carrier is usually first, but nothing in the wire guarantees it.
 */
type Entry = {
    carrier: ActionableDrawerCarrier | null;
    truthPatch: DrawerTruthPatch | null;
    storedAt: number;
};

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
    const prior = entries.get(key);
    entries.set(key, { carrier, truthPatch: prior?.truthPatch ?? null, storedAt: Date.now() });
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
    if (!entry?.carrier) return null;
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

/**
 * A progressive truth patch landed for this subject. Validated by the fetch seam before it reaches
 * here, and folded onto any patch already held so a second patch ADDS facts rather than replacing
 * the set — `mergeDrawerTruthPatchFields` is what keeps KNOWN from regressing.
 */
export function publishDrawerTruthPatch(patch: DrawerTruthPatch): void {
    const id = patch.subject.opportunity_id?.trim();
    if (!id) {
        markTruthPatchMerged(patch.subject?.opportunity_id, "REFUSED_SUBJECT");
        return;
    }
    const key = keyOf(id);
    const prior = entries.get(key);
    const merged: DrawerTruthPatch = {
        ...patch,
        fields: mergeDrawerTruthPatchFields(prior?.truthPatch?.fields ?? null, patch.fields),
    };
    /*
     * B4/B5 — the canonical merge ran. The outcome distinguishes a patch that added a fact from one
     * that restated what was already known, so "the merge happened" and "the merge changed
     * something" cannot be confused for each other in the measurement.
     */
    const priorKeys = Object.keys(prior?.truthPatch?.fields ?? {}).length;
    markTruthPatchMerged(id, Object.keys(merged.fields).length > priorKeys ? "APPLIED" : "NO_CHANGE");
    entries.set(key, { carrier: prior?.carrier ?? null, truthPatch: merged, storedAt: Date.now() });
    while (entries.size > MAX_ENTRIES) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
    }
    notify();
}

/**
 * The progressive truth for exactly this subject, or null. Re-validated on the way out as well as
 * on the way in, for the reason the carrier is: a late B patch must be unreadable under C whether
 * the bug is in the store or in the caller.
 */
export function peekDrawerTruthPatch(selected: {
    opportunityId: string | null | undefined;
}): DrawerTruthPatch | null {
    const id = selected.opportunityId?.trim();
    if (!id) return null;
    const entry = entries.get(keyOf(id));
    if (!entry?.truthPatch) return null;
    return drawerTruthPatchDescribesSubject(entry.truthPatch, selected) ? entry.truthPatch : null;
}
