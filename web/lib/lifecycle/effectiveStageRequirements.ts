/**
 * The one effective stage-requirement resolver (D-88, D-90, D-91, D-92).
 *
 * Before this module a consumer asking "what does this stage require?" had to read
 * `departments.metadata` itself and decide which of two sibling keys to trust —
 * `lifecycle_progression_requirements_v1` (labels) and, beneath it,
 * `lifecycle_builder_stage_field_rules_v1` (rule ids). Two consumers reading two keys
 * with two different precedence habits is how the same stage comes to require different
 * things depending on who asked.
 *
 * ## Precedence
 *
 * ```
 *   published BP stage requirements_v1
 *        │ present (D-90: even when empty)
 *        ├──────────────► canonical requirement set, source "business_process"
 *        │ absent
 *        └──────────────► single legacy compatibility projection
 *                         source "department" | "platform"
 * ```
 *
 * **Presence is authority, not content (D-90).** A stage whose author saved an empty
 * `requirements_v1` is saying "this stage requires nothing", and that must survive. If
 * emptiness fell back to legacy, deleting your last requirement would silently
 * resurrect the metadata requirements you thought you had replaced — and it would do so
 * only on stages that had legacy data, so it would look like a haunting rather than a
 * rule. That is why every check here is `!== null`, never truthiness and never
 * `.length`.
 *
 * **Stage-level authority, never row merging (D-91).** When canonical requirements
 * exist, the WHOLE legacy set for that stage is out. Merging would produce a set no one
 * authored: an operator who removed a legacy requirement canonically would still see it,
 * because the legacy row would merge back in.
 *
 * Legacy is compatibility only, and nothing here deletes it.
 *
 * Pure. No I/O, no clock.
 *
 * @see lib/lifecycle/stageRequirementsV1.ts — the canonical contract
 * @see lib/completion/lifecycleProgressionRequirementsConfig.ts — the legacy sources
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    effectiveFieldRulesForStage,
    effectiveLifecycleProgressionRequirementsForStage,
} from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import type { LifecycleProgressionRequirementRow } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { LifecycleStageFieldRules } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    parseLifecycleBuilderV1,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { StageRequirementV1, StageRequirementsV1 } from "@/lib/lifecycle/stageRequirementsV1";

/**
 * Where the effective answer came from.
 *
 * `business_process` is the canonical authority. `department` and `platform` are the two
 * legacy compatibility outcomes, preserved verbatim from the existing resolver so a
 * tenant that has not adopted canonical requirements reports exactly what it reported
 * before this slice.
 */
export type EffectiveRequirementSource = "business_process" | "department" | "platform";

export type EffectiveStageRequirements = {
    readonly source: EffectiveRequirementSource;
    /**
     * Kind-aware canonical rows. Populated only when the source is `business_process`.
     *
     * Empty under legacy sources on purpose: legacy cannot express a requirement KIND,
     * so synthesizing `kind: "field"` rows from it would invent a canonical statement
     * the tenant never authored and would make the two paths look interchangeable when
     * they are not.
     */
    readonly requirements: readonly StageRequirementV1[];
    /**
     * The legacy-shaped view, so existing consumers keep their contract.
     *
     * Under a legacy source this is the untouched legacy answer. Under the canonical
     * source it is projected DOWN from canonical rows, which is what lets an existing
     * consumer read canonical configuration without being rewritten.
     */
    readonly legacy: {
        readonly required: readonly LifecycleProgressionRequirementRow[];
        readonly recommended: readonly LifecycleProgressionRequirementRow[];
        readonly rules: LifecycleStageFieldRules;
    };
};

/**
 * Reads a stage's canonical section out of a parsed builder config.
 *
 * Returns `undefined` when the stage is not found or carries no section — both mean
 * "canonical has not spoken", which is the condition for legacy fallback. A stage that
 * exists with an empty section returns that section, and the difference is the whole of
 * D-90.
 */
export function canonicalStageRequirements(
    builder: LifecycleBuilderV1 | null | undefined,
    stageKey: string,
    processKey?: string,
): StageRequirementsV1 | undefined {
    if (!builder) return undefined;
    const key = stageKey.trim();
    if (!key) return undefined;

    for (const process of builder.processes) {
        if (processKey && process.key !== processKey) continue;
        for (const stage of process.stages) {
            if (stage.key === key) return stage.requirements_v1;
        }
    }
    return undefined;
}

