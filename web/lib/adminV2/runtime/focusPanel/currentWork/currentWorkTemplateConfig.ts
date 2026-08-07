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
    kind?: "requirement" | "stage_work";
};

export type CurrentWorkTemplateActionRefConfig = {
    action_ref: string;
    override_label?: string;
};

export type CurrentWorkTemplateTransitionRefConfig = {
    transition_ref: string;
    override_label?: string;
};

export type CurrentWorkTemplateAlternatePathConfig =
    | CurrentWorkTemplateActionRefConfig
    | CurrentWorkTemplateTransitionRefConfig;

export type CurrentWorkTemplateConfigOverlay = {
    work_key: string;
    title?: string;
    description?: string;
    checklist?: CurrentWorkTemplateChecklistConfig[];
    /** Explicit execution mode from Work Template — drives Current Work prominence. */
    execution_mode?: "direct_action" | "outcome_led";
    primary_action?: CurrentWorkTemplateActionRefConfig;
    /** Explicit helpful actions — undefined allows legacy fallback; [] means explicitly none. */
    helpful_actions?: CurrentWorkTemplateActionRefConfig[];
    /** @deprecated Use helpful_actions. Kept for fixture compat during migration. */
    supporting_actions?: CurrentWorkTemplateActionRefConfig[];
    /** Explicit alternate paths — undefined allows legacy fallback; [] means explicitly none. */
    alternate_paths?: CurrentWorkTemplateAlternatePathConfig[];
    communication_actions?: Array<{ action_ref: string }>;
    /** Ordered outcome refs — undefined uses stage/runtime outcomes; [] means explicitly none. */
    outcome_refs?: Array<{ outcome_ref: string }>;
    /** Tracks whether helpful_actions was explicitly configured (including empty). */
    helpful_actions_explicit?: boolean;
    /** Tracks whether alternate_paths was explicitly configured (including empty). */
    alternate_paths_explicit?: boolean;
    /** Tracks whether outcome_refs was explicitly configured (including empty). */
    outcome_refs_explicit?: boolean;
};

/** Minimal action lookup for resolving action_ref → operator label. */
export type CurrentWorkActionRefLookup = ReadonlyMap<
    string,
    { key: string; label: string; description?: string | null }
>;

export function actionFromRef(
    lookup: CurrentWorkActionRefLookup | null | undefined,
    actionRef: string,
    overrideLabel?: string | null,
): { key: string; label: string; description?: string | null } | null {
    const ref = actionRef.trim();
    if (!ref) return null;
    const override = overrideLabel?.trim();
    if (override) return { key: ref, label: override };
    const resolved = lookup?.get(ref);
    if (resolved) return resolved;
    return { key: ref, label: ref.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) };
}

const TOUR_SCHEDULE_ACTION_REFS = new Set(["schedule_tour", "reschedule_tour"]);

/**
 * When Schedule/Reschedule Tour is already configured as helpful, also surface
 * Send Tour Invitation under Tour ▾ — same Tour action family, not a new command system.
 */
export function withTourInvitationCompanionRefs(
    refs: CurrentWorkTemplateActionRefConfig[] | undefined,
): CurrentWorkTemplateActionRefConfig[] | undefined {
    if (!refs || refs.length === 0) return refs;
    const hasSchedule = refs.some((row) => TOUR_SCHEDULE_ACTION_REFS.has(row.action_ref.trim()));
    const hasInvite = refs.some((row) => row.action_ref.trim() === "send_tour_invitation");
    if (!hasSchedule || hasInvite) return refs;
    return [...refs, { action_ref: "send_tour_invitation" }];
}

export function resolvedHelpfulActionRefs(
    config: CurrentWorkTemplateConfigOverlay | null | undefined,
): CurrentWorkTemplateActionRefConfig[] | undefined {
    if (!config) return undefined;
    const base =
        config.helpful_actions_explicit ? (config.helpful_actions ?? [])
        : config.helpful_actions !== undefined ? config.helpful_actions
        : config.supporting_actions;
    return withTourInvitationCompanionRefs(base);
}
