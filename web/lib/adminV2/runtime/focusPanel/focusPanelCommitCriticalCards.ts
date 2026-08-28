/**
 * COMMIT-CRITICAL CARD REGISTRY (runtime-scalability-review.md gap 4).
 *
 * The one declaration of which Focus Panel cards are knowable at commit and how their models are
 * built from the commit-critical `OperationalContext`. The answer producer ITERATES this registry —
 * it no longer hardcodes per-card blocks — so promoting the next knowable card to ready-at-commit is
 * ONE entry here, not producer surgery.
 *
 * Each spec declares:
 *   `isKnowable(context)` — whether the card's FIRST-OPERATIONAL content is derivable from what the
 *     answer carried (never fabricate: an unknowable card stays reserved and Settlement fills it).
 *   `build(context)`      — the SHARED model builder both producers use, so the card is
 *     byte-identical pending → enriched.
 *
 * This is the declared-bindings seam the archetype work extends: when card data bindings move into
 * the published config, `isKnowable` becomes "are the card's declared commit-critical bindings
 * satisfiable from the answer" — the registry shape already asks exactly that question.
 */

import {
    buildChildrenCardModel,
    buildCurrentWorkCardModel,
    buildHouseholdCardModel,
    buildReadinessCardModel,
} from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

export type CommitCriticalCardSpec = {
    key: FocusPanelCardKey;
    isKnowable: (context: OperationalContext) => boolean;
    build: (context: OperationalContext) => FocusPanelCardModel;
};

/** The subject snapshot landed identity truth (contact and/or children roster) in the context. */
function hasSubjectIdentityTruth(context: OperationalContext): boolean {
    return (
        context.truth["person.primary_contact_name"] != null ||
        context.truth._inquiry_children != null
    );
}

export const COMMIT_CRITICAL_CARD_SPECS: readonly CommitCriticalCardSpec[] = [
    {
        /*
         * The answer OWNS Current Work — but owning a question is not the same as having answered it.
         *
         * This alone read `isKnowable: () => true` while every sibling below gates on truth it can
         * actually see. That is the whole defect: a card admitted to the ready set contributes no
         * `reserved` cell, so the grid stops holding a place for it and the card renders its
         * content perspective over a null runtime — a header with nothing under it, reported ready.
         *
         * Resolved-empty is still ready, and must stay ready: an answer that resolved and found no
         * active work carries a projection whose items are empty, and that is a legitimate empty
         * result, not missing data. What is NOT ready is an answer that has said nothing about the
         * work yet — no projection and no next action. Then the card reserves, the grid keeps the
         * cell, and Settlement fills it in place.
         */
        key: "current_work",
        isKnowable: (context) =>
            context.stageWorkRuntime != null || context.signals.work.nextActionLabel != null,
        build: (context) =>
            buildCurrentWorkCardModel({
                stageWorkRuntime: context.stageWorkRuntime ?? null,
                nextActionLabel: context.signals.work.nextActionLabel,
            }),
    },
    {
        key: "household",
        isKnowable: hasSubjectIdentityTruth,
        build: (context) => buildHouseholdCardModel(context.truth, context.subject.label),
    },
    {
        key: "children",
        isKnowable: (context) => context.truth._inquiry_children != null,
        build: (context) => buildChildrenCardModel(context.truth),
    },
    {
        // Readiness is a pure derivation over the same identity truth — knowable with the snapshot;
        // the attention blockers Settlement discovers later enrich the same cell in place.
        key: "readiness_kpi",
        isKnowable: hasSubjectIdentityTruth,
        build: (context) => buildReadinessCardModel(context),
    },
];

/**
 * WHY `scheduling` IS NOT HERE — a promotion that was made, certified, and then reverted.
 *
 * Its data precondition holds: `buildSchedulingCardModel` reads exactly one field,
 * `_inquiry_children`, which the answer already carries in the shape the shared builder consumes
 * (pinned by `focusPanelSchedulingCommitCritical.test.ts`). So it *could* be built at commit, and on
 * a default-composition surface it would rightly be.
 *
 * It is withheld because of the dormant-capability law established via `readiness_kpi`: commit-critical
 * work may only be spent on a card that participates in the RESOLVED composition. Whether it
 * participates is tenant-dependent — the Firefly published doc resolves to four cards and excludes
 * `scheduling` — and this producer cannot tell: `FocusPanelWorkModeFromAnswerInput` carries no
 * composition, and the published doc arrives from a SEPARATE client fetch
 * (`usePublishedFocusPanelSummaryDoc`) long after commit. Gating on it would make the commit path
 * wait on a network round trip, which is the opposite of the point.
 *
 * So promoting it buys nothing on the only certified tenant while spending commit work and inflating
 * `ready_count`/`card_ready` for a card that tenant never renders. Reverted rather than granted an
 * exception. Revisit when the resolved composition is available at this boundary — the Child second
 * surface, which uses the default composition, is the natural place to prove it.
 */

