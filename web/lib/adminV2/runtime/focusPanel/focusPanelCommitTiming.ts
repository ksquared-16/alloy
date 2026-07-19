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

/**
 * Model boundary — the grid's input became available (commit-critical) or was superseded by the
 * settled model (enriched). Call ONLY when the model identity changes.
 *
 * Emits, at most once each per chain:
 *   `model_commit_critical` — the committed panel's model, with its ready set size.
 *   `settlement`            — the enriched model arrived (Settlement).
 * Plus one `card_ready` per card the FIRST time it reports ready — the per-card readiness series
 * that proves (or disproves) "meaningfully complete at commit".
 */
export function markFocusPanelWorkModeModel(model: FocusPanelWorkModeModel): void {
    if (!perceivedMarksEnabled()) return;
    const t = now();

    // A model for a different subject means attention moved — start a fresh chain. A warm/retained
    // path can reach here without a kernel commit mark; the chain then has no epoch and downstream
    // marks simply omit since_commit_ms (never fabricate one).
    if (chain.subjectId != null && chain.subjectId !== model.subject.id) {
        chain = emptyChain();
    }
    chain.subjectId = model.subject.id;

    const entityId = model.subject.id;
    const readyKeys: string[] = [];
    for (const [key, readiness] of model.cardReadiness) {
        if (readiness === "ready") readyKeys.push(key);
    }

    if (model.source === "provisioning_answer" && chain.modelAt == null) {
        chain.modelAt = t;
        emitPerf("work-unit", "focus_panel_chain:model_commit_critical", {
            event: "model_commit_critical",
            entity_id: entityId,
            ready_count: readyKeys.length,
            since_commit_ms: sinceMs(chain.commitAt, t),
        });
        if (t != null) alloyPerfSet("focus_panel_chain_model", t);
    }

    for (const key of readyKeys) {
        if (chain.cardReadyAt.has(key)) continue;
        chain.cardReadyAt.set(key, t ?? 0);
        emitPerf("work-unit", "focus_panel_chain:card_ready", {
            event: "card_ready",
            entity_id: entityId,
            card_key: key,
            source: model.source,
            since_commit_ms: sinceMs(chain.commitAt, t),
        });
        if (t != null) alloyPerfSet(`focus_panel_chain_card_${key}`, t);
    }

    if (model.source === "drawer_vm" && chain.settledAt == null) {
        chain.settledAt = t;
        emitPerf("work-unit", "focus_panel_chain:settlement", {
            event: "settlement",
            entity_id: entityId,
            ready_count: readyKeys.length,
            since_commit_ms: sinceMs(chain.commitAt, t),
            since_model_ms: sinceMs(chain.modelAt, t),
        });
        if (t != null) alloyPerfSet("focus_panel_chain_settlement", t);
    }
}
