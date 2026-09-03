/**
 * ONE ANSWER TO "WHICH DOC IS THIS SURFACE COMPOSED FROM".
 *
 * The pending skeleton and the resolved body each decided this for themselves, and they
 * decided it differently:
 *
 *   skeleton  `publishedDoc ?? FOCUS_PANEL_SUMMARY_DEFAULT_DOC`
 *   body      `(isCaseGrain ? publishedDoc : null) ?? focusPanelSummaryDefaultDocForGrain(grain)`
 *
 * For a case subject those agree. For a CHILD subject they do not: the skeleton composed the
 * org's published enrollment layout while the body composed the child-grain default — different
 * cards, different geometry — so the panel drew one outline while loading and a different one on
 * settle. That is the reflow `FocusPanelSummarySkeleton` exists to prevent, reintroduced by the
 * two components answering the same question apart.
 *
 * `deriveFocusPanelSummaryCompositionInputs` already made the DERIVATION shared. This makes the
 * INPUT to that derivation shared too, which is the other half: composing the same way from
 * different documents is not parity.
 *
 * The grain gate itself is unchanged and load-bearing — see `focusPanelSummaryDefaultDocForGrain`
 * and the note in `OpportunityFocusPanelModeGrid`. `entity_layouts` addresses the Summary row by a
 * fixed key, so the published doc IS the enrollment composition; applying it to a person or child
 * subject would put family cards on a non-family surface.
 */

import { focusPanelSummaryDefaultDocForGrain } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import type { SummaryCompositionContext } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import type { OperationalSubjectType } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

/**
 * Does this subject compose from the org's PUBLISHED Surface, or from a code-owned default?
 *
 * The publication is addressed in `entity_layouts` by `entity_type = "opportunities"` and a fixed
 * layout key, so the doc an operator authors in `/organization/surfaces` IS the enrollment
 * composition for a family case. The question is which subjects that composition speaks for.
 *
 *   opportunity            — the case itself. Always.
 *   child WITH a family    — the Work Unit row an operator actually opens from the enrollment
 *                            queue. Record of Attention is the child; Record of Truth and
 *                            Settlement are the FAMILY OPPORTUNITY — the same record the published
 *                            Surface is authored against. Its code default
 *                            (`FOCUS_PANEL_SUMMARY_CHILD_WITH_FAMILY_COMPOSITION`) is already the
 *                            enrollment composition, hard-coded; honouring the publication here
 *                            replaces like with like, and is the difference between an operator's
 *                            published Surface reaching the Work Unit or being silently overridden.
 *   child WITHOUT a family — opened subject-first through the durable path. No Opportunity stands
 *                            behind it, so nothing family-scoped is authoritative.
 *   person, household      — no family opportunity behind them either, and this is the hazard the
 *                            gate was built for: applying the enrollment composition to a staff
 *                            member would put Household / Children / What's Next on them, so a
 *                            tenant who had ever opened the Surface Builder would break every
 *                            non-case surface while a tenant who had not would not. Two tenants,
 *                            two behaviours, no error. They keep their code-owned defaults.
 */
export function focusPanelSummaryUsesPublishedDoc(
    grain: OperationalSubjectType,
    context?: SummaryCompositionContext,
): boolean {
    if (grain === "opportunity") return true;
    if (grain === "child") return context?.familySettlement === true;
    return false;
}

/**
 * The Summary surface's active LayoutDoc, from the subject's grain and the org's publication.
 *
 * PURE. Returns null when the mode is not Summary — the other modes are not configurable
 * surfaces and compose from the code-owned mode grid instead.
 */
export function resolveFocusPanelSummaryActiveDoc(args: {
    isSummary: boolean;
    grain: OperationalSubjectType;
    /** The org's published Summary doc, when it has loaded. */
    publishedDoc: LayoutDoc | null | undefined;
    context?: SummaryCompositionContext;
}): LayoutDoc | null {
    if (!args.isSummary) return null;
    const published = focusPanelSummaryUsesPublishedDoc(args.grain, args.context)
        ? (args.publishedDoc ?? null)
        : null;
    return published ?? focusPanelSummaryDefaultDocForGrain(args.grain, args.context);
}
