/**
 * Extract deterministic grounding signals from entity attach context (Phase 1 / Card 1.4).
 * Uses resolver + activity output only — no extra fetches.
 */

import type { ActivitySignalResult } from "@/lib/admin/activitySignals";
import type { OperationalRecommendationCatalogKey } from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogTypes";
import type {
    BuildOperationalRecommendationInputV1,
    RawGroundingSignalInputV1,
    SecondaryFactorInputV1,
} from "@/lib/adminV2/bos/recommendations/signals/operationalRecommendationSignals";
import type { OperationalContextSourceSurfaceV1 } from "@/lib/adminV2/bos/recommendations/types";
import {
    buildGroundedUrgencyReasonLine,
    formatIntakeAgePhrase,
    intakeAgeDaysFromRow,
} from "@/lib/adminV2/bos/recommendations/operationalTimingCopy";
import {
    waitingBucketQueueToken,
    timingPhraseForReason,
} from "@/lib/opportunities/operationalAttentionExplain";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

const ATTENTION_PROVENANCE = "opportunity_attention_resolver.v2";
const ACTIVITY_PROVENANCE = "activity_signals.v1";

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const s = String(value).trim();
    return s || null;
}

function opportunityPrimaryDisplayName(row: Record<string, unknown>): string | null {
    const customer = trimOrNull(row._customer_name);
    if (customer) return customer;
    return trimOrNull(row.name);
}

function resolveActivityStaleKey(
    activity: ActivitySignalResult | null | undefined,
    attention: OpportunityAttentionResult
): string | null {
    return (
        activity?.stale_signal?.key?.trim() ??
        attention.auxiliary?.activity_stale?.key?.trim() ??
        null
    );
}

function buildCatalogSpecificSignals(input: {
    catalogKey: OperationalRecommendationCatalogKey;
    attention: OpportunityAttentionResult;
    activity: ActivitySignalResult | null | undefined;
    statusKey: string | null;
    nowMs: number;
}): RawGroundingSignalInputV1[] {
    const { catalogKey, attention, activity, statusKey, nowMs } = input;
    const primary = attention.primary_reason;
    if (!primary) return [];

    const out: RawGroundingSignalInputV1[] = [];
    const activityKey = resolveActivityStaleKey(activity, attention);

    if (catalogKey === "stale_new_inquiry") {
        out.push({
            code: "status_stale_new_inquiry",
            label: "Stale new inquiry",
            source_type: "entity_field",
            provenance: "opportunity.status",
            priority: 10,
            reason_code: "stale_new_inquiry",
        });
    }

    if (primary.sla_tier === "breached" || catalogKey === "follow_up_date_passed" || catalogKey === "sla_breach") {
        out.push({
            code: "sla_breached",
            label: "SLA breached",
            source_type: "attention_resolver",
            provenance: "attention_sla",
            sla_tier: "breached",
            priority: 1,
        });
    }

    if (catalogKey === "waiting_on_family" && attention.waiting.bucket === "waiting_on_family") {
        out.push({
            code: "wait_bucket_waiting_on_family",
            label: waitingBucketQueueToken("waiting_on_family") ?? "Family wait",
            source_type: "attention_resolver",
            provenance: ATTENTION_PROVENANCE,
            priority: 5,
        });
    }

    if (catalogKey === "waiting_on_staff" && attention.waiting.bucket === "waiting_on_staff") {
        out.push({
            code: "wait_bucket_waiting_on_staff",
            label: waitingBucketQueueToken("waiting_on_staff") ?? "Staff wait",
            source_type: "attention_resolver",
            provenance: ATTENTION_PROVENANCE,
            priority: 5,
        });
    }

    if (
        (catalogKey === "waiting_on_family" || catalogKey === "waiting_on_staff") &&
        attention.waiting.since_iso
    ) {
        out.push({
            code: "wait_duration",
            label: timingPhraseForReason(primary, attention.waiting, nowMs),
            source_type: "attention_resolver",
            provenance: ATTENTION_PROVENANCE,
            priority: 6,
        });
    }

    if (catalogKey === "unanswered_inbound" && activityKey) {
        out.push({
            code: "activity_stale_unanswered_inbound",
            label: activity?.stale_signal?.label?.trim() || "Unanswered inbound",
            source_type: "activity_signal",
            provenance: ACTIVITY_PROVENANCE,
            priority: 0,
            value_hint: activityKey,
        });
    }

    if (statusKey) {
        out.push({
            code: `status_${statusKey.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`,
            label: statusKey,
            source_type: "entity_field",
            provenance: "opportunity.status",
            priority: 20,
        });
    }

    if (activityKey && catalogKey !== "unanswered_inbound") {
        out.push({
            code: `activity_stale_${activityKey.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`,
            label: activity?.stale_signal?.label?.trim() || activityKey,
            source_type: "activity_signal",
            provenance: ACTIVITY_PROVENANCE,
            priority: 15,
            value_hint: activityKey,
        });
    }

    return out;
}

