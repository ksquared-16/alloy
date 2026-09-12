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

import { normalizeActionRefToIntentKey } from "@/lib/lifecycle/workTemplateActionIntentCatalog";

export type CurrentWorkTemplateActionRefConfig = {
    action_ref: string;
    override_label?: string;
    /**
     * The configured work this action operates on, when the action takes one as an input.
     *
     * Part of the action's IDENTITY, not decoration: `stage_work.start(offer_spot)` and
     * `stage_work.start(send_packet)` are two different operator intents that happen to share a
     * capability, and collapsing them by key alone would silently delete one.
     */
    work_template_key?: string;
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
    /**
     * The STAGE's configured candidate actions, as distinct from `supporting_actions`.
     *
     * Deliberately its own field. `supporting_actions` is the legacy fallback an explicit work list
     * must be able to suppress; these are actions an operator authored against the stage, which no
     * work template may erase. Writing them into the same field conflated "a default nobody chose"
     * with "a control somebody configured".
     */
    stage_actions?: CurrentWorkTemplateActionRefConfig[];
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

/**
 * The identity of a CONFIGURED action — capability plus the input it is bound to.
 *
 * `normalizeActionRefToIntentKey` is the platform's own answer to "are these the same action", and
 * it is used rather than replaced: aliases must still collapse onto their canonical intent. What it
 * cannot know is the binding, because an action that takes an input is not one operator intent but
 * a family of them — `stage_work.start(offer_spot)` and `stage_work.start(send_packet)` are
 * different things to do, and deduping by key alone would erase one of them.
 *
 * Deliberately NOT a JSON stringify of the row: the label is presentation and must not affect
 * whether two configurations are the same action.
 */
export function configuredActionIdentity(ref: CurrentWorkTemplateActionRefConfig): string {
    const intent = normalizeActionRefToIntentKey(ref.action_ref.trim());
    const bound = ref.work_template_key?.trim() ?? "";
    return bound ? `${intent}::${bound}` : intent;
}

/**
 * The helpful actions an operator sees — STAGE actions and WORK actions composed, not replaced.
 *
 * ── WHY THIS CHANGED ──
 *
 * Explicit Work Template `helpful_actions` used to REPLACE the stage's configured actions, and
 * `helpful_actions_explicit` is set on both branches above, so "the template said nothing" and "the
 * template said these four" were treated identically: in both cases the stage's actions vanished.
 *
 * That silently erased valid configuration. On the staging tenant the Waitlist stage configured
 * `stage_work.start(offer_spot)` — validated, persisted, published — and it never appeared, because
 * `review_waitlist_position` happened to declare four helpful actions of its own. The operator had
 * authored a control that the runtime discarded without a word.
 *
 * The two scopes answer different questions. A STAGE action is useful because of where the subject
 * IS; a WORK action is useful because of what is being DONE right now. Neither is a refinement of
 * the other, so neither may delete the other.
 *
 * ── PRECEDENCE AND ORDER ──
 *
 * Work-template actions come first and win an exact identity collision, because a binding authored
 * against the specific work is the more specific statement and may carry more specific input. Stage
 * actions that are not already represented follow, in their configured order. Nothing is sorted:
 * configuration order is an authored fact, and alphabetising it would discard it.
 */
export function resolvedHelpfulActionRefs(
    config: CurrentWorkTemplateConfigOverlay | null | undefined,
): CurrentWorkTemplateActionRefConfig[] | undefined {
    if (!config) return undefined;

    /*
     * THE WORK-TEMPLATE ANSWER, UNCHANGED — and `supporting_actions` is NOT part of it.
     *
     * That field is the LEGACY fallback: `undefined` means "no explicit set, use the old list" and
     * `[]` means "explicitly none". The invariant an operator cares about is that a command they
     * REMOVED does not come back, so an explicit set — empty or not — must never resurrect it. That
     * doctrine is older than this composition rule and is left exactly as it was.
     */
    const work =
        config.helpful_actions_explicit ? (config.helpful_actions ?? [])
        : config.helpful_actions !== undefined ? config.helpful_actions
        : config.supporting_actions;

    /*
     * THE STAGE'S OWN CONFIGURED ACTIONS — a different thing entirely, which is why they live in a
     * different field. A legacy default is something nobody chose; a stage action is something an
     * operator authored against this stage. Composing the first would undo a removal; composing the
     * second is the whole point.
     */
    const stage = config.stage_actions ?? [];
    if (!stage.length) return work;

    const seen = new Set<string>();
    const composed: CurrentWorkTemplateActionRefConfig[] = [];
    for (const ref of [...(work ?? []), ...stage]) {
        if (!ref.action_ref?.trim()) continue;
        const identity = configuredActionIdentity(ref);
        if (seen.has(identity)) continue;
        seen.add(identity);
        composed.push(ref);
    }
    return composed;
}
