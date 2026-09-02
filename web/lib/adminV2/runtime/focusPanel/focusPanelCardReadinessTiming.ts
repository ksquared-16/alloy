/**
 * Focus Panel CARD-READINESS marks — the half of the commit chain that needs card identity.
 *
 * Split out of `focusPanelCommitTiming` because that module is imported by `RuntimeKernelContext`,
 * which is on the QUEUE critical path. Resolving supersession needs `focusPanelCardRegistry`, and a
 * static import of it from the queue-reachable module put the entire card registry on the queue's
 * module graph — exactly what `tests/perf/queueCriticalGraphBudget` forbids, and what it caught.
 *
 * Nothing on the queue path imports this file. The chain state, and therefore the commit epoch every
 * mark is measured against, is still the single one owned by `focusPanelCommitTiming`.
 */
import { cardSuccessor } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { emitPerf } from "@/lib/perf/perfNamespaceLog";
import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import { perceivedMarksEnabled } from "@/lib/perf/perceivedPerf";
import { readCommitChain, resetCommitChainForSubject } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitTiming";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";

function now(): number | null {
    if (typeof performance === "undefined") return null;
    return performance.now();
}

function sinceMs(from: number | null, to: number | null): number | undefined {
    if (from == null || to == null) return undefined;
    return Math.round(to - from);
}

/**
 * WHICH CARDS THE RESOLVED COMPOSITION ACTUALLY PLACES, for the subject they were resolved against.
 *
 * Kept OUTSIDE the chain deliberately. The grid resolves a new subject's composition before the body
 * marks that subject's model — child effects run before parent effects — so participation for the
 * incoming subject would be wiped by the chain reset if it lived on the __chain. Pinning it to its own
 * subject id makes the two orders equivalent instead of racing.
 */
let participation: { subjectId: string; keys: ReadonlySet<string> } | null = null;

/**
 * The Focus Panel reports which card types it actually placed.
 *
 * READINESS AND PARTICIPATION ARE DIFFERENT QUESTIONS, and conflating them is what made settlement
 * over-report: a producer answers "is this model's truth known", and a composition answers "does a
 * cell for it exist". A drawer VM legitimately builds canonical models for consumers that are not
 * this surface — on the enrollment composition it produced 26 ready models for 8 placed cells — and
 * counting all of them described a panel the operator was not looking at.
 *
 * The fix belongs HERE rather than in any producer. Asking each producer "am I currently placed in
 * this Focus Panel?" would contaminate data ownership with surface participation; the grid already
 * holds both truths, so it simply says what it placed and the measurement intersects them.
 */
export function setFocusPanelCardParticipation(
    subjectId: string,
    placedCardKeys: Iterable<string>,
): void {
    if (!perceivedMarksEnabled()) return;
    participation = { subjectId, keys: new Set(placedCardKeys) };
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
    let __chain = readCommitChain();

    // A model for a different subject means attention moved — start a fresh chain. A warm/retained
    // path can reach here without a kernel commit mark; the chain then has no epoch and downstream
    // marks simply omit since_commit_ms (never fabricate one).
    if (__chain.subjectId != null && __chain.subjectId !== model.subject.id) {
        resetCommitChainForSubject(model.subject.id);
        __chain = readCommitChain();
    }
    __chain.subjectId = model.subject.id;


    const entityId = model.subject.id;
    const placed = participation && participation.subjectId === entityId ? participation.keys : null;
    const readyKeys: string[] = [];
    for (const [key, readiness] of model.cardReadiness) {
        if (readiness !== "ready") continue;
        /*
         * A RETIRED IDENTITY IS NOT A READY CARD.
         *
         * Every composed cell resolves through `normalizeFocusPanelCardKey`, where SUPERSESSION
         * OUTRANKS EXACT MATCH — so a globally superseded key is rewritten to its successor before
         * any cell exists, and no composition (a tenant's published doc or the platform's own
         * default doc) can produce a cell that answers to it. A producer may still key its map that
         * way: `current_work` remains a canonical DATA OWNER and other consumers read its model.
         * But the renderer will never ask for it, so counting it here reports a card the operator
         * cannot be looking at.
         *
         * That matters because THIS is the series the Grade-A protocol reads. `ready_count` and
         * `card_ready` are the evidence for "meaningfully complete at commit"; admitting an
         * unrenderable identity inflates both and overstates operator-visible readiness — on the
         * enrollment composition it counted the panel's largest cell as ready while that cell was
         * showing its reserved state.
         *
         * GLOBAL supersession only. `cardSuccessor` without a grain answers exactly that question
         * by design, and the asymmetry is what keeps this correct: a GRAIN-SCOPED supersession
         * (Employment → Staff, on `person` alone) still renders on every other grain, so excluding
         * it would under-report a card the operator really does see.
         *
         * This names no card — it asks the registry, so a future supersession inherits the rule.
         */
        if (cardSuccessor(key) !== null) continue;
        /*
         * A READY MODEL THE COMPOSITION DOES NOT PLACE IS NOT A READY CARD.
         *
         * Only filtered when the composition for THIS subject has actually been reported. Unknown
         * participation is not treated as "nothing is placed" — that would trade over-reporting for
         * silence, which is the worse error in a measurement — so the previous behaviour stands
         * until the grid has spoken for this subject.
         */
        if (placed && !placed.has(key)) continue;
        readyKeys.push(key);
    }

    if (model.source === "provisioning_answer" && __chain.modelAt == null) {
        __chain.modelAt = t;
        emitPerf("work-unit", "focus_panel_chain:model_commit_critical", {
            event: "model_commit_critical",
            entity_id: entityId,
            ready_count: readyKeys.length,
            since_commit_ms: sinceMs(__chain.commitAt, t),
        });
        if (t != null) alloyPerfSet("focus_panel_chain_model", t);
    }

    for (const key of readyKeys) {
        if (__chain.cardReadyAt.has(key)) continue;
        __chain.cardReadyAt.set(key, t ?? 0);
        emitPerf("work-unit", "focus_panel_chain:card_ready", {
            event: "card_ready",
            entity_id: entityId,
            card_key: key,
            source: model.source,
            since_commit_ms: sinceMs(__chain.commitAt, t),
        });
        if (t != null) alloyPerfSet(`focus_panel_chain_card_${key}`, t);
    }

    if (model.source === "drawer_vm" && __chain.settledAt == null) {
        __chain.settledAt = t;
        emitPerf("work-unit", "focus_panel_chain:settlement", {
            event: "settlement",
            entity_id: entityId,
            ready_count: readyKeys.length,
            since_commit_ms: sinceMs(__chain.commitAt, t),
            since_model_ms: sinceMs(__chain.modelAt, t),
        });
        if (t != null) alloyPerfSet("focus_panel_chain_settlement", t);
    }
}
