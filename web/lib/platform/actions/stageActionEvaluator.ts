/**
 * Stage Action Evaluator — resolves evaluation state for actions in stage context.
 *
 * Combines placement presence, stage candidate_actions config, and (optionally)
 * eligibility to produce a typed evaluation state for each action.
 *
 * States:
 *   recommended  — expected next step for this stage; preconditions met
 *   ready        — available and executable; not the highlighted next step
 *   warning      — executable with advisory notices (future: eligibility blockers with override)
 *   blocked      — cannot execute; reason surfaced to operator
 *   unavailable  — not applicable in this context (wrong grain, not configured)
 *
 * Doctrine: docs/platform/modules/business-process-execution-platform.md
 */

import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import { candidateActionForKey } from "@/lib/lifecycle/stageActionCatalogV1";
import { getPlatformAction, type PlatformActionGrain } from "@/lib/platform/actions/platformActionCatalog";

export type ActionEvaluationState =
    | "recommended"
    | "ready"
    | "warning"
    | "blocked"
    | "unavailable";

export type EvaluatedAction = {
    key: string;
    label: string;
    state: ActionEvaluationState;
    /** Human-readable reason — populated for blocked/warning states. */
    reason?: string;
    /** Populated when action key is known in platform catalog. */
    grain?: PlatformActionGrain;
};

export type EligibilityHint = {
    eligible: boolean;
    blockedReason?: string;
};

/**
 * Evaluate a single action in stage context.
 *
 * @param actionKey      - The action key to evaluate
 * @param stageConfig    - Stage's action_catalog_v1 (may be null if not yet configured)
 * @param subjectGrain   - The grain of the surface context (opportunity | ocm)
 * @param eligibility    - Optional eligibility hint from the action runtime
 * @param overrideLabel  - Optional label from stage config
 */
export function evaluateActionForStage({
    actionKey,
    stageCatalog,
    subjectGrain,
    eligibility,
    overrideLabel,
}: {
    actionKey: string;
    stageCatalog: StageActionCatalogV1 | null | undefined;
    subjectGrain: PlatformActionGrain | null | undefined;
    eligibility?: EligibilityHint | null;
    overrideLabel?: string | null;
}): EvaluatedAction {
    const platformAction = getPlatformAction(actionKey);
    const defaultLabel = overrideLabel ?? platformAction?.defaultLabel ?? actionKey;

    // Unavailable: wrong grain for this context
    if (subjectGrain && platformAction && platformAction.grain !== subjectGrain) {
        return { key: actionKey, label: defaultLabel, state: "unavailable", grain: platformAction.grain };
    }

    // Blocked: eligibility check failed
    if (eligibility && !eligibility.eligible) {
        return {
            key: actionKey,
            label: defaultLabel,
            state: "blocked",
            reason: eligibility.blockedReason,
            grain: platformAction?.grain,
        };
    }

    // Determine recommendation level from stage catalog
    const candidate = candidateActionForKey(stageCatalog, actionKey);
    const label = candidate?.override_label ?? defaultLabel;

    if (candidate?.recommendation === "recommended") {
        return { key: actionKey, label, state: "recommended", grain: platformAction?.grain };
    }

    return { key: actionKey, label, state: "ready", grain: platformAction?.grain };
}

/**
 * Evaluate a batch of resolved action keys in stage context.
 * Actions not in the stage catalog default to "ready".
 * Actions in the catalog that aren't in resolvedKeys are excluded (not surfaced).
 */
export function evaluateStageActions({
    resolvedActionKeys,
    stageCatalog,
    subjectGrain,
    eligibilityMap,
}: {
    resolvedActionKeys: string[];
    stageCatalog: StageActionCatalogV1 | null | undefined;
    subjectGrain: PlatformActionGrain | null | undefined;
    eligibilityMap?: Map<string, EligibilityHint>;
}): EvaluatedAction[] {
    return resolvedActionKeys.map((key) =>
        evaluateActionForStage({
            actionKey: key,
            stageCatalog,
            subjectGrain,
            eligibility: eligibilityMap?.get(key) ?? null,
        })
    );
}

/** Sort evaluated actions: recommended first, then ready, then warning, then blocked. */
export function sortEvaluatedActions(actions: EvaluatedAction[]): EvaluatedAction[] {
    const order: Record<ActionEvaluationState, number> = {
        recommended: 0,
        ready: 1,
        warning: 2,
        blocked: 3,
        unavailable: 4,
    };
    return [...actions].sort((a, b) => order[a.state] - order[b.state]);
}
