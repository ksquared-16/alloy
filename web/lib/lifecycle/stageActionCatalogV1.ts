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
        candidate_actions.push({ action_key, recommendation, ...(override_label ? { override_label } : {}) });
    }

    return { version: 1, candidate_actions };
}

export function candidateActionForKey(
    catalog: StageActionCatalogV1 | null | undefined,
    actionKey: string
): StageCandidateAction | null {
    return catalog?.candidate_actions.find((a) => a.action_key === actionKey) ?? null;
}
