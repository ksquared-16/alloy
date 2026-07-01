/**
 * Pure ReadinessResult → attention reason projection (Phase 1).
 * Must not import readiness evaluators or field-rule catalogs.
 * @see docs/sprints/06_2026/needs_attention_v2_phase_0_implementation_plan.md
 */

import type { OpportunityAttentionSeverity } from "@/lib/opportunities/opportunityAttentionConfig";
import type { ReadinessAttentionProjectionProfileV1 } from "@/lib/opportunities/readinessAttentionProjectionProfile";
import { isReadinessAttentionProjectionActive } from "@/lib/opportunities/readinessAttentionProjectionProfile";
import type { ReadinessGap, ReadinessResult, RequirementLevel } from "@/lib/completion/readinessTypes";

export const READINESS_ATTENTION_REASON_CODE = "missing_required_info" as const;

export type ReadinessProjectedAttentionReasonCode = typeof READINESS_ATTENTION_REASON_CODE;

export type ReadinessAttentionResolutionHint = {
    kind: "admin_action" | "drawer_field" | "form";
    action_key?: string;
    field_key?: string;
    form_id?: string;
    label: string;
};

export type ProjectedReadinessAttentionReason = {
    code: ReadinessProjectedAttentionReasonCode;
    label: string;
    severity: OpportunityAttentionSeverity;
    intent_category: "risk";
    source: "readiness";
    provenance: string;
    readiness_gap_ids: string[];
    resolution_hints: ReadinessAttentionResolutionHint[];
};

export const READINESS_ATTENTION_AGGREGATE_LABEL = "Required information missing";

const PROVENANCE_RECORD_VIEW = "readiness.record_view.v1";

function severityRank(s: OpportunityAttentionSeverity): number {
    switch (s) {
        case "critical":
            return 4;
        case "high":
            return 3;
        case "medium":
            return 2;
        case "low":
            return 1;
        default:
            return 0;
    }
}

function maxSeverity(a: OpportunityAttentionSeverity, b: OpportunityAttentionSeverity): OpportunityAttentionSeverity {
    return severityRank(a) >= severityRank(b) ? a : b;
}

function severityForGapLevel(level: RequirementLevel): OpportunityAttentionSeverity {
    switch (level) {
        case "enforced":
            return "high";
        case "required":
            return "medium";
        case "recommended":
            return "low";
        default:
            return "medium";
    }
}

function gapIncludedForProjection(gap: ReadinessGap, profile: ReadinessAttentionProjectionProfileV1): boolean {
    switch (gap.level) {
        case "enforced":
            return true;
        case "required":
            return profile.include_required_gaps;
        case "recommended":
            return profile.include_recommended_gaps;
        default:
            return false;
    }
}

function gapsEligibleForProjection(
    readiness: ReadinessResult,
    profile: ReadinessAttentionProjectionProfileV1
): ReadinessGap[] {
    if (readiness.primary_state === "ready") return [];
    if (readiness.primary_state === "blocked") return [];
    if (readiness.primary_state === "expired") return [];

    if (readiness.primary_state === "warning") {
        if (!profile.include_recommended_gaps) return [];
        return readiness.gaps.filter((g) => g.level === "recommended");
    }

    if (readiness.primary_state === "needs_information") {
        return readiness.gaps.filter((g) => gapIncludedForProjection(g, profile));
    }

    return [];
}

function resolutionHintFromGap(gap: ReadinessGap): ReadinessAttentionResolutionHint | null {
    const res = gap.resolution;
    if (!res) return null;
    if (res.type === "field" && gap.field_key) {
        return {
            kind: "drawer_field",
            field_key: gap.field_key,
            label: gap.label,
        };
    }
    if (res.type === "action" && res.action_key) {
        return {
            kind: "admin_action",
            action_key: res.action_key,
            label: gap.label,
        };
    }
    if (res.type === "form" && res.form_id) {
        return {
            kind: "form",
            form_id: res.form_id,
            label: gap.label,
        };
    }
    return null;
}

function labelForProjectedReason(gaps: ReadinessGap[]): string {
    if (gaps.length === 1) return gaps[0]!.label;
    return READINESS_ATTENTION_AGGREGATE_LABEL;
}

/**
 * Map a readiness snapshot to zero or one aggregate attention reason.
 * Does not evaluate readiness — consumes {@link ReadinessResult} only.
 */
export function projectReadinessToAttentionReasons(
    readiness: ReadinessResult | null | undefined,
    profile: ReadinessAttentionProjectionProfileV1 | null | undefined
): ProjectedReadinessAttentionReason[] {
    if (!readiness || !profile || !isReadinessAttentionProjectionActive(profile)) {
        return [];
    }
    if (readiness.trigger !== "record_view") {
        return [];
    }

    const gaps = gapsEligibleForProjection(readiness, profile);
    if (!gaps.length) return [];

    let severity: OpportunityAttentionSeverity = "medium";
    for (const g of gaps) {
        severity = maxSeverity(severity, severityForGapLevel(g.level));
    }

    const resolution_hints = gaps
        .map(resolutionHintFromGap)
        .filter((h): h is ReadinessAttentionResolutionHint => h != null);

    return [
        {
            code: READINESS_ATTENTION_REASON_CODE,
            label: labelForProjectedReason(gaps),
            severity,
            intent_category: "risk",
            source: "readiness",
            provenance: PROVENANCE_RECORD_VIEW,
            readiness_gap_ids: gaps.map((g) => g.requirement_id),
            resolution_hints,
        },
    ];
}
