import { afterEach, describe, expect, it, vi } from "vitest";

import * as legacyBuilder from "@/lib/agent/needsAttentionSuggestion/buildNeedsAttentionSuggestion";
import { buildNeedsAttentionSuggestion } from "@/lib/agent/needsAttentionSuggestion/buildNeedsAttentionSuggestion";
import {
    buildLegacyAttentionSuggestionCompat,
    buildLegacyQueuePreviewCompat,
} from "@/lib/adminV2/bos/recommendations/adapters/buildLegacySuggestionCompat";
import { tryBuildOperationalRecommendationFromAttention } from "@/lib/adminV2/bos/recommendations/adapters/tryBuildOperationalRecommendationFromAttention";
import { projectOperationalRecommendationQueuePreview } from "@/lib/adminV2/bos/recommendations/adapters/projectOperationalRecommendationQueuePreview";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const ENTITY_ID = "11111111-1111-4111-8111-111111111111";
const NOW_ISO = "2026-05-21T12:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);

const LEGACY_SUGGESTION_KEYS = [
    "version",
    "agent_key",
    "suggestion_id",
    "target",
    "source",
    "next_action",
    "reasoning",
    "generated_at_iso",
] as const;

const LEGACY_PREVIEW_KEYS = ["next_label", "why_line"] as const;

function attentionFixture(
    overrides: Partial<OpportunityAttentionResult> & {
        primaryCode?: string;
        primaryLabel?: string;
        waiting?: OpportunityAttentionResult["waiting"];
    } = {}
): OpportunityAttentionResult {
    const primaryCode = overrides.primaryCode ?? "stale_new_inquiry";
    const primaryLabel = overrides.primaryLabel ?? "New inquiry is stale";
    const primary = {
        code: primaryCode,
        label: primaryLabel,
        severity: "high" as const,
        sla_tier: "breached" as const,
        sla_clock_confidence: "high" as const,
    };
    return {
        needs_attention: true,
        reasons: [primary],
        primary_reason: primary,
        waiting: overrides.waiting ?? { bucket: "none", since_iso: null, active: false },
        priority_score: 80,
        priority_breakdown: [],
        auxiliary: { activity_stale: null },
        resolver_version: 2,
        computed_at_iso: NOW_ISO,
        ...overrides,
        primary_reason: overrides.primary_reason ?? primary,
        reasons: overrides.reasons ?? [primary],
    };
}

function legacyInput(attention: OpportunityAttentionResult) {
    return {
        opportunity: {
            id: ENTITY_ID,
            status_key: "new_inquiry",
            metadata: {},
            primary_display_name: "Lee Household",
        },
        attention,
        activity: null,
        nowIso: NOW_ISO,
    };
}

