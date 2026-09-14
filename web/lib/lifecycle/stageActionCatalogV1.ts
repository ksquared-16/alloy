/**
 * Stage Action Catalog V1 — per-stage recommended action configuration.
 *
 * Stored as `stage.action_catalog_v1` in departments.metadata.lifecycle_builder_v1.
 * Drives the Action Evaluator: which actions are Recommended vs Ready for a stage.
 */

import {
    captureUnknownFields,
    serializeWithUnknownFields,
    withUnknownFields,
} from "@/lib/config/preserveUnknownFields";

export type StageActionRecommendation =
    | "recommended"      // Expected next step; shown prominently
    | "ready"            // Available but not the highlighted next step
    | "context_dependent"; // Depends on subject state; evaluator decides

export type StageCandidateAction = {
    /** Platform action key (must exist in platformActionCatalog or action_definitions). */
    action_key: string;
    recommendation: StageActionRecommendation;
    /** Optional operator-facing label override. Falls back to platform default. */
    override_label?: string;
    /**
     * WHICH of this stage's configured work the action operates on.
     *
     * Some platform actions take a work template as an INPUT rather than naming one — `stage_work.start`
     * is the reason this exists. It is deliberately generic ("start the work this stage says I may
     * start"), so the template must come from configuration; but nothing in this vocabulary could carry
     * one, and the action therefore required an argument no operator could supply. It was a production
     * capability with no authoring path: fully built, correctly refusing, and unreachable.
     *
     * Scoped to a KEY, never a payload bag. A configured action may name one of this stage's own work
     * templates and nothing else — validated at authoring against the stage's operating plan — so this
     * cannot become a way to hand arbitrary arguments to an arbitrary action.
     *
     * Consistent with the vocabulary already in the plan: outcome rule targets and attention rules both
     * carry `template_key` for the same reason, and work templates carry `outcome_refs` and
     * `action_ref`. Configuration selects; it never authors behaviour.
     */
    work_template_key?: string;
};

export type StageActionCatalogV1 = {
    version: 1;
    /** Ordered list of configured candidate actions for this stage. */
    candidate_actions: StageCandidateAction[];
    /**
     * Rows this parser could not read, kept verbatim so a save cannot destroy them.
     *
     * Same rule the requirement vocabulary now follows, and for the same measured reason: this
     * parser is an allowlist reconstructor and every writer persists the WHOLE document, so a row
     * it skipped was deleted by the next unrelated save. Nothing interprets these and no action
     * becomes executable because of them — an unreadable row is carried, not obeyed.
     */
    unreadable_actions?: readonly unknown[];
};

/** What this branch owns on the catalog itself; anything else is residue. */
const CATALOG_OWNED_KEYS = ["version", "candidate_actions"] as const;

/** What this branch owns on one candidate action row. */
const ACTION_OWNED_KEYS = ["action_key", "recommendation", "override_label", "work_template_key"] as const;

export function parseStageActionCatalogV1(raw: unknown): StageActionCatalogV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.version !== 1) return null;
    if (!Array.isArray(o.candidate_actions)) return null;

    const candidate_actions: StageCandidateAction[] = [];
    const unreadable_actions: unknown[] = [];
    for (const item of o.candidate_actions) {
        // A row this branch cannot read is KEPT, not skipped-and-lost. See `unreadable_actions`.
        if (item == null || typeof item !== "object" || Array.isArray(item)) {
            unreadable_actions.push(item);
            continue;
        }
        const row = item as Record<string, unknown>;
        const action_key = typeof row.action_key === "string" ? row.action_key.trim() : "";
        if (!action_key) {
            unreadable_actions.push(item);
            continue;
        }
        const rec = row.recommendation;
        const recommendation: StageActionRecommendation =
            rec === "recommended" || rec === "ready" || rec === "context_dependent"
                ? rec
                : "ready";
        const override_label =
            typeof row.override_label === "string" && row.override_label.trim()
                ? row.override_label.trim()
                : undefined;
        const work_template_key =
            typeof row.work_template_key === "string" && row.work_template_key.trim()
                ? row.work_template_key.trim()
                : undefined;
        // Residue rides on the parsed row so a newer writer's field survives this branch's save.
        candidate_actions.push(
            withUnknownFields(
                {
                    action_key,
                    recommendation,
                    ...(override_label ? { override_label } : {}),
                    ...(work_template_key ? { work_template_key } : {}),
                },
                captureUnknownFields(row, ACTION_OWNED_KEYS),
            ),
        );
    }

    const parsed: StageActionCatalogV1 = {
        version: 1,
        candidate_actions,
        ...(unreadable_actions.length ? { unreadable_actions } : {}),
    };
    return withUnknownFields(parsed, captureUnknownFields(o, CATALOG_OWNED_KEYS));
}

/**
 * Back to storable JSON, losslessly.
 *
 * Needed for the same reason `serializeStageRequirementsV1` is: the parsed catalog is a narrowed
 * reconstruction whose residue lives on a symbol, and `JSON.stringify` drops symbols. Emitting the
 * parsed object directly would therefore persist exactly the fields this branch happens to know —
 * which is how `work_template_key: "offer_spot"` was removed from live Waitlist configuration by a
 * save that had nothing to do with it.
 *
 * Unreadable rows are re-emitted last, unchanged. Order is not significant to any consumer; rows are
 * addressed by `action_key`.
 */
export function serializeStageActionCatalogV1(value: StageActionCatalogV1): Record<string, unknown> {
    const { unreadable_actions, ...owned } = value;
    return serializeWithUnknownFields({
        ...owned,
        candidate_actions: [
            ...value.candidate_actions.map((row) => serializeWithUnknownFields(row)),
            ...(unreadable_actions ?? []),
        ],
    } as StageActionCatalogV1);
}

export type CandidateActionWorkTemplateRefusal = {
    readonly action_key: string;
    readonly work_template_key: string;
    readonly code: "unknown_work_template";
    readonly detail: string;
};

/**
 * A configured action may only operate on work THIS STAGE produces.
 *
 * Scoped to the stage for the same reason a work requirement is: the action resolves the template
 * against the stage's own operating plan at runtime and refuses anything else, so a configuration
 * naming a template from elsewhere would author a control that can only ever fail. Refusing it at
 * authoring turns an operator's dead button into a sentence they can act on.
 *
 * Dependency-injected rather than reading the plan itself, so the rule stays pure and the caller
 * decides which stage is being judged.
 */
export function validateCandidateActionWorkTemplates(
    candidateActions: readonly StageCandidateAction[],
    stageWorkTemplateKeys: readonly string[],
): readonly CandidateActionWorkTemplateRefusal[] {
    const known = new Set(stageWorkTemplateKeys.map((k) => k.trim()).filter(Boolean));
    const refusals: CandidateActionWorkTemplateRefusal[] = [];
    for (const action of candidateActions) {
        const key = action.work_template_key?.trim();
        if (!key || known.has(key)) continue;
        refusals.push({
            action_key: action.action_key,
            work_template_key: key,
            code: "unknown_work_template",
            detail:
                `The action "${action.action_key}" is configured to start work "${key}", which this stage does not produce. ` +
                (known.size ?
                    `This stage's work is: ${[...known].sort().join(", ")}.`
                :   "This stage has no work configured yet."),
        });
    }
    return refusals;
}

export function candidateActionForKey(
    catalog: StageActionCatalogV1 | null | undefined,
    actionKey: string
): StageCandidateAction | null {
    return catalog?.candidate_actions.find((a) => a.action_key === actionKey) ?? null;
}
