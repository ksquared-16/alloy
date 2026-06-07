/**
 * Opportunity drawer — future tab placeholder section (proof-only).
 *
 * Children, Parents, Communications, Tasks as widget placeholders for modules
 * not yet converged to layout runtime. Does not enable production cutover.
 */

import type { LayoutDoc } from "../layoutV2";
import { OPPORTUNITY_LAYOUT_ANCHOR_ENTITY } from "./opportunityRelationRegistry";
import { appendFutureModuleSection, futureModuleSection } from "./proofLayoutHelpers";

export const OPPORTUNITY_FUTURE_DRAWER_MODULES = [
    { key: "children", label: "Children" },
    { key: "parents", label: "Parents" },
    { key: "communications", label: "Communications" },
    { key: "tasks", label: "Tasks" },
] as const;

/** Append future module placeholders to an opportunity drawer LayoutDoc. */
export function appendOpportunityFutureTabPlaceholders(doc: LayoutDoc): LayoutDoc {
    return appendFutureModuleSection(
        doc,
        futureModuleSection(OPPORTUNITY_LAYOUT_ANCHOR_ENTITY, "future_tabs", [...OPPORTUNITY_FUTURE_DRAWER_MODULES]),
    );
}
