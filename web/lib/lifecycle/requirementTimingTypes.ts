/**
 * Requirement timing — when configured field rules apply (Phase 2).
 *
 * Persisted beside rule_levels_v1 in stage field-rule metadata.
 * Does not introduce a second requirement engine.
 */

import type { LifecycleStageFieldRulesStored } from "@/lib/lifecycle/lifecycleStageRequirementLevels";

export type RequirementTiming =
    | "record_creation"
    | "stage_progress"
    | "stage_exit"
    | "process_completion";

export type RequirementScope =
    | "record"
    | "primary_contact"
    | "any_child"
    | "each_child"
    | "relationship";

export type RequirementEnforcement = "informational" | "attention" | "blocking";

export type RequirementRuleMetaV1 = {
    timing?: RequirementTiming | RequirementTiming[];
    scope?: RequirementScope;
    enforcement?: RequirementEnforcement;
    applies_to_transition_keys?: string[];
    excluded_transition_keys?: string[];
};

export type RuleMetaV1 = {
    version: 1;
    by_rule_id: Record<string, RequirementRuleMetaV1>;
};

export type PublishedLifecycleFieldRules = LifecycleStageFieldRulesStored;

export type PublishedRequirementRuleMeta = RuleMetaV1 | null;

export type RequirementEvaluationMoment =
    | {
          kind: "record_creation";
          actionKey?: string;
      }
    | {
          kind: "stage_progress";
          stageKey: string;
      }
    | {
          kind: "stage_exit_progress";
          stageKey: string;
      }
    | {
          kind: "transition";
          fromStageKey: string;
          toStageKey: string;
          transitionKey?: string;
      }
    | {
          kind: "process_completion";
          processKey: string;
      };

export type SelectedRequirementRule = {
    ruleId: string;
    meta: RequirementRuleMetaV1 | undefined;
};

export type EffectiveRequirementMissing = {
    key: string;
    label: string;
    scope: string;
    targetIds?: string[];
    targetLabel?: string;
    enforcement: RequirementEnforcement;
    /** When timing is stage_exit — operator-facing progression hint. */
    progressionHint?: string;
};

export type EffectiveRequirementEvaluation = {
    satisfied: boolean;
    missing: EffectiveRequirementMissing[];
    blocking: EffectiveRequirementMissing[];
};
