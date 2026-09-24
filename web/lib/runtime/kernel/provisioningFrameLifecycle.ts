/**
 * THE NAVIGATION-SCOPED FRAME LIFECYCLE — the transport half of two-phase seed emission.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
 *
 * The composer became progressive: geometry is decided at ~144ms (`geometry_identity_ms`, deployed
 * a5eb2f29) and the answer is published without waiting for facts that do not select it. The
 * TRANSPORT did not follow. `seedProvisioning` refuses to clobber a still-fresh entry and
 * `consumeFreshProvisioning` deletes on read with no update path, so one navigation could carry
 * exactly one payload — which meant the frame could not be sent until everything was ready.
 * Measured consequence: FIRST_AUTHORITATIVE_FRAME P50 1,983ms against a 1,000ms target, with the
 * card-producer join (740ms) sitting inside the server stream hold.
 *
 * This module adds the SECOND delivery, and nothing else. It is a courier:
 *
 *   - it does not decide facts, membership, stage, configuration, authorization or card semantics;
 *   - it does not fetch, poll, or re-derive anything;
 *   - it holds no truth of its own — only what a canonical owner handed it.
 *
 * ── WHY DELETE-ON-READ EXISTED, AND WHAT REPLACES IT ────────────────────────────────────────────
 *
 * `consumeFreshProvisioning` deletes because one logical answer belongs to one navigation and must
 * be claimed once, by the surface that owns the route — a second consumer would steal it and the
 * surface would wait seconds for an answer it already had. That reason is about the ENTRY, and it
 * survives here untouched: the entry cache is not modified by this file.
 *
 * What replaces the one-shot ASSUMPTION is scope. A frame is registered under its navigation key
 * and stays eligible for settlement until that navigation is abandoned or expires. Reading the
 * frame does not end its eligibility, because a late fact is not a second answer to the same
 * question — it is the rest of the answer to the same one.
 */
import {
    applyProvisioningSettlement,
    settlementMatchesFrame,
    type ProvisioningSettlementPatch,
} from "@/lib/runtime/provisioning/provisioningSettlement";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

/**
 * ABSENT      nothing registered for this navigation
 * FRAME_READY geometry + initial capability states delivered; facts may still be UNKNOWN
 * SETTLING    at least one settlement applied, more may follow
 * SETTLED     the navigation declared its settlement complete
 * EXPIRED     past its bounded lifetime; refuses further settlement and is swept
 */
export type ProvisioningFrameState = "ABSENT" | "FRAME_READY" | "SETTLING" | "SETTLED" | "EXPIRED";

export type ProvisioningNavigation = ProvisioningSettlementPatch["navigation"];

/**
 * A frame outlives its own navigation only briefly. This bound is what stops an abandoned
 * navigation — a fast subject switch, a closed tab, a settlement that never arrives — from holding
 * its answer forever. It is deliberately longer than a settlement normally takes and far shorter
 * than a session.
 */
export const FRAME_LIFETIME_MS = 120_000;

type FrameRecord = {
    key: string;
    navigation: ProvisioningNavigation;
    answer: ProvisioningAnswer;
    state: ProvisioningFrameState;
    registeredAt: number;
    lastSettledAt: number | null;
    appliedCount: number;
    refusedCount: number;
};

const frames = new Map<string, FrameRecord>();

/**
 * The navigation key. Every field participates: two of these are two different surfaces, and a key
 * that dropped one would let a settlement for the cohort-less answer reach the cohort one.
 */
export function navigationKey(nav: ProvisioningNavigation): string {
    return JSON.stringify([nav.target, nav.lens ?? null, nav.subject ?? null, nav.cohort ?? null, nav.aspect ?? null]);
}

function expireIfDue(rec: FrameRecord, now: number): FrameRecord {
    if (rec.state !== "EXPIRED" && now - rec.registeredAt > FRAME_LIFETIME_MS) rec.state = "EXPIRED";
    return rec;
}

/**
 * PHASE 1. Register the frame for a navigation.
 *
 * Re-registering the SAME navigation replaces the record, because a re-entered navigation composes
 * a fresh answer and the old one is not a truth worth preserving. Registering a DIFFERENT
 * navigation does not disturb this one — two tabs, or a back/forward pair, are separate frames.
 */
export function registerFrameReady(
    navigation: ProvisioningNavigation,
    answer: ProvisioningAnswer,
    now: number = Date.now(),
): ProvisioningFrameState {
    const key = navigationKey(navigation);
    frames.set(key, {
        key,
        navigation,
        answer,
        state: "FRAME_READY",
        registeredAt: now,
        lastSettledAt: null,
        appliedCount: 0,
        refusedCount: 0,
    });
    sweepExpiredFrames(now);
    return "FRAME_READY";
}

export type SettlementOutcome =
    | { applied: true; state: ProvisioningFrameState; answer: ProvisioningAnswer }
    | {
          applied: false;
          reason: "no_frame" | "expired" | "mismatch" | "no_change";
          state: ProvisioningFrameState;
      };

/**
 * PHASE 2. Apply one canonical capability result to the frame it belongs to.
 *
 * REFUSES rather than applies when the settlement is not this frame's: a different navigation, or a
 * different subject, stage or lens. That is the property that makes a rapid subject switch safe —
 * the in-flight settlement for the previous subject arrives, finds a frame it does not match, and
 * is dropped instead of overwriting the surface the operator is now looking at.
 *
 * MONOTONIC. `applyProvisioningSettlement` never lets a known field become unknown, so a duplicate
 * settlement changes nothing and an out-of-order one cannot undo a later result.
 */