/** Field-kind rule ids, split by level, for the legacy-shaped projection. */
function projectCanonicalToFieldRules(
    requirements: readonly StageRequirementV1[],
): LifecycleStageFieldRules {
    const required_rule_ids: string[] = [];
    const recommended_rule_ids: string[] = [];

    for (const req of requirements) {
        if (req.ref.kind !== "field") continue;
        // `enforced` is a stricter form of required, not a third bucket in this shape —
        // the legacy view has only two. Collapsing it to `recommended` would silently
        // weaken enforcement, so it collapses upward.
        const target = req.level === "recommended" ? recommended_rule_ids : required_rule_ids;
        if (!target.includes(req.ref.rule_id)) target.push(req.ref.rule_id);
    }

    return { required_rule_ids, recommended_rule_ids };
}

/**
 * The single entry point. Every consumer should call this rather than reading
 * `departments.metadata` requirement keys directly (D-92).
 */
export function resolveEffectiveStageRequirements(input: {
    readonly stage: LifecycleOperatorStage;
    readonly builder?: LifecycleBuilderV1 | null;
    readonly departmentMetadata?: Record<string, unknown> | null;
    readonly processKey?: string;
}): EffectiveStageRequirements {
    const canonical = canonicalStageRequirements(input.builder, input.stage, input.processKey);

    // D-90 / D-91: presence is authority and it is total. No merge, no length check.
    if (canonical !== undefined) {
        return {
            source: "business_process",
            requirements: canonical.requirements,
            legacy: {
                required: [],
                recommended: [],
                rules: projectCanonicalToFieldRules(canonical.requirements),
            },
        };
    }

    // D-92: the two legacy keys are read HERE and nowhere else. Both existing resolvers
    // already consult `lifecycle_progression_requirements_v1`; `effectiveFieldRulesForStage`
    // additionally reaches the builder stage field rules beneath it. Composing them in one
    // place is what stops two consumers from disagreeing.
    const labels = effectiveLifecycleProgressionRequirementsForStage(
        input.stage,
        input.departmentMetadata ?? null,
    );
    const fieldRules = effectiveFieldRulesForStage(input.stage, input.departmentMetadata ?? null);

    return {
        source: labels.source === "department" || fieldRules.source === "department" ? "department" : "platform",
        requirements: [],
        legacy: {
            required: labels.required,
            recommended: labels.recommended,
            rules: fieldRules.rules,
        },
    };
}

/**
 * The department-metadata entry point, and the ONLY place that reads a requirement key
 * out of `departments.metadata` (D-92).
 *
 * Callers hold department metadata already, so they pass that rather than pre-parsing a
 * builder. Keeping the three key reads — `lifecycle_builder_v1` for canonical and the
 * two legacy keys beneath — inside one function is what stops a second consumer from
 * inventing its own precedence.
 */
export function resolveEffectiveStageRequirementsForDepartment(
    stage: LifecycleOperatorStage,
    departmentMetadata?: Record<string, unknown> | null,
    processKey?: string,
): EffectiveStageRequirements {
    const meta = departmentMetadata ?? null;
    const builder = meta ? parseLifecycleBuilderV1(meta[LIFECYCLE_BUILDER_METADATA_KEY]) : null;
    return resolveEffectiveStageRequirements({ stage, builder, departmentMetadata: meta, processKey });
}

/** Canonical form requirements for a stage, in authored order. */
export function effectiveFormRequirements(
    effective: EffectiveStageRequirements,
): readonly { readonly requirement_id: string; readonly form_definition_id: string; readonly level: StageRequirementV1["level"] }[] {
    return effective.requirements
        .filter((r): r is StageRequirementV1 & { ref: { kind: "form"; form_definition_id: string } } =>
            r.ref.kind === "form",
        )
        .map((r) => ({
            requirement_id: r.requirement_id,
            form_definition_id: r.ref.form_definition_id,
            level: r.level,
        }));
}
