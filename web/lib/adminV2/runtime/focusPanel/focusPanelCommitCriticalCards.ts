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
    buildSchedulingCardModel,
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
        // The answer OWNS Current Work — always ready, even with no active stage work (honest empty).
        key: "current_work",
        isKnowable: () => true,
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
    {
        // Scheduling was waiting ~5.5s on the enriched drawer VM for data that fetch does not carry.
        // `buildSchedulingCardModel` reads exactly ONE field — `_inquiry_children` — the same field
        // `children` above already gates on, and the answer builds it in the shape the shared builder
        // consumes. Its collection helper hardcodes "Needs a room" for every child by design
        // (operational assignments do not exist until enrollment), so no assignment data is read at
        // all. Same builder + same input ⇒ byte-identical model, just at commit instead of settlement.
        //
        // Gated on the field's PRESENCE, not on a count: absent truth must stay reserved rather than
        // render "No children to assign", which would be a business conclusion drawn from missing data.
        key: "scheduling",
        isKnowable: (context) => context.truth._inquiry_children != null,
        build: (context) => buildSchedulingCardModel(context.truth),
    },
];
