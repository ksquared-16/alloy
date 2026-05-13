import { describe, expect, it } from "vitest";

import { buildNeedsAttentionSuggestion, deterministicSuggestionId } from "@/lib/agent/needsAttentionSuggestion/buildNeedsAttentionSuggestion";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

function baseAttention(overrides: Partial<OpportunityAttentionResult> = {}): OpportunityAttentionResult {
    return {
        needs_attention: true,
        reasons: [
            {
                code: "stale_new_inquiry",
                label: "New inquiry is stale",
                severity: "medium",
                sla_tier: "breached",
                sla_clock_confidence: "low",
            },
        ],
        primary_reason: {
            code: "stale_new_inquiry",
            label: "New inquiry is stale",
            severity: "medium",
            sla_tier: "breached",
            sla_clock_confidence: "low",
        },
        waiting: { bucket: "none", since_iso: null, active: false },
        priority_score: 10,
        priority_breakdown: [],
        auxiliary: { activity_stale: null },
        resolver_version: 2,
        computed_at_iso: "2026-05-13T00:00:00.000Z",
        ...overrides,
    };
}

describe("buildNeedsAttentionSuggestion", () => {
    it("returns null when not needs_attention", () => {
        const r = buildNeedsAttentionSuggestion({
            opportunity: { id: "o1" },
            attention: { ...baseAttention(), needs_attention: false, reasons: [], primary_reason: null },
        });
        expect(r).toBeNull();
    });

    it("returns null without primary_reason", () => {
        const r = buildNeedsAttentionSuggestion({
            opportunity: { id: "o1" },
            attention: { ...baseAttention(), primary_reason: null },
        });
        expect(r).toBeNull();
    });

    it("returns null for empty entity id", () => {
        expect(
            buildNeedsAttentionSuggestion({
                opportunity: { id: "" },
                attention: baseAttention(),
            }),
        ).toBeNull();
    });

    it("maps primary reason to next_action and includes factors", () => {
        const r = buildNeedsAttentionSuggestion({
            opportunity: { id: "00000000-0000-0000-0000-00000000aa01" },
            attention: baseAttention(),
            nowIso: "2026-05-13T15:00:00.000Z",
        });
        expect(r).not.toBeNull();
        expect(r!.version).toBe(1);
        expect(r!.next_action.key).toBe("respond_to_new_request");
        expect(r!.next_action.confidence).toBe("deterministic");
        expect(r!.source.reason_codes).toEqual(["stale_new_inquiry"]);
        expect(r!.suggested_content?.template_key).toBe("generic_follow_up_short");
        expect(r!.suggested_content?.variables.contact_name).toBe("there");
        expect(r!.suggested_content?.variables.record_ref).toBe("0000aa01");
    });

    it("embeds activity_signal_key from stale_signal", () => {
        const r = buildNeedsAttentionSuggestion({
            opportunity: { id: "o1" },
            attention: baseAttention(),
            activity: {
                last_activity_at: "2026-01-01T00:00:00Z",
                last_activity_type: "note_added",
                last_activity_summary: "Note added",
                stale_signal: { key: "inquiry_idle", label: "Idle too long", severity: "medium", threshold_minutes: 120 },
            },
            nowIso: "2026-05-13T12:00:00.000Z",
        });
        expect(r!.source.activity_signal_key).toBe("inquiry_idle");
        expect(r!.reasoning.summary).toContain("Idle too long");
    });

    it("deterministicSuggestionId is stable for same inputs", () => {
        const a = deterministicSuggestionId({
            entity_id: "e1",
            primary_reason_code: "stale_new_inquiry",
            resolver_version: 2,
            day_bucket_utc: "2026-05-13",
        });
        const b = deterministicSuggestionId({
            entity_id: "e1",
            primary_reason_code: "stale_new_inquiry",
            resolver_version: 2,
            day_bucket_utc: "2026-05-13",
        });
        expect(a).toBe(b);
        expect(a.length).toBe(48);
    });
});
