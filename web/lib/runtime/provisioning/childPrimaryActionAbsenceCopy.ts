/**
 * Client-safe copy for child primary-action absence reasons.
 *
 * Kept separate from `childGrainSurfaceComposition.ts` so presentation can render
 * absence copy without pulling the provisioning composition module into the
 * browser bundle (Turbopack previously emitted a broken client chunk with bare
 * `export` tokens when that module was imported from a `"use client"` surface).
 */

export type ChildPrimaryActionAbsence =
    | "stage_is_family_segment"
    | "stage_has_no_operating_plan"
    | "stage_configures_no_child_work"
    | "work_template_has_no_action";

export const CHILD_PRIMARY_ACTION_ABSENCE_COPY: Record<ChildPrimaryActionAbsence, string> = {
    stage_is_family_segment:
        "This child is at a stage whose work belongs to the family, so there is no child action here.",
    stage_has_no_operating_plan: "This stage has no operating plan, so no action is configured.",
    stage_configures_no_child_work: "This stage configures no work for a child.",
    work_template_has_no_action: "This stage's work configures no action.",
};
