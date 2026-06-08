/**
 * Operator-facing readiness display helpers (read-only surfaces).
 */

import type { ReadinessGap, ReadinessResult, RequirementLevel } from "@/lib/completion/readinessTypes";

export const READINESS_LEVEL_GROUP_COPY: Record<
    RequirementLevel,
    { heading: string; helper: string }
> = {
    recommended: {
        heading: "Recommended",
        helper: "Helpful information to add.",
    },
    required: {
        heading: "Required",
        helper: "Expected before moving forward.",
    },
    enforced: {
        heading: "Enforced",
        helper: "Must be completed before gated actions can run.",
    },
};

export type ReadinessLevelGroup = {
    level: RequirementLevel;
    heading: string;
    helper: string;
    gaps: ReadinessGap[];
};

const LEVEL_ORDER: RequirementLevel[] = ["enforced", "required", "recommended"];

export function readinessDisplayReadyMessage(): string {
    return "Required information is complete.";
}

export function groupReadinessGapsByLevel(readiness: ReadinessResult): ReadinessLevelGroup[] {
    return LEVEL_ORDER.map((level) => ({
        level,
        ...READINESS_LEVEL_GROUP_COPY[level],
        gaps: readiness.gaps.filter((gap) => gap.level === level),
    })).filter((group) => group.gaps.length > 0);
}

export function enforcedReadinessGaps(readiness: ReadinessResult | null | undefined): ReadinessGap[] {
    if (!readiness) return [];
    return readiness.gaps.filter((gap) => gap.level === "enforced");
}

export function guidanceReadinessGaps(readiness: ReadinessResult | null | undefined): ReadinessGap[] {
    if (!readiness) return [];
    return readiness.gaps.filter((gap) => gap.level === "recommended" || gap.level === "required");
}

export function actionPreflightBlockedSummary(): string {
    return "This action can't run yet because required information is missing.";
}

export function requirementLevelOperatorLabel(
    level: RequirementLevel | "recommended" | "required" | "enforced"
): "Recommended" | "Required" | "Enforced" {
    switch (level) {
        case "recommended":
            return "Recommended";
        case "enforced":
            return "Enforced";
        case "required":
        default:
            return "Required";
    }
}
