import { describe, expect, it } from "vitest";

import {
    CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED,
    CANONICAL_ENROLLMENT_READINESS_ATTENTION_PROJECTION_V1,
} from "@/lib/opportunities/enrollmentNeedsAttentionBucketsSeed";
import {
    bucketCountsFromResolverMatches,
    opportunityAttentionResultMatchesBucket,
} from "@/lib/opportunities/needsAttentionBuckets";
import { resolveOpportunityAttention } from "@/lib/opportunities/opportunityAttentionResolver";
import { createDefaultOpportunityAttentionResolvedConfig } from "@/lib/opportunities/opportunityAttentionConfig";
import {
    buildQueueOperationalAttentionPresentation,
    readinessQueueActionLineFromDetails,
} from "@/lib/opportunities/operationalAttentionExplain";
import { resolveReadinessAttentionProjectionProfileFromMetadata } from "@/lib/opportunities/readinessAttentionProjectionProfile";
import { buildQueueRowPriorityExplanationLine } from "@/lib/opportunities/queueRowPriorityExplanation";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";

const enrollmentDeptMetadata = {
    opportunity_attention_rules: {
        needs_attention_buckets: CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED.map((b) => ({
            ...b,
            reason_codes: [...b.reason_codes],
        })),
        readiness_projection_v1: { ...CANONICAL_ENROLLMENT_READINESS_ATTENTION_PROJECTION_V1 },
    },
};

function readinessWithEnforcedGap(): ReadinessResult {
    return {
        contract_version: "1.0",
        primary_state: "needs_information",
        trigger: "record_view",
        subject: { entity_type: "opportunity", entity_id: "opp-bridge-1" },
        context: { org_id: "org-1" },
        gaps: [
            {
                requirement_id: "child:program_interest",
                scope_type: "record",
                level: "enforced",
                label: "Child · Program Interest",
                missing_reason: "Missing",
                failure_kind: "missing",
                blocking: false,
            },
        ],
        counts: {
            gaps_total: 1,
            by_level: { recommended: 0, required: 0, enforced: 1 },
            blocking: 0,
            satisfied: 0,
            configured: 1,
        },
        ok: false,
    };
}

describe("readinessAttentionBridgeRuntime", () => {
    it("enrollment seed enables queue bridge in metadata profile resolution", () => {
        const profile = resolveReadinessAttentionProjectionProfileFromMetadata(enrollmentDeptMetadata);
        expect(profile.readiness_attention_bridge_v1).toBe(true);
        expect(profile.enabled).toBe(true);
        expect(profile.flag_missing_required).toBe(true);
    });

    it("required_information_missing bucket matches readiness-projected attention", () => {
        const config = createDefaultOpportunityAttentionResolvedConfig();
        const resolved = resolveOpportunityAttention({
            opportunity: {
                id: "opp-bridge-1",
                status_key: "contact_attempted",
                created_at: "2026-06-01T12:00:00.000Z",
                updated_at: "2026-06-01T18:00:00.000Z",
                primary_person_id: "person-1",
                customer_id: "cust-1",
                metadata: {},
            },
            defs: [],
            config,
            nowMs: Date.parse("2026-06-03T12:00:00.000Z"),
            readiness: readinessWithEnforcedGap(),
            readinessProjectionProfile: CANONICAL_ENROLLMENT_READINESS_ATTENTION_PROJECTION_V1,
        });

        expect(resolved.needs_attention).toBe(true);
        expect(resolved.reasons.some((r) => r.code === "missing_required_info")).toBe(true);

        const bucketDef = CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED.find(
            (b) => b.key === "required_information_missing"
        )!;
        const bucket = { ...bucketDef, reason_codes: [...bucketDef.reason_codes] };
        expect(opportunityAttentionResultMatchesBucket(resolved, bucket)).toBe(true);

        const counts = bucketCountsFromResolverMatches(
            CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED.map((b) => ({
                ...b,
                reason_codes: [...b.reason_codes],
            })),
            [{ resolved }]
        );
        expect(counts.find((b) => b.key === "required_information_missing")?.count).toBe(1);
    });

    it("clears readiness attention when gap resolves", () => {
        const config = createDefaultOpportunityAttentionResolvedConfig();
        const ready: ReadinessResult = {
            ...readinessWithEnforcedGap(),
            primary_state: "ready",
            gaps: [],
            counts: {
                gaps_total: 0,
                by_level: { recommended: 0, required: 0, enforced: 0 },
                blocking: 0,
                satisfied: 1,
                configured: 1,
            },
            ok: true,
        };
        const resolved = resolveOpportunityAttention({
            opportunity: {
                id: "opp-bridge-1",
                status_key: "contact_attempted",
                created_at: "2026-06-01T12:00:00.000Z",
                updated_at: "2026-06-01T18:00:00.000Z",
                primary_person_id: "person-1",
                customer_id: "cust-1",
                metadata: {},
            },
            defs: [],
            config,
            nowMs: Date.parse("2026-06-03T12:00:00.000Z"),
            readiness: ready,
            readinessProjectionProfile: CANONICAL_ENROLLMENT_READINESS_ATTENTION_PROJECTION_V1,
        });

        expect(resolved.needs_attention).toBe(false);
        expect(resolved.reasons.some((r) => r.code === "missing_required_info")).toBe(false);

        const bucketDef2 = CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED.find(
            (b) => b.key === "required_information_missing"
        )!;
        const bucket = { ...bucketDef2, reason_codes: [...bucketDef2.reason_codes] };
        expect(opportunityAttentionResultMatchesBucket(resolved, bucket)).toBe(false);

        const counts = bucketCountsFromResolverMatches(
            CANONICAL_CHILDCARE_ENROLLMENT_NEEDS_ATTENTION_BUCKETS_SEED.map((b) => ({
                ...b,
                reason_codes: [...b.reason_codes],
            })),
            [{ resolved }]
        );
        expect(counts.find((b) => b.key === "required_information_missing")?.count).toBe(0);
    });

    it("queue row exposes gap-specific action from attention payload", () => {
        const details = [
            {
                code: "missing_required_info",
                label: "Child · Program Interest",
                severity: "high",
                sla_tier: "approaching",
                sla_clock_confidence: "high",
                attention_source: "readiness",
                readiness_gap_ids: ["child:program_interest"],
            },
        ];
        expect(readinessQueueActionLineFromDetails(details)).toBe(
            "Add Child · Program Interest to continue this inquiry."
        );

        const pres = buildQueueOperationalAttentionPresentation(
            {
                _attention_reason: "missing_required_info",
                _attention_reason_label: "Child · Program Interest",
                _attention_severity: "high",
                _attention_waiting_bucket: "none",
                _attention_reasons_detail: details,
            },
            { queueScan: true }
        );
        expect(pres.summaryLine).toBe("Needs attention: Child · Program Interest");
        expect(pres.nextHintLine).toBe("Add Child · Program Interest to continue this inquiry.");

        const priority = buildQueueRowPriorityExplanationLine({
            _needs_attention: true,
            _attention_reason: "missing_required_info",
            _attention_reason_label: "Child · Program Interest",
        });
        expect(priority).toBe("Required information missing");
    });
});
