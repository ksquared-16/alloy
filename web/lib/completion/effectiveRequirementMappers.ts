import type {
    BlockingLevel,
    RequirementValidationResult,
    RequirementViolation,
} from "@/lib/completion/requirementValidationTypes";
import type {
    EffectiveRequirementResolution,
    EffectiveRequirementSeverity,
    EffectiveRequirementSource,
    EffectiveRequirementViolation,
    EffectiveRequirementsResult,
} from "@/lib/completion/effectiveRequirementsTypes";

function blockingLevelToSeverity(level: BlockingLevel): EffectiveRequirementSeverity {
    switch (level) {
        case "hard_block":
            return "required";
        case "soft_warning":
            return "warning";
        case "recommendation":
            return "recommended";
        default:
            return "required";
    }
}

function defaultResolution(v: RequirementViolation): EffectiveRequirementResolution | undefined {
    if (v.field_key) {
        return { type: "field", field_key: v.field_key };
    }
    const actionKey = v.context?.action_key?.trim();
    if (actionKey) return { type: "action", action_key: actionKey };
    return undefined;
}

export function mapViolationToEffective(
    v: RequirementViolation,
    source: EffectiveRequirementSource
): EffectiveRequirementViolation {
    const severity = blockingLevelToSeverity(v.blocking_level);
    const requirement_level = v.context?.requirement_level;
    const rule_id = v.context?.rule_id?.trim() || undefined;
    return {
        field_key: v.field_key ?? v.label,
        label: v.label,
        severity,
        reason: v.missing_reason,
        source,
        resolution: defaultResolution(v),
        entity_type: v.entity_type,
        entity_id: v.entity_id,
        ...(requirement_level ? { requirement_level } : {}),
        ...(rule_id ? { rule_id } : {}),
    };
}

export function mapEffectiveRequirementsResultToValidation(
    result: EffectiveRequirementsResult
): RequirementValidationResult {
    const blocking: RequirementViolation[] = result.blocking.map((v) => ({
        entity_type: v.entity_type ?? "opportunity",
        entity_id: v.entity_id ?? "",
        field_key: v.field_key,
        label: v.label,
        requirement_type: "required_before_action",
        blocking_level: "hard_block",
        missing_reason: v.reason,
        context: {
            action_key: v.resolution?.action_key,
        },
    }));

    const warnings: RequirementViolation[] = result.recommended
        .filter((v) => v.severity === "warning")
        .map((v) => ({
            entity_type: v.entity_type ?? "opportunity",
            entity_id: v.entity_id ?? "",
            field_key: v.field_key,
            label: v.label,
            requirement_type: "required_on_save",
            blocking_level: "soft_warning",
            missing_reason: v.reason,
            context: {},
        }));

    const recommendations: RequirementViolation[] = result.recommended
        .filter((v) => v.severity === "recommended")
        .map((v) => ({
            entity_type: v.entity_type ?? "opportunity",
            entity_id: v.entity_id ?? "",
            field_key: v.field_key,
            label: v.label,
            requirement_type: "recommended_non_blocking",
            blocking_level: "recommendation",
            missing_reason: v.reason,
            context: {},
        }));

    return {
        ok: result.ok,
        blocking,
        warnings,
        recommendations,
    };
}

export function partitionValidationToEffective(
    validation: RequirementValidationResult,
    source: EffectiveRequirementSource
): { blocking: EffectiveRequirementViolation[]; recommended: EffectiveRequirementViolation[] } {
    const blocking = validation.blocking.map((v) => mapViolationToEffective(v, source));
    const recommended = [
        ...validation.warnings.map((v) => mapViolationToEffective(v, source)),
        ...validation.recommendations.map((v) => mapViolationToEffective(v, source)),
    ];
    return { blocking, recommended };
}

export function buildEffectiveRequirementsResult(input: {
    blocking: EffectiveRequirementViolation[];
    recommended: EffectiveRequirementViolation[];
    autoPopulate: EffectiveRequirementsResult["autoPopulate"];
    sourceSummary: EffectiveRequirementsResult["sourceSummary"];
}): EffectiveRequirementsResult {
    return {
        ok: input.blocking.length === 0,
        blocking: input.blocking,
        recommended: input.recommended,
        autoPopulate: input.autoPopulate,
        sourceSummary: input.sourceSummary,
    };
}
