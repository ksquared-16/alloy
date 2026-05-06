import { describe, expect, it } from "vitest";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import {
    DEFAULT_NEEDS_ATTENTION_BUCKETS,
    bucketCountsFromResolverMatches,
    hydrateNeedsAttentionBucketCounts,
    pickMetadataForNeedsAttentionBuckets,
    resolveNeedsAttentionBucketsFromMetadata,
    resolveNeedsAttentionBucketsWithPrecedence,
} from "@/lib/opportunities/needsAttentionBuckets";

function mockMatch(reasonCodes: string[]): { resolved: OpportunityAttentionResult } {
    const reasons = reasonCodes.map((code) => ({
        code,
        label: code,
        severity: "medium" as const,
        sla_tier: "ok" as const,
        sla_clock_confidence: "high" as const,
    }));
    return {
        resolved: {
            needs_attention: true,
            primary_reason: reasons[0]!,
            reasons,
        } as OpportunityAttentionResult,
    };
}

describe("needsAttentionBuckets", () => {
    it("platform defaults ship a single follow-up overdue bucket", () => {
        expect(DEFAULT_NEEDS_ATTENTION_BUCKETS.length).toBe(1);
        expect(DEFAULT_NEEDS_ATTENTION_BUCKETS[0]?.key).toBe("follow_up_overdue");
    });

    it("hydrates histogram sums (reason occurrences)", () => {
        const buckets = resolveNeedsAttentionBucketsFromMetadata(null);
        const withCounts = hydrateNeedsAttentionBucketCounts(buckets, [
            { reason_key: "follow_up_date_passed", label: "", count: 2 },
            { reason_key: "stale_quote_followup", label: "", count: 1 },
        ]);
        const fu = withCounts.find((x) => x.key === "follow_up_overdue");
        expect(fu?.count).toBe(3);
    });

    it("counts unique inquiries per bucket from resolver matches", () => {
        const metaMulti = {
            opportunity_attention_rules: {
                needs_attention_buckets: [
                    {
                        key: "staff",
                        label: "Staff",
                        enabled: true,
                        order: 5,
                        reason_codes: ["waiting_on_staff"],
                    },
                    {
                        key: "follow_up_overdue",
                        label: "Follow-up overdue",
                        enabled: true,
                        order: 10,
                        reason_codes: ["follow_up_date_passed", "stale_quote_followup"],
                    },
                    {
                        key: "missing_quote",
                        label: "Missing quote",
                        enabled: true,
                        order: 20,
                        reason_codes: ["missing_quote_after_execution"],
                    },
                ],
            },
        };
        const buckets = resolveNeedsAttentionBucketsFromMetadata(metaMulti);
        const matches = [
            mockMatch(["waiting_on_staff", "stale_quote_followup"]),
            mockMatch(["waiting_on_staff"]),
            mockMatch(["missing_quote_after_execution"]),
        ];
        const counts = bucketCountsFromResolverMatches(buckets, matches);
        expect(counts.find((x) => x.key === "staff")?.count).toBe(2);
        expect(counts.find((x) => x.key === "follow_up_overdue")?.count).toBe(1);
        expect(counts.find((x) => x.key === "missing_quote")?.count).toBe(1);
    });

    it("parses metadata bucket overrides", () => {
        const meta = {
            opportunity_attention_rules: {
                needs_attention_buckets: [
                    {
                        key: "waiting_on_staff",
                        label: "Staff wait",
                        enabled: true,
                        order: 10,
                        reason_codes: ["waiting_on_staff"],
                    },
                ],
            },
        };
        const b = resolveNeedsAttentionBucketsFromMetadata(meta);
        expect(b.find((x) => x.key === "waiting_on_staff")?.label).toBe("Staff wait");
    });

    it("precedence prefers work unit over department when key present", () => {
        const wu = {
            opportunity_attention_rules: {
                needs_attention_buckets: [
                    { key: "waiting_on_staff", label: "From WU", enabled: true, order: 10, reason_codes: ["waiting_on_staff"] },
                ],
            },
        };
        const dept = {
            opportunity_attention_rules: {
                needs_attention_buckets: [
                    { key: "waiting_on_staff", label: "From Dept", enabled: true, order: 10, reason_codes: ["waiting_on_staff"] },
                ],
            },
        };
        expect(pickMetadataForNeedsAttentionBuckets(wu, dept)).toBe(wu);
        const merged = resolveNeedsAttentionBucketsWithPrecedence(wu, dept);
        expect(merged.find((x) => x.key === "waiting_on_staff")?.label).toBe("From WU");
    });

    it("precedence falls back to department when work unit omits buckets key", () => {
        const wu = { opportunity_attention_rules: { reason_overrides: {} } };
        const dept = {
            opportunity_attention_rules: {
                needs_attention_buckets: [
                    { key: "waiting_on_staff", label: "From Dept", enabled: true, order: 10, reason_codes: ["waiting_on_staff"] },
                ],
            },
        };
        expect(pickMetadataForNeedsAttentionBuckets(wu, dept)).toBe(dept);
    });
});