function opportunityRow(statusKey = "new_inquiry") {
    return {
        id: ENTITY_ID,
        status_key: statusKey,
        name: "Lee Household",
        _customer_name: "Lee Household",
        updated_at: "2026-05-19T12:00:00.000Z",
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("buildLegacyAttentionSuggestionCompat", () => {
    it("uses canonical projection when supported", () => {
        const attention = attentionFixture();
        const recommendation = tryBuildOperationalRecommendationFromAttention({
            orgId: ORG_ID,
            opportunityRow: opportunityRow(),
            attention,
            activity: null,
            nowMs: NOW_MS,
            sourceSurface: "entity_get",
        });
        expect(recommendation).not.toBeNull();

        const legacySpy = vi.spyOn(legacyBuilder, "buildNeedsAttentionSuggestion");
        const result = buildLegacyAttentionSuggestionCompat({
            recommendation,
            legacyInput: legacyInput(attention),
        });

        expect(result).not.toBeNull();
        expect(legacySpy).not.toHaveBeenCalled();
        expect(result!.reasoning.summary).toBe(recommendation!.why_it_matters);
        expect(result!.next_action.label).toBe(recommendation!.recommended_action.label);
        expect(result!.suggested_content).toBeNull();
        for (const key of LEGACY_SUGGESTION_KEYS) {
            expect(result).toHaveProperty(key);
        }
    });

    it("falls back to legacy builder when canonical recommendation is unsupported", () => {
        const attention = attentionFixture({
            primaryCode: "mid_funnel_stale",
            primaryLabel: "Mid-funnel stale",
            primary_reason: {
                code: "mid_funnel_stale",
                label: "Mid-funnel stale",
                severity: "medium",
                sla_tier: "approaching",
                sla_clock_confidence: "high",
            },
            reasons: [
                {
                    code: "mid_funnel_stale",
                    label: "Mid-funnel stale",
                    severity: "medium",
                    sla_tier: "approaching",
                    sla_clock_confidence: "high",
                },
            ],
        });
        const recommendation = tryBuildOperationalRecommendationFromAttention({
            orgId: ORG_ID,
            opportunityRow: opportunityRow("qualified"),
            attention,
            activity: null,
            nowMs: NOW_MS,
        });
        expect(recommendation).toBeNull();

        const result = buildLegacyAttentionSuggestionCompat({
            recommendation,
            legacyInput: legacyInput(attention),
        });

        expect(result).not.toBeNull();
        expect(result!.reasoning.summary).toContain("Operational attention:");
        expect(result!.next_action.key).toBe("advance_or_pause_record");
    });

    it("falls back to legacy builder when canonical projection fails", () => {
        const attention = attentionFixture();
        const recommendation = tryBuildOperationalRecommendationFromAttention({
            orgId: ORG_ID,
            opportunityRow: opportunityRow(),
            attention,
            activity: null,
            nowMs: NOW_MS,
        });
        expect(recommendation).not.toBeNull();
        const broken = {
            ...recommendation!,
            recommended_action: { ...recommendation!.recommended_action, label: "" },
        };

        const result = buildLegacyAttentionSuggestionCompat({
            recommendation: broken,
            legacyInput: legacyInput(attention),
        });

        expect(result).not.toBeNull();
        expect(result!.reasoning.summary).toContain("Operational attention:");
    });

    it("legacy builder remains callable for fallback", () => {
        const attention = attentionFixture();
        const direct = buildNeedsAttentionSuggestion(legacyInput(attention));
        expect(direct).not.toBeNull();
    });
});

describe("buildLegacyQueuePreviewCompat", () => {
    it("uses canonical queue preview projection when supported", () => {
        const attention = attentionFixture();
        const recommendation = tryBuildOperationalRecommendationFromAttention({
            orgId: ORG_ID,
            opportunityRow: opportunityRow(),
            attention,
            activity: null,
            nowMs: NOW_MS,
            sourceSurface: "queue_enrich",
        });
        const recommendationPreview = recommendation
            ? projectOperationalRecommendationQueuePreview(recommendation)
            : null;

        const legacySpy = vi.spyOn(legacyBuilder, "buildNeedsAttentionSuggestion");
        const preview = buildLegacyQueuePreviewCompat({
            recommendationPreview,
            recommendation,
            legacyInput: legacyInput(attention),
            nowMs: NOW_MS,
        });

        expect(preview).not.toBeNull();
        expect(legacySpy).not.toHaveBeenCalled();
        expect(preview!.why_line).toBe(recommendationPreview!.why_line);
        expect(preview!.next_label).toBe(recommendationPreview!.next_label);
        for (const key of LEGACY_PREVIEW_KEYS) {
            expect(preview).toHaveProperty(key);
        }
    });

    it("falls back to legacy preview when canonical build is unsupported", () => {
        const attention = attentionFixture({
            primaryCode: "mid_funnel_stale",
            primaryLabel: "Mid-funnel stale",
            primary_reason: {
                code: "mid_funnel_stale",
                label: "Mid-funnel stale",
                severity: "medium",
                sla_tier: "approaching",
                sla_clock_confidence: "high",
            },
            reasons: [
                {
                    code: "mid_funnel_stale",
                    label: "Mid-funnel stale",
                    severity: "medium",
                    sla_tier: "approaching",
                    sla_clock_confidence: "high",
                },
            ],
        });
        const preview = buildLegacyQueuePreviewCompat({
            recommendationPreview: null,
            recommendation: null,
            legacyInput: legacyInput(attention),
            nowMs: NOW_MS,
        });

        expect(preview).not.toBeNull();
        expect(preview!.why_line).toContain("Operational attention:");
        expect(preview!.next_label).toBe("Advance or pause record");
    });

    it("preserves why_line on legacy fallback preview", () => {
        const attention = attentionFixture({
            primaryCode: "blocked_internal",
            primaryLabel: "Blocked internally",
        });
        const preview = buildLegacyQueuePreviewCompat({
            recommendationPreview: null,
            recommendation: null,
            legacyInput: legacyInput(attention),
            nowMs: NOW_MS,
        });
        expect(preview?.why_line.trim()).not.toBe("");
    });
});

describe("entity attach runtime switch shape", () => {
    it("produces both _operational_recommendation and _attention_suggestion fields", () => {
        const attention = attentionFixture();
        const recommendation = tryBuildOperationalRecommendationFromAttention({
            orgId: ORG_ID,
            opportunityRow: opportunityRow(),
            attention,
            activity: null,
            nowMs: NOW_MS,
            sourceSurface: "entity_get",
        });
        const suggestion = buildLegacyAttentionSuggestionCompat({
            recommendation,
            legacyInput: legacyInput(attention),
        });

        const payload = {
            _operational_recommendation: recommendation,
            _attention_suggestion: suggestion,
        };

        expect(payload._operational_recommendation).not.toBeNull();
        expect(payload._attention_suggestion).not.toBeNull();
        expect(payload._operational_recommendation?.deterministic_vs_ai_assisted).toBe("deterministic");
        expect(payload._attention_suggestion?.suggested_content).toBeNull();
    });
});

describe("queue row runtime switch shape", () => {
    it("produces both preview fields with why_line present", () => {
        const attention = attentionFixture();
        const recommendation = tryBuildOperationalRecommendationFromAttention({
            orgId: ORG_ID,
            opportunityRow: opportunityRow(),
            attention,
            activity: null,
            nowMs: NOW_MS,
            sourceSurface: "queue_enrich",
        });
        const recommendationPreview = recommendation
            ? projectOperationalRecommendationQueuePreview(recommendation)
            : null;
        const suggestionPreview = buildLegacyQueuePreviewCompat({
            recommendationPreview,
            recommendation,
            legacyInput: legacyInput(attention),
            nowMs: NOW_MS,
        });

        const rowExtras = {
            ...(suggestionPreview ? { _attention_suggestion_preview: suggestionPreview } : {}),
            ...(recommendationPreview ? { _operational_recommendation_preview: recommendationPreview } : {}),
        };

        expect(rowExtras._attention_suggestion_preview).toBeDefined();
        expect(rowExtras._operational_recommendation_preview).toBeDefined();
        expect(rowExtras._attention_suggestion_preview?.why_line.trim()).not.toBe("");
    });
});
