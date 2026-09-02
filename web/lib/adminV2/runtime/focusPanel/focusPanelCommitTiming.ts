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
    if (!perceivedMarksEnabled()) return;
    chain = emptyChain(now());
    emitPerf("work-unit", "focus_panel_chain:destination_commit", { event: "destination_commit" });
    if (chain.commitAt != null) alloyPerfSet("focus_panel_chain_commit", chain.commitAt);
}

