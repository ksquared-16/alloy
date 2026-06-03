/**
 * Operator-facing copy for Settings: links canonical reason codes to resolver behavior
 * and to metadata keys (see {@link resolveOpportunityAttentionConfigFromMetadata}).
 */

import type { OpportunityAttentionReason } from "@/lib/workspace/opportunityAttentionRules";
import type { OpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";
import { isOpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";

export type AttentionCriteriaConfigurableSurface =
    | "threshold_hours_v1"
    | "stale_pipeline_days"
    | "wait_bucket_sla_hours"
    | "reason_policy_enabled"
    | "auxiliary_signals_flag"
    | "priority_score_weights"
    | "none";

export type AttentionReasonCriterionCatalogEntry = {
    /** Short title in Settings */
    title: string;
    /** What causes the resolver to attach this reason */
    meaning: string;
    /** Where inputs live (record vs metadata) */
    configSource: string;
    /** Surfaces editable from this Settings page (department metadata) when applicable */
    configurableSurfaces: AttentionCriteriaConfigurableSurface[];
    /** Primary metadata paths (department `metadata` subtree) */
    metadataKeys: string[];
    /** Human-readable note when no Settings knob exists yet */
    platformNote?: string;
};

export const ATTENTION_REASON_CRITERIA_CATALOG: Readonly<Record<OpportunityAttentionReasonCode, AttentionReasonCriterionCatalogEntry>> =
    {
        follow_up_date_passed: {
            title: "Follow-up date passed",
            meaning: "Triggers when `metadata.next_follow_up_at` exists and is earlier than now (UTC instant comparison).",
            configSource: "The follow-up timestamp is stored on the opportunity record (`metadata.next_follow_up_at`).",
            configurableSurfaces: ["none"],
            metadataKeys: [],
            platformNote:
                "No grace-period knob in metadata yet — threshold is “before now.” Editing the follow-up date on the record clears or postpones this reason.",
        },
        stale_quote_followup: {
            title: "Stale quote follow-up",
            meaning:
                "Triggers in the **decision** lifecycle stage when the inquiry has been quoted/priced but `updated_at` is older than the configured **hours** threshold (resolver v2 uses the same lifecycle rules as v1 `thresholdsHours`).",
            configSource:
                "Stale window: `metadata.opportunity_attention_rules.thresholdsHours.stale_quote_followup` (requires `opportunity_attention_rules.version === 1` for parser merge). Activity proxy: `updated_at` / `created_at` per `computeOpportunityAttentionReason`.",
            configurableSurfaces: ["threshold_hours_v1"],
            metadataKeys: [
                "opportunity_attention_rules.version",
                "opportunity_attention_rules.thresholdsHours.stale_quote_followup",
            ],
        },
        tour_date_passed: {
            title: "Tour date passed",
            meaning:
                "Triggers when `status_key === tour_scheduled`, `metadata.tour_date` is a past calendar date (UTC midnight boundary), and the record has not moved forward.",
            configSource: "Tour date lives on the opportunity (`metadata.tour_date`). Status must be `tour_scheduled`.",
            configurableSurfaces: ["none"],
            metadataKeys: [],
            platformNote:
                "Tour timing comparison is fixed in resolver v2 (past tour day vs today UTC). No separate grace-period setting yet.",
        },
        overdue_commitment: {
            title: "Commitment overdue",
            meaning: "Triggers when `metadata.commitment_due_at` exists and is earlier than now.",
            configSource: "Commitment due instant is on the opportunity record.",
            configurableSurfaces: ["none"],
            metadataKeys: [],
            platformNote: "No configurable grace period beyond the stored due timestamp.",
        },
        missing_quote_after_execution: {
            title: "Missing quote after execution",
            meaning:
                "Triggers in the **execution** lifecycle stage when pricing is still absent/non-positive and idle time exceeds the configured **hours** threshold.",
            configSource: "`opportunity_attention_rules.thresholdsHours.missing_quote_after_execution` (with `version === 1`).",
            configurableSurfaces: ["threshold_hours_v1"],
            metadataKeys: ["opportunity_attention_rules.thresholdsHours.missing_quote_after_execution"],
        },
        stale_new_inquiry: {
            title: "New inquiry stale",
            meaning: "Triggers in **intake** lifecycle stage when idle hours exceed the configured threshold.",
            configSource: "`opportunity_attention_rules.thresholdsHours.stale_new_inquiry` (with `version === 1`).",
            configurableSurfaces: ["threshold_hours_v1"],
            metadataKeys: ["opportunity_attention_rules.thresholdsHours.stale_new_inquiry"],
        },
        stale_qualified: {
            title: "Qualified stale",
            meaning: "Triggers in **qualification** lifecycle stage when idle hours exceed the configured threshold.",
            configSource: "`opportunity_attention_rules.thresholdsHours.stale_qualified` (with `version === 1`).",
            configurableSurfaces: ["threshold_hours_v1"],
            metadataKeys: ["opportunity_attention_rules.thresholdsHours.stale_qualified"],
        },
        high_value_stale: {
            title: "High-value funnel stale",
            meaning:
                "Triggers for mid/late funnel statuses (tour scheduled → ready to enroll) when `updated_at` is older than **`stale_high_value_days`** calendar days.",
            configSource: "`opportunity_attention_rules.stale_high_value_days` (days). Status allow-list is platform-defined in the resolver.",
            configurableSurfaces: ["stale_pipeline_days"],
            metadataKeys: ["opportunity_attention_rules.stale_high_value_days"],
        },
        mid_funnel_stale: {
            title: "Mid-funnel stale",
            meaning:
                "Triggers for mid-funnel statuses (contact attempted → enrolling) when `updated_at` is older than **`stale_mid_funnel_days`** calendar days.",
            configSource: "`opportunity_attention_rules.stale_mid_funnel_days` (days). Status allow-list is platform-defined.",
            configurableSurfaces: ["stale_pipeline_days"],
            metadataKeys: ["opportunity_attention_rules.stale_mid_funnel_days"],
        },
        missing_identity: {
            title: "Missing identity",
            meaning: "Triggers when `customer_id` is missing or neither primary person nor legacy primary contact is set.",
            configSource: "Structural fields on the opportunity row.",
            configurableSurfaces: ["none"],
            metadataKeys: [],
            platformNote: "Platform structural rule — not threshold-tunable via metadata today.",
        },
        missing_required_info: {
            title: "Required information missing",
            meaning:
                "Projected from the Readiness Engine when enforced lifecycle field rules are not satisfied (`record_view` trigger). Needs Attention does not evaluate field rules independently.",
            configSource:
                "Lifecycle Required Information levels on the department (`rule_levels_v1`) — evaluated by `evaluateOperationalReadiness`, projected by `projectReadinessToAttentionReasons`.",
            configurableSurfaces: ["reason_policy_enabled"],
            metadataKeys: [
                "opportunity_attention_rules.readiness_projection_v1.flag_missing_required",
                "opportunity_attention_rules.readiness_projection_v1.include_required_gaps",
                "opportunity_attention_rules.readiness_projection_v1.readiness_attention_bridge_v1",
            ],
            platformNote:
                "Enforced gaps project by default. Required-level gaps project only when `include_required_gaps` is true. Recommended never projects.",
        },
        waiting_on_staff: {
            title: "Waiting on staff",
            meaning: "Emitted when enrollment operational metadata marks the wait bucket as staff-owned (`enrollment_operational.wait_bucket`).",
            configSource: "Per-record `metadata.enrollment_operational` (validated on opportunity PATCH).",
            configurableSurfaces: ["wait_bucket_sla_hours", "reason_policy_enabled"],
            metadataKeys: ["opportunity_attention_rules.sla_wait_hours.waiting_on_staff"],
        },
        waiting_on_family: {
            title: "Waiting on family",
            meaning: "Same as staff wait, but bucket `waiting_on_family`.",
            configSource: "Per-record `metadata.enrollment_operational`.",
            configurableSurfaces: ["wait_bucket_sla_hours", "reason_policy_enabled"],
            metadataKeys: ["opportunity_attention_rules.sla_wait_hours.waiting_on_family"],
        },
        waiting_on_documents: {
            title: "Waiting on documents",
            meaning: "Same pattern — documents wait bucket.",
            configSource: "Per-record `metadata.enrollment_operational`.",
            configurableSurfaces: ["wait_bucket_sla_hours", "reason_policy_enabled"],
            metadataKeys: ["opportunity_attention_rules.sla_wait_hours.waiting_on_documents"],
        },
        waiting_on_payment: {
            title: "Waiting on payment",
            meaning: "Same pattern — payment wait bucket.",
            configSource: "Per-record `metadata.enrollment_operational`.",
            configurableSurfaces: ["wait_bucket_sla_hours", "reason_policy_enabled"],
            metadataKeys: ["opportunity_attention_rules.sla_wait_hours.waiting_on_payment"],
        },
        blocked_internal: {
            title: "Blocked internally",
            meaning: "Internal blocker bucket from enrollment operational metadata.",
            configSource: "Per-record `metadata.enrollment_operational`.",
            configurableSurfaces: ["wait_bucket_sla_hours", "reason_policy_enabled"],
            metadataKeys: ["opportunity_attention_rules.sla_wait_hours.blocked_internal"],
        },
        blocked_external: {
            title: "Blocked externally",
            meaning: "External dependency bucket from enrollment operational metadata.",
            configSource: "Per-record `metadata.enrollment_operational`.",
            configurableSurfaces: ["wait_bucket_sla_hours", "reason_policy_enabled"],
            metadataKeys: ["opportunity_attention_rules.sla_wait_hours.blocked_external"],
        },
    };

function rulesRootRaw(metadata: unknown): Record<string, unknown> | null {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const root = (metadata as Record<string, unknown>).opportunity_attention_rules;
    if (root == null || typeof root !== "object" || Array.isArray(root)) return null;
    return root as Record<string, unknown>;
}

export function departmentExplicitlySetsThresholdHour(
    departmentMetadata: unknown,
    key: OpportunityAttentionReason,
): boolean {
    const root = rulesRootRaw(departmentMetadata);
    const th = root?.thresholdsHours;
    if (th == null || typeof th !== "object" || Array.isArray(th)) return false;
    return typeof (th as Record<string, unknown>)[key] === "number";
}

export function departmentExplicitlySetsStaleHighValueDays(departmentMetadata: unknown): boolean {
    const root = rulesRootRaw(departmentMetadata);
    return typeof root?.stale_high_value_days === "number";
}

export function departmentExplicitlySetsStaleMidFunnelDays(departmentMetadata: unknown): boolean {
    const root = rulesRootRaw(departmentMetadata);
    return typeof root?.stale_mid_funnel_days === "number";
}

export function departmentExplicitlySetsSlaWaitBucket(
    departmentMetadata: unknown,
    bucketKey: string,
): boolean {
    const root = rulesRootRaw(departmentMetadata);
    const sla = root?.sla_wait_hours;
    if (sla == null || typeof sla !== "object" || Array.isArray(sla)) return false;
    const b = (sla as Record<string, unknown>)[bucketKey];
    return b != null && typeof b === "object" && !Array.isArray(b);
}

export function departmentExplicitlySetsPriorityWeights(departmentMetadata: unknown): boolean {
    const root = rulesRootRaw(departmentMetadata);
    const p = root?.priority_score_weights;
    return p != null && typeof p === "object" && !Array.isArray(p) && Object.keys(p as object).length > 0;
}

export function departmentExplicitlySetsAuxiliarySignals(departmentMetadata: unknown): boolean {
    const root = rulesRootRaw(departmentMetadata);
    return root?.auxiliary_signals_enabled === true;
}

/** Label for “where did this value come from?” in Settings (department-only editor). */
export function criteriaValueSourceLabel(explicitOnDepartment: boolean): "Department override" | "Platform default" {
    return explicitOnDepartment ? "Department override" : "Platform default";
}
