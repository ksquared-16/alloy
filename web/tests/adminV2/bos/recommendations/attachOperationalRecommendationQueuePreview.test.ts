import { describe, expect, it } from "vitest";

import { buildNeedsAttentionSuggestion } from "@/lib/agent/needsAttentionSuggestion/buildNeedsAttentionSuggestion";
import {
    attachOperationalRecommendationQueuePreview,
    queueRowToRecommendationOpportunityRow,
} from "@/lib/adminV2/bos/recommendations/adapters/attachOperationalRecommendationQueuePreview";
import { projectOperationalRecommendationQueuePreview } from "@/lib/adminV2/bos/recommendations/adapters/projectOperationalRecommendationQueuePreview";
import { tryBuildOperationalRecommendationFromAttention } from "@/lib/adminV2/bos/recommendations/adapters/tryBuildOperationalRecommendationFromAttention";
import { OPERATIONAL_RECOMMENDATION_MAX_LENGTHS } from "@/lib/adminV2/bos/recommendations/types";
import { sortNeedsAttentionFilteredRows } from "@/lib/queues/needsAttentionQueuePrioritySort";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const ENTITY_ID = "11111111-1111-4111-8111-111111111111";
const NOW_MS = Date.parse("2026-05-21T12:00:00.000Z");

const QUEUE_PREVIEW_KEYS = [
    "next_label",
    "why_line",
    "urgency_band",
    "recommendation_type",
    "is_stale",
] as const;

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

function queueRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: ENTITY_ID,
        status_key: "new_inquiry",
        name: "Lee Household",
        updated_at: "2026-05-19T12:00:00.000Z",
        metadata: {},
        ...overrides,
    };
}

function mergeQueueAttentionExtras(input: {
    row: Record<string, unknown>;
    attention: OpportunityAttentionResult;
    customerName?: string | null;
}) {
    const attn = input.attention;
    const sug = buildNeedsAttentionSuggestion({
        opportunity: {
            id: String(input.row.id),
            status_key: (input.row.status_key as string | null) ?? null,
            metadata:
                input.row.metadata && typeof input.row.metadata === "object" && !Array.isArray(input.row.metadata)
                    ? (input.row.metadata as Record<string, unknown>)
                    : null,
            primary_display_name: (input.customerName ?? input.row.name ?? "").toString().trim() || null,
        },
        attention: attn,
        activity: null,
        nowIso: new Date(NOW_MS).toISOString(),
    });
    const suggestionPreview = sug
        ? {
              next_label: sug.next_action.label,
              why_line: sug.reasoning.summary.slice(0, 140),
          }
        : null;
    const recommendationPreview = attachOperationalRecommendationQueuePreview({
        orgId: ORG_ID,
        opportunityRow: queueRowToRecommendationOpportunityRow({
            row: input.row,
            customerName: input.customerName ?? null,
        }),
        attention: attn,
        activity: null,
        nowMs: NOW_MS,
    })._operational_recommendation_preview;

    return {
        ...input.row,
        _attention_suggestion_preview: suggestionPreview,
        ...(recommendationPreview ? { _operational_recommendation_preview: recommendationPreview } : {}),
    };
}