/**
 * Build builder input from entity attach context (deterministic, read-only).
 */
export function buildOperationalRecommendationAttachInput(input: {
    orgId: string;
    opportunityRow: Record<string, unknown>;
    attention: OpportunityAttentionResult;
    activity: ActivitySignalResult | null | undefined;
    catalogKey: OperationalRecommendationCatalogKey;
    workUnitId?: string | null;
    nowMs?: number;
    sourceSurface?: OperationalContextSourceSurfaceV1;
}): BuildOperationalRecommendationInputV1 {
    const nowMs = input.nowMs ?? Date.now();
    const generatedAtIso = new Date(nowMs).toISOString();
    const attention = input.attention;
    const primary = attention.primary_reason;
    if (!primary) {
        throw new Error("buildOperationalRecommendationAttachInput: missing primary_reason");
    }

    const entityId = String(input.opportunityRow.id ?? "").trim();
    const statusKey = trimOrNull(input.opportunityRow.status_key);
    const primaryLabel = primary.label.trim();
    const activityKey = resolveActivityStaleKey(input.activity, attention);
    const timingPhrase = timingPhraseForReason(primary, attention.waiting, nowMs);
    const waitBucketLabel = waitingBucketQueueToken(attention.waiting.bucket);
    const intakeDays = intakeAgeDaysFromRow(input.opportunityRow, nowMs);
    const intakeAgePhrase = formatIntakeAgePhrase(intakeDays);
    const urgencyReasonLine = buildGroundedUrgencyReasonLine(primary.sla_tier, intakeAgePhrase);

    const rawSignals: RawGroundingSignalInputV1[] = [
        {
            code: "primary_attention_reason",
            label: primaryLabel,
            source_type: "attention_resolver",
            provenance: ATTENTION_PROVENANCE,
            severity: primary.severity,
            sla_tier: primary.sla_tier,
            priority: 0,
            reason_code: primary.code,
        },
        ...buildCatalogSpecificSignals({
            catalogKey: input.catalogKey,
            attention,
            activity: input.activity,
            statusKey,
            nowMs,
        }),
    ];

    const secondaryFactors: SecondaryFactorInputV1[] = attention.reasons
        .filter((r) => r.code !== primary.code)
        .map((r) => ({
            code: r.code,
            label: r.label,
            severity: r.severity,
            sla_tier: r.sla_tier,
        }));

    const reasonCodesSorted = attention.reasons
        .map((r) => r.code)
        .slice()
        .sort((a, b) => a.localeCompare(b));

    return {
        org_id: input.orgId,
        entity_type: "opportunities",
        entity_id: entityId,
        work_unit_id: input.workUnitId ?? null,
        catalog_key: input.catalogKey,
        primary_label: primaryLabel,
        status_key: statusKey,
        status_label: statusKey,
        primary_display_name: opportunityPrimaryDisplayName(input.opportunityRow),
        source_surface: input.sourceSurface ?? "entity_get",
        generated_at_iso: generatedAtIso,
        raw_signals: rawSignals,
        template_values: {
            primary_label: primaryLabel,
            severity: primary.severity,
            sla_tier: primary.sla_tier,
            timing_phrase: timingPhrase,
            wait_bucket_label: waitBucketLabel ?? undefined,
            days: intakeDays ?? undefined,
            intake_age_phrase: intakeAgePhrase ?? undefined,
            urgency_reason_line: urgencyReasonLine,
            status_label: statusKey ?? undefined,
        },
        secondary_factors: secondaryFactors.length ? secondaryFactors : undefined,
        stale_inputs: {
            status_key: statusKey,
            primary_reason_code: primary.code,
            reason_codes_sorted: reasonCodesSorted,
            waiting_bucket: attention.waiting.bucket,
            waiting_since_iso: attention.waiting.since_iso,
            resolver_version: attention.resolver_version,
            attention_computed_at_iso: attention.computed_at_iso,
            activity_signal_key: activityKey,
        },
    };
}
