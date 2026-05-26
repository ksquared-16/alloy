import { describe, expect, it } from "vitest";

import { attachOperationalRecommendationBundle } from "@/lib/adminV2/bos/recommendations/adapters/attachOperationalRecommendationBundle";
import { mapAttentionReasonToCatalogKey } from "@/lib/adminV2/bos/recommendations/adapters/mapAttentionReasonToCatalogKey";
import { validateOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import type { ActivitySignalResult } from "@/lib/admin/activitySignals";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const ENTITY_ID = "11111111-1111-4111-8111-111111111111";
const NOW_MS = Date.parse("2026-05-21T12:00:00.000Z");

const EMPTY_ACTIVITY: ActivitySignalResult = {
    last_activity_at: null,
    last_activity_type: null,
    last_activity_summary: null,
    stale_signal: null,
};

function baseOpportunityRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: ENTITY_ID,
        status_key: "new_inquiry",
        name: "Lee Household",
        _customer_name: "Lee Household",
        updated_at: "2026-05-19T12:00:00.000Z",
        ...overrides,
    };
}

function attentionFixture(
    overrides: Partial<OpportunityAttentionResult> & {
        primaryCode?: string;
        primaryLabel?: string;
        severity?: "low" | "medium" | "high" | "critical";
        slaTier?: "ok" | "approaching" | "breached";
    } = {}
): OpportunityAttentionResult {
    const primaryCode = overrides.primaryCode ?? "stale_new_inquiry";
    const primaryLabel = overrides.primaryLabel ?? "New inquiry is stale";
    const severity = overrides.severity ?? "high";
    const slaTier = overrides.slaTier ?? "breached";

    const primary = {
        code: primaryCode,
        label: primaryLabel,
        severity,
        sla_tier: slaTier,
        sla_clock_confidence: "high" as const,
    };

    return {
        needs_attention: true,
        reasons: [primary],
        primary_reason: primary,
        waiting: { bucket: "none", since_iso: null, active: false },
        priority_score: 80,
        priority_breakdown: [],
        auxiliary: { activity_stale: null },
        resolver_version: 2,
        computed_at_iso: "2026-05-20T12:00:00.000Z",
        ...overrides,
        primary_reason: overrides.primary_reason ?? primary,
        reasons: overrides.reasons ?? [primary],
    };
}

describe("mapAttentionReasonToCatalogKey", () => {
    it("maps phase 1 attention reason codes to catalog keys", () => {
        expect(
            mapAttentionReasonToCatalogKey({
                attention: attentionFixture({ primaryCode: "stale_new_inquiry" }),
            })
        ).toBe("stale_new_inquiry");
        expect(
            mapAttentionReasonToCatalogKey({
                attention: attentionFixture({ primaryCode: "follow_up_date_passed" }),
            })
        ).toBe("follow_up_date_passed");
        expect(
            mapAttentionReasonToCatalogKey({
                attention: attentionFixture({ primaryCode: "tour_date_passed" }),
            })
        ).toBe("tour_date_passed");
    });

    it("maps waiting_on_internal alias to waiting_on_staff catalog key", () => {
        const attention = attentionFixture({
            primaryCode: "waiting_on_internal",
            primaryLabel: "Waiting on staff",
            waiting: {
                bucket: "waiting_on_staff",
                since_iso: "2026-05-18T12:00:00.000Z",
                active: true,
            },
        });
        expect(mapAttentionReasonToCatalogKey({ attention })).toBe("waiting_on_staff");
    });

    it("returns null for unsupported reason without supplemental grounding", () => {
        expect(
            mapAttentionReasonToCatalogKey({
                attention: attentionFixture({
                    primaryCode: "mid_funnel_stale",
                    primaryLabel: "Mid-funnel stale",
                    slaTier: "approaching",
                }),
            })
        ).toBeNull();
    });

    it("uses unanswered_inbound only when activity signal is grounded", () => {
        const attention = attentionFixture({
            primaryCode: "mid_funnel_stale",
            primaryLabel: "Mid-funnel stale",
            slaTier: "ok",
        });
        expect(mapAttentionReasonToCatalogKey({ attention, activity: EMPTY_ACTIVITY })).toBeNull();

        const activity: ActivitySignalResult = {
            ...EMPTY_ACTIVITY,
            stale_signal: {
                key: "unanswered_inbound",
                label: "Inbound awaiting reply",
                severity: "high",
                threshold_minutes: 60,
            },
        };
        expect(mapAttentionReasonToCatalogKey({ attention, activity })).toBe("unanswered_inbound");
    });

    it("uses sla_breach supplemental when reason is unsupported but SLA is breached", () => {
        expect(
            mapAttentionReasonToCatalogKey({
                attention: attentionFixture({
                    primaryCode: "blocked_internal",
                    primaryLabel: "Blocked internally",
                    slaTier: "breached",
                }),
            })
        ).toBe("sla_breach");
    });
});