describe("attachOperationalRecommendationQueuePreview", () => {
    it("attaches preview for supported attention rows", () => {
        const result = attachOperationalRecommendationQueuePreview({
            orgId: ORG_ID,
            opportunityRow: queueRowToRecommendationOpportunityRow({ row: queueRow(), customerName: "Lee Household" }),
            attention: attentionFixture(),
            activity: null,
            nowMs: NOW_MS,
        });
        expect(result._operational_recommendation_preview).not.toBeNull();
        expect(result._operational_recommendation_preview?.next_label.length).toBeGreaterThan(0);
        expect(result._operational_recommendation_preview?.why_line.length).toBeGreaterThan(0);
    });

    it("uses canonical catalog copy in preview why_line", () => {
        const preview = attachOperationalRecommendationQueuePreview({
            orgId: ORG_ID,
            opportunityRow: queueRowToRecommendationOpportunityRow({ row: queueRow(), customerName: "Lee Household" }),
            attention: attentionFixture(),
            activity: null,
            nowMs: NOW_MS,
        })._operational_recommendation_preview;
        expect(preview?.why_line).toMatch(/lose momentum/i);
        expect(preview?.next_label).toMatch(/first response/i);
    });

    it("returns lightweight preview only, not full OperationalRecommendationV1", () => {
        const preview = attachOperationalRecommendationQueuePreview({
            orgId: ORG_ID,
            opportunityRow: queueRowToRecommendationOpportunityRow({ row: queueRow(), customerName: "Lee Household" }),
            attention: attentionFixture(),
            activity: null,
            nowMs: NOW_MS,
        })._operational_recommendation_preview;
        expect(preview).not.toBeNull();
        expect(Object.keys(preview!).sort()).toEqual([...QUEUE_PREVIEW_KEYS].sort());
        expect(preview).not.toHaveProperty("grounding_signals");
        expect(preview).not.toHaveProperty("recommendation_id");
        expect(preview).not.toHaveProperty("render");
    });

    it("fails soft for unsupported attention reasons", () => {
        const result = attachOperationalRecommendationQueuePreview({
            orgId: ORG_ID,
            opportunityRow: queueRowToRecommendationOpportunityRow({ row: queueRow(), customerName: "Lee Household" }),
            attention: attentionFixture({
                primaryCode: "mid_funnel_stale",
                primaryLabel: "Mid-funnel stale",
                slaTier: "approaching",
            }),
            activity: null,
            nowMs: NOW_MS,
        });
        expect(result._operational_recommendation_preview).toBeNull();
    });

    it("does not emit AI/hybrid markers on preview", () => {
        const full = tryBuildOperationalRecommendationFromAttention({
            orgId: ORG_ID,
            opportunityRow: queueRowToRecommendationOpportunityRow({ row: queueRow(), customerName: "Lee Household" }),
            attention: attentionFixture(),
            activity: null,
            nowMs: NOW_MS,
            sourceSurface: "queue_enrich",
        });
        expect(full?.deterministic_vs_ai_assisted).toBe("deterministic");
        expect(full?.operational_context.source_surface).toBe("queue_enrich");
        const preview = full ? projectOperationalRecommendationQueuePreview(full) : null;
        expect(preview).not.toBeNull();
        expect(preview).not.toHaveProperty("deterministic_vs_ai_assisted");
    });

    it("truncates preview why_line to queue cap", () => {
        const preview = attachOperationalRecommendationQueuePreview({
            orgId: ORG_ID,
            opportunityRow: queueRowToRecommendationOpportunityRow({ row: queueRow(), customerName: "Lee Household" }),
            attention: attentionFixture(),
            activity: null,
            nowMs: NOW_MS,
        })._operational_recommendation_preview;
        expect(preview!.why_line.length).toBeLessThanOrEqual(OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.queue_why_line);
    });
});

describe("queue row projection integration", () => {
    it("preserves existing _attention_suggestion_preview when recommendation preview is attached", () => {
        const merged = mergeQueueAttentionExtras({
            row: queueRow(),
            attention: attentionFixture(),
            customerName: "Lee Household",
        });
        expect(merged._attention_suggestion_preview).not.toBeNull();
        expect(merged._attention_suggestion_preview?.why_line).toContain("Operational attention");
        expect(merged._operational_recommendation_preview).not.toBeNull();
        expect(merged._operational_recommendation_preview?.why_line).not.toBe(
            merged._attention_suggestion_preview?.why_line
        );
    });

    it("does not change queue ordering when preview is attached", () => {
        const rows = [
            { id: "a", updated_at: "2026-05-10T00:00:00.000Z", name: "Alice" },
            { id: "b", updated_at: "2026-05-10T00:00:00.000Z", name: "Bob" },
        ];
        const att = attentionFixture({ priority_score: 1 });
        const map = new Map<string, OpportunityAttentionResult>([
            ["a", att],
            ["b", att],
        ]);
        const sortedBefore = sortNeedsAttentionFilteredRows(rows, map, [{ column: "name", ascending: true }]);
        const enriched = sortedBefore.map((row) =>
            mergeQueueAttentionExtras({
                row,
                attention: map.get(String(row.id))!,
                customerName: String(row.name),
            })
        );
        const sortedAfter = sortNeedsAttentionFilteredRows(enriched, map, [{ column: "name", ascending: true }]);
        expect(enriched).toHaveLength(rows.length);
        expect(sortedBefore.map((r) => r.id)).toEqual(["a", "b"]);
        expect(sortedAfter.map((r) => r.id)).toEqual(["a", "b"]);
    });

    it("treats preview as non-authoritative queue data", () => {
        const preview = attachOperationalRecommendationQueuePreview({
            orgId: ORG_ID,
            opportunityRow: queueRowToRecommendationOpportunityRow({ row: queueRow(), customerName: "Lee Household" }),
            attention: attentionFixture(),
            activity: null,
            nowMs: NOW_MS,
        })._operational_recommendation_preview;
        expect(preview).not.toHaveProperty("operational_context");
        expect(preview).not.toHaveProperty("stale_state_check");
        expect(preview).not.toHaveProperty("available_actions");
    });
});
