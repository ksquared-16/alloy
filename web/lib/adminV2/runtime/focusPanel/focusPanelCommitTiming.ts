/**
 * Focus Panel commit-chain timing (A — preparation completeness must be MEASURED, not asserted).
 *
 * Marks the chain the certification protocol reads:
 *
 *   destination commit → FocusPanelWorkModeModel available → each card becoming ready → Settlement
 *
 * (The two upstream boundaries — commit itself and provisioning-answer availability — are already
 * marked by the kernel as `work_unit_establish:reveal` / `queue_hold:reveal`; this module anchors the
 * SAME commit moment as the chain epoch so every downstream mark carries `since_commit_ms`.)
 *
 * Same doctrine as `perceivedPerf`: a THIN wrapper over `emitPerf` + `alloyPerfSet` — no new
 * profiler, dev/staging gated, boundary-only (marks fire on model identity changes, never in a
 * render loop), ids/keys only (payloads pass the perf compactor's PII whitelist).
 *
 * Console filter: `[perf:work-unit] focus_panel_chain:*`. Marks mirror to
 * `window.__alloyPerf.marks` under `focus_panel_chain_*`.
 */

import { emitPerf } from "@/lib/perf/perfNamespaceLog";
import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import { perceivedMarksEnabled } from "@/lib/perf/perceivedPerf";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";

/**
 * WHY THE CHAIN COULD NOT ANSWER THE QUESTION IT WAS BUILT FOR.
 *
 * Every mark below was gated on `perceivedMarksEnabled()`, which resolves to
 * `NODE_ENV !== "production"`. Deployed staging IS a production build, so the entire chain —
 * destination commit, commit-critical model, per-card readiness, settlement — emitted NOTHING on
 * the only build the programme measures. Causal attribution was therefore impossible from the
 * browser, and three separate gating edges were proposed and refuted from HTTP timing instead.
 *
 * Recording is now additionally enabled when the route-timing diagnostic is on. That is the SAME
 * opt-in that already renders `#__alloy_route_timing` (ALLOY_ROUTE_TIMING=1, already set on
 * staging), so no new switch, env var or provider is introduced — the client simply observes
 * whether the server turned diagnostics on.
 *
 * CONSOLE emission stays dev-only: recording a number in memory is not the same as writing to a
 * production console, and only the former is needed to answer the question.
 */
function routeTimingDiagnosticOn(): boolean {
    if (typeof document === "undefined") return false;
    // Not memoized on `false`: the marks fire after parse, but the first call can precede the seed.
    return document.getElementById("__alloy_route_timing") != null;
}

/** Record the chain (in memory). Superset of console emission. */
export function chainRecordingEnabled(): boolean {
    return perceivedMarksEnabled() || routeTimingDiagnosticOn();
}

/** Write to console. Dev/staging-detail only — never widened by the diagnostic opt-in. */
export function chainConsoleEnabled(): boolean {
    return perceivedMarksEnabled();
}

/**
 * The transition log the causal question actually needs: WHICH key flipped LAST, and when.
 *
 * `cardReadyAt` records a first-ready timestamp per key, which answers "when" but not "in what
 * order relative to the commit predicate". This records each transition once, with the generation
 * it belongs to, so a late flip for a superseded destination can never be attributed to the
 * current one.
 */
export type FocusChainFlip = {
    key: string;
    from: "pending" | "ready";
    to: "ready";
    at: number;
    sinceCommitMs: number | undefined;
    generation: string | null;
    source: string;
};
export type FocusChainDiag = {
    generation: string | null;
    startAt: number | null;
    flips: FocusChainFlip[];
    modelAt: number | null;
    eligibleAt: number | null;
    commitStartAt: number | null;
    commitEndAt: number | null;
    settledAt: number | null;
    /** How many cells the composition actually placed (participation, not ready-model count). */
    placedCardCount?: number;
};

declare global {
    interface Window {
        __alloyFocusChain?: FocusChainDiag;
    }
}

export function chainDiag(): FocusChainDiag | null {
    if (typeof window === "undefined" || !chainRecordingEnabled()) return null;
    if (!window.__alloyFocusChain) {
        window.__alloyFocusChain = {
            generation: null, startAt: null, flips: [],
            modelAt: null, eligibleAt: null, commitStartAt: null, commitEndAt: null, settledAt: null,
        };
    }
    return window.__alloyFocusChain;
}

/** Reset the diagnostic for a new destination generation. */
export function chainDiagReset(generation: string | null, startAt: number | null): void {
    const d = chainDiag();
    if (!d) return;
    d.generation = generation;
    d.startAt = startAt;
    d.flips = [];
    d.modelAt = null;
    d.eligibleAt = null;
    d.commitStartAt = null;
    d.commitEndAt = null;
    d.settledAt = null;
}

type ChainState = {
    /** Named by the first model mark; a different subject starts a fresh chain. */
    subjectId: string | null;
    commitAt: number | null;
    modelAt: number | null;
    settledAt: number | null;
    cardReadyAt: Map<string, number>;
};

function emptyChain(commitAt: number | null = null): ChainState {
    return { subjectId: null, commitAt, modelAt: null, settledAt: null, cardReadyAt: new Map() };
}

/** One chain — commits are serialized by K3, so the current chain is the only live one. */
let chain: ChainState = emptyChain();

/**
 * THE CHAIN IS SHARED WITH `focusPanelCardReadinessTiming`, WHICH THE QUEUE PATH MUST NOT IMPORT.
 *
 * `RuntimeKernelContext` — the queue's own module graph — imports `markFocusPanelDestinationCommit`
 * from here. When the card-readiness marks lived in this file too, its `focusPanelCardRegistry`
 * import put the whole card registry on the QUEUE CRITICAL PATH, which
 * `tests/perf/queueCriticalGraphBudget` forbids and caught.
 *
 * Splitting keeps one chain and one epoch while letting the card half own the registry dependency:
 * the readiness module imports these accessors, and nothing here imports the readiness module, so
 * the queue graph cannot reach a card implementation through this file.
 */
export function readCommitChain(): ChainState {
    return chain;
}

export function resetCommitChainForSubject(subjectId: string): void {
    chain = emptyChain();
    chain.subjectId = subjectId;
    // Generation binding: Metric V2's destination identity, not a second one invented here.
    chainDiagReset(subjectId, null);
}

function now(): number | null {
    if (typeof performance === "undefined") return null;
    return performance.now();
}

function sinceMs(from: number | null, to: number | null): number | undefined {
    if (from == null || to == null) return undefined;
    return Math.round(to - from);
}

/**
 * K3 commit completed — the chain epoch. Wired in `RuntimeKernelContext.onCommitCompleted`, the
 * same boundary that marks `work_unit_establish:reveal`.
 */
export function markFocusPanelDestinationCommit(): void {
    if (!chainRecordingEnabled()) return;
    chain = emptyChain(now());
    // SUMMARY_READINESS_START — the chain epoch every downstream mark is measured against.
    chainDiagReset(null, chain.commitAt);
    if (chainConsoleEnabled()) {
        emitPerf("work-unit", "focus_panel_chain:destination_commit", { event: "destination_commit" });
    }
    if (chain.commitAt != null) alloyPerfSet("focus_panel_chain_commit", chain.commitAt);
}