describe("attachOperationalRecommendationBundle", () => {
    it("attaches a valid recommendation for supported attention reasons", () => {
        const result = attachOperationalRecommendationBundle({
            orgId: ORG_ID,
            opportunityRow: baseOpportunityRow(),
            attention: attentionFixture(),
            activity: EMPTY_ACTIVITY,
            nowMs: NOW_MS,
        });

        expect(result._operational_recommendation).not.toBeNull();
        expect(() => validateOperationalRecommendationV1(result._operational_recommendation!)).not.toThrow();
        expect(result._operational_recommendation?.operational_context.source_surface).toBe("entity_get");
    });

    it("fails soft for unsupported attention reasons", () => {
        const result = attachOperationalRecommendationBundle({
            orgId: ORG_ID,
            opportunityRow: baseOpportunityRow(),
            attention: attentionFixture({
                primaryCode: "mid_funnel_stale",
                primaryLabel: "Mid-funnel stale",
                slaTier: "approaching",
            }),
            activity: EMPTY_ACTIVITY,
            nowMs: NOW_MS,
        });
        expect(result._operational_recommendation).toBeNull();
    });

    it("does not emit hybrid or ai_refined markers", () => {
        const result = attachOperationalRecommendationBundle({
            orgId: ORG_ID,
            opportunityRow: baseOpportunityRow(),
            attention: attentionFixture(),
            activity: EMPTY_ACTIVITY,
            nowMs: NOW_MS,
        });
        expect(result._operational_recommendation?.deterministic_vs_ai_assisted).toBe("deterministic");
    });

    it("preserves legacy fields when merged into a bundle-shaped payload", () => {
        const legacySuggestion = { version: 1, agent_key: "needs_attention_suggestion" };
        const attn = {
            _operational_attention: attentionFixture(),
            _attention_suggestion: legacySuggestion,
        };
        const rec = attachOperationalRecommendationBundle({
            orgId: ORG_ID,
            opportunityRow: baseOpportunityRow(),
            attention: attn._operational_attention,
            activity: EMPTY_ACTIVITY,
            nowMs: NOW_MS,
        });
        const merged = { ...attn, ...rec };
        expect(merged._attention_suggestion).toBe(legacySuggestion);
        expect(merged._operational_recommendation).not.toBeNull();
    });

    it("builds waiting_on_staff recommendation with canonical catalog key", () => {
        const result = attachOperationalRecommendationBundle({
            orgId: ORG_ID,
            opportunityRow: baseOpportunityRow({ status_key: "application_started" }),
            attention: attentionFixture({
                primaryCode: "waiting_on_staff",
                primaryLabel: "Waiting on staff",
                waiting: {
                    bucket: "waiting_on_staff",
                    since_iso: "2026-05-18T12:00:00.000Z",
                    active: true,
                },
            }),
            activity: EMPTY_ACTIVITY,
            nowMs: NOW_MS,
        });
        expect(result._operational_recommendation?.title).toMatch(/staff/i);
        expect(result._operational_recommendation?.recommended_action.key).toBe("complete_internal_action");
    });

    it("produces distinct recommendations for stale, tour, and follow-up reasons", () => {
        const stale = attachOperationalRecommendationBundle({
            orgId: ORG_ID,
            opportunityRow: baseOpportunityRow({ status_key: "new_inquiry" }),
            attention: attentionFixture({
                primaryCode: "stale_new_inquiry",
                primaryLabel: "New inquiry is stale",
            }),
            activity: EMPTY_ACTIVITY,
            nowMs: NOW_MS,
        });
        const tour = attachOperationalRecommendationBundle({
            orgId: ORG_ID,
            opportunityRow: baseOpportunityRow({ status_key: "tour_scheduled" }),
            attention: attentionFixture({
                primaryCode: "tour_date_passed",
                primaryLabel: "Tour date passed",
            }),
            activity: EMPTY_ACTIVITY,
            nowMs: NOW_MS,
        });
        const followUp = attachOperationalRecommendationBundle({
            orgId: ORG_ID,
            opportunityRow: baseOpportunityRow({ status_key: "contacted" }),
            attention: attentionFixture({
                primaryCode: "follow_up_date_passed",
                primaryLabel: "Follow-up overdue",
            }),
            activity: EMPTY_ACTIVITY,
            nowMs: NOW_MS,
        });

        const titles = [
            stale._operational_recommendation?.title,
            tour._operational_recommendation?.title,
            followUp._operational_recommendation?.title,
        ];
        expect(new Set(titles).size).toBe(3);
        expect(stale._operational_recommendation?.title).toMatch(/new inquiry/i);
        expect(tour._operational_recommendation?.title).toMatch(/tour/i);
        expect(followUp._operational_recommendation?.title).toMatch(/follow-up/i);
    });

    it("does not require extra data fetches beyond attach context", () => {
        const attachSource = `
            orgId opportunityRow attention activity workUnitId nowMs
        `;
        expect(attachSource).not.toMatch(/supabase|loadOpportunity|fetch/);
        expect(
            attachOperationalRecommendationBundle({
                orgId: ORG_ID,
                opportunityRow: baseOpportunityRow(),
                attention: attentionFixture(),
                activity: EMPTY_ACTIVITY,
                nowMs: NOW_MS,
            })._operational_recommendation
        ).not.toBeNull();
    });
});
