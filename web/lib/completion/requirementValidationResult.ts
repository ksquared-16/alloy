import type {
    BlockingLevel,
    RequirementValidationResult,
    RequirementViolation,
    RequirementType,
} from "@/lib/completion/requirementValidationTypes";

export function buildRequirementValidationResult(
    violations: RequirementViolation[]
): RequirementValidationResult {
    const blocking: RequirementViolation[] = [];
    const warnings: RequirementViolation[] = [];
    const recommendations: RequirementViolation[] = [];

    for (const v of violations) {
        switch (v.blocking_level) {
            case "hard_block":
                blocking.push(v);
                break;
            case "soft_warning":
                warnings.push(v);
                break;
            case "recommendation":
                recommendations.push(v);
                break;
            default:
                blocking.push(v);
        }
    }

    return {
        ok: blocking.length === 0,
        blocking,
        warnings,
        recommendations,
    };
}

export function mergeRequirementValidationResults(
    ...results: RequirementValidationResult[]
): RequirementValidationResult {
    const blocking: RequirementViolation[] = [];
    const warnings: RequirementViolation[] = [];
    const recommendations: RequirementViolation[] = [];

    for (const r of results) {
        blocking.push(...r.blocking);
        warnings.push(...r.warnings);
        recommendations.push(...r.recommendations);
    }

    return {
        ok: blocking.length === 0,
        blocking,
        warnings,
        recommendations,
    };
}

export function makeRequirementViolation(input: {
    entity_type: string;
    entity_id: string;
    field_key?: string;
    section_key?: string;
    label: string;
    requirement_type: RequirementType;
    blocking_level: BlockingLevel;
    missing_reason: string;
    context?: RequirementViolation["context"];
}): RequirementViolation {
    return {
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        field_key: input.field_key,
        section_key: input.section_key,
        label: input.label,
        requirement_type: input.requirement_type,
        blocking_level: input.blocking_level,
        missing_reason: input.missing_reason,
        context: input.context ?? {},
    };
}

/** Human-readable summary for blocked transitions (BOS + toast). */
export function formatRequirementValidationSummary(result: RequirementValidationResult): string {
    if (result.ok && result.warnings.length === 0 && result.recommendations.length === 0) {
        return "";
    }
    if (!result.ok) {
        const labels = result.blocking.map((v) => v.label);
        if (labels.length === 1) return `Missing: ${labels[0]}.`;
        if (labels.length <= 4) return `Missing: ${labels.join(", ")}.`;
        return `Missing ${labels.length} required items (${labels.slice(0, 3).join(", ")}, …).`;
    }
    if (result.warnings.length) {
        return result.warnings.map((v) => v.label).join(", ");
    }
    return result.recommendations.map((v) => v.label).join(", ");
}
