/**
 * Map RequirementValidationResult → ReadinessResult for status-transition and legacy bridges.
 */

import {
    buildReadinessResult,
    isReadinessBlockingTrigger,
} from "@/lib/completion/readinessMappers";
import type {
    ReadinessContext,
    ReadinessGap,
    ReadinessSubject,
    ReadinessTrigger,
    RequirementLevel,
} from "@/lib/completion/readinessTypes";
import type { RequirementValidationResult, RequirementViolation } from "@/lib/completion/requirementValidationTypes";

function levelFromViolation(v: RequirementViolation): RequirementLevel {
    const explicit = v.context?.requirement_level;
    if (explicit) return explicit;
    switch (v.blocking_level) {
        case "hard_block":
            return "enforced";
        case "soft_warning":
            return "required";
        case "recommendation":
        default:
            return "recommended";
    }
}

function gapFromViolation(v: RequirementViolation, trigger: ReadinessTrigger): ReadinessGap {
    const level = levelFromViolation(v);
    return {
        requirement_id: v.context?.rule_id?.trim() || v.field_key?.trim() || v.label,
        scope_type: "record",
        level,
        label: v.label,
        missing_reason: v.missing_reason,
        failure_kind: "missing",
        blocking: level === "enforced" && isReadinessBlockingTrigger(trigger),
        entity_type: v.entity_type,
        entity_id: v.entity_id,
        field_key: v.field_key,
    };
}

export function readinessResultFromRequirementValidation(
    validation: RequirementValidationResult,
    input: {
        trigger: ReadinessTrigger;
        subject: ReadinessSubject;
        context: ReadinessContext;
    }
): import("@/lib/completion/readinessTypes").ReadinessResult {
    const violations = [
        ...validation.blocking,
        ...validation.warnings,
        ...validation.recommendations,
    ];
    const gaps = violations.map((v) => gapFromViolation(v, input.trigger));
    const configured = gaps.length;
    return buildReadinessResult({
        trigger: input.trigger,
        subject: input.subject,
        context: input.context,
        gaps,
        counts: {
            gaps_total: gaps.length,
            by_level: {
                recommended: gaps.filter((g) => g.level === "recommended").length,
                required: gaps.filter((g) => g.level === "required").length,
                enforced: gaps.filter((g) => g.level === "enforced").length,
            },
            blocking: gaps.filter((g) => g.blocking).length,
            satisfied: 0,
            configured,
        },
    });
}
