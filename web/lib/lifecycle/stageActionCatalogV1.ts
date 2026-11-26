/**
 * Stage Action Catalog V1 — per-stage recommended action configuration.
 *
 * Stored as `stage.action_catalog_v1` in departments.metadata.lifecycle_builder_v1.
 * Drives the Action Evaluator: which actions are Recommended vs Ready for a stage.
 */

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
};

export function parseStageActionCatalogV1(raw: unknown): StageActionCatalogV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.version !== 1) return null;
    if (!Array.isArray(o.candidate_actions)) return null;

    const candidate_actions: StageCandidateAction[] = [];
    for (const item of o.candidate_actions) {
        if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
        const row = item as Record<string, unknown>;
        const action_key = typeof row.action_key === "string" ? row.action_key.trim() : "";
        if (!action_key) continue;
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
        candidate_actions.push({
            action_key,
            recommendation,
            ...(override_label ? { override_label } : {}),
            ...(work_template_key ? { work_template_key } : {}),
        });
    }

    return { version: 1, candidate_actions };
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
