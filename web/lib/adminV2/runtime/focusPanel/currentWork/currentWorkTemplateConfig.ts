/**
 * Optional work-template config overlay — adapts process/stage/work configuration
 * into Current Work without requiring schema churn on stage_operating_plan_v1.
 *
 * Production: populate from published operating plans + action placements as they evolve.
 * Tests: pass fixture overlays (enrollment, billing, etc.).
 */

export type CurrentWorkTemplateChecklistConfig = {
    key: string;
    label: string;
    required?: boolean;
    scope?: "record" | "child" | "person";
    action_ref?: string;
};

export type CurrentWorkTemplateConfigOverlay = {
    work_key: string;
    title?: string;
    description?: string;
    checklist?: CurrentWorkTemplateChecklistConfig[];
    primary_action?: { action_ref: string };
    supporting_actions?: Array<{ action_ref: string }>;
    alternate_paths?: Array<{ action_ref: string }>;
    communication_actions?: Array<{ action_ref: string }>;
};

/** Minimal action lookup for resolving action_ref → operator label. */
export type CurrentWorkActionRefLookup = ReadonlyMap<
    string,
    { key: string; label: string; description?: string | null }
>;

export function actionFromRef(
    lookup: CurrentWorkActionRefLookup | null | undefined,
    actionRef: string,
): { key: string; label: string; description?: string | null } | null {
    const ref = actionRef.trim();
    if (!ref) return null;
    return lookup?.get(ref) ?? { key: ref, label: ref.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) };
}