/**
 * SETTLEMENT OUTCOME, VISIBLE IN PRODUCTION — diagnostic only, deliberately NOT NODE_ENV-gated.
 *
 * The mounted proof on deployed ed24d807 could not say whether a settlement was APPLIED, because
 * `ProvisioningSettlementSeed` discards this function's outcome and nothing recorded it. The only
 * observable was Financials sitting at `data-financials-empty="loading"` — and that one state has
 * FOUR independent causes (`loading`, `subjectStillResolving`, `provisioningAccount`,
 * `awaitingFirstAnswer`), so it cannot establish application either way. An effect that several
 * mechanisms can produce is not a proof of any one of them.
 *
 * So this records the OUTCOME and nothing else: the navigation key addressed, the key that was
 * found (or not), and the classification. NO payload, NO business values, NO subject content beyond
 * the navigation identity that is already in the URL. Bounded ring buffer, same shape as
 * `__ALLOY_REVEAL_GATE_DIAG__`, which exists for the same reason: the build that needs proving is
 * the production one.
 */
type SettlementDiagEvent = {
    t: number;
    /** The navigation key the settlement was addressed to. */
    addressed: string;
    /** applied | no_frame | expired | mismatch | no_change */
    outcome: string;
    /** How many frames were registered when it arrived — 0 explains a no_frame immediately. */
    frames: number;
};
function settlementDiag(): SettlementDiagEvent[] {
    if (typeof window === "undefined") return [];
    const w = window as Window & { __ALLOY_SETTLEMENT_DIAG__?: SettlementDiagEvent[] };
    if (!w.__ALLOY_SETTLEMENT_DIAG__) w.__ALLOY_SETTLEMENT_DIAG__ = [];
    return w.__ALLOY_SETTLEMENT_DIAG__;
}
function recordSettlementOutcome(addressed: string, outcome: string, frameCount: number): void {
    try {
        const buf = settlementDiag();
        if (buf.length > 200) buf.splice(0, buf.length - 100);
        buf.push({
            t: Math.round(typeof performance !== "undefined" ? performance.now() : Date.now()),
            addressed,
            outcome,
            frames: frameCount,
        });
    } catch {
        /* diagnostics are never load-bearing */
    }
}

export function applyFrameSettlement(
    patch: ProvisioningSettlementPatch,
    now: number = Date.now(),
): SettlementOutcome {
    const addressed = navigationKey(patch.navigation);
    const rec = frames.get(addressed);
    if (!rec) {
        recordSettlementOutcome(addressed, "no_frame", frames.size);
        return { applied: false, reason: "no_frame", state: "ABSENT" };
    }
    expireIfDue(rec, now);
    if (rec.state === "EXPIRED") {
        rec.refusedCount += 1;
        recordSettlementOutcome(addressed, "expired", frames.size);
        return { applied: false, reason: "expired", state: rec.state };
    }
    if (!settlementMatchesFrame(rec.answer, patch, rec.navigation)) {
        rec.refusedCount += 1;
        recordSettlementOutcome(addressed, "mismatch", frames.size);
        return { applied: false, reason: "mismatch", state: rec.state };
    }
    const next = applyProvisioningSettlement(rec.answer, patch, rec.navigation);
    if (next === rec.answer) {
        // A duplicate, or a patch carrying nothing this frame did not already know.
        recordSettlementOutcome(addressed, "no_change", frames.size);
        return { applied: false, reason: "no_change", state: rec.state };
    }
    rec.answer = next;
    rec.state = "SETTLING";
    rec.lastSettledAt = now;
    rec.appliedCount += 1;
    recordSettlementOutcome(addressed, "applied", frames.size);
    return { applied: true, state: rec.state, answer: next };
}

/** The navigation declares it has nothing further to deliver. SETTLED never reverts to FRAME_READY. */
export function markFrameSettled(
    navigation: ProvisioningNavigation,
    now: number = Date.now(),
): ProvisioningFrameState {
    const rec = frames.get(navigationKey(navigation));
    if (!rec) return "ABSENT";
    expireIfDue(rec, now);
    if (rec.state === "EXPIRED") return rec.state;
    rec.state = "SETTLED";
    return rec.state;
}

/** Read without claiming. Reading does NOT end settlement eligibility — that is the whole point. */
export function readFrame(
    navigation: ProvisioningNavigation,
    now: number = Date.now(),
): {
    state: ProvisioningFrameState;
    answer: ProvisioningAnswer | null;
    appliedCount: number;
    refusedCount: number;
} {
    const rec = frames.get(navigationKey(navigation));
    if (!rec) return { state: "ABSENT", answer: null, appliedCount: 0, refusedCount: 0 };
    expireIfDue(rec, now);
    if (rec.state === "EXPIRED") {
        return { state: "EXPIRED", answer: null, appliedCount: rec.appliedCount, refusedCount: rec.refusedCount };
    }
    return { state: rec.state, answer: rec.answer, appliedCount: rec.appliedCount, refusedCount: rec.refusedCount };
}

/** The operator left. Drop it now rather than waiting for the sweep. */
export function abandonNavigation(navigation: ProvisioningNavigation): void {
    frames.delete(navigationKey(navigation));
}

/** Bounded memory: nothing survives its lifetime, whether or not anyone came back for it. */
export function sweepExpiredFrames(now: number = Date.now()): number {
    let swept = 0;
    for (const [key, rec] of frames) {
        if (now - rec.registeredAt > FRAME_LIFETIME_MS) {
            frames.delete(key);
            swept += 1;
        }
    }
    return swept;
}

/** @internal test seam */
export function resetFrameLifecycleForTests(): void {
    frames.clear();
}

/** @internal test seam — proves no unbounded per-navigation memory. */
export function frameCountForTests(): number {
    return frames.size;
}
