import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildOperationalRecommendationHandoffCopy } from "@/lib/adminV2/bos/operationalRecommendationHandoff";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

const stripPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../components/admin/opportunity/OpportunityOperationalCompactStrip.tsx"
);

const minimalAttention = (): OpportunityAttentionResult => ({
    needs_attention: true,
    reasons: [
        {
            code: "stale_new_inquiry",
            label: "New inquiry is stale",
            severity: "high",
            sla_tier: "breached",
            sla_clock_confidence: "high",
        },
    ],
    primary_reason: {
        code: "stale_new_inquiry",
        label: "New inquiry is stale",
        severity: "high",
        sla_tier: "breached",
        sla_clock_confidence: "high",
    },
    waiting: { bucket: "waiting_on_staff", since_iso: "2026-05-01T12:00:00.000Z", active: true },
    priority_score: 80,
    priority_breakdown: [],
    auxiliary: { activity_stale: null },
    resolver_version: 2,
    computed_at_iso: "2026-05-20T12:00:00.000Z",
});

const minimalSuggestion = (): AttentionSuggestionV1 => ({
    version: 1,
    agent_key: "needs_attention_suggestion",
    suggestion_id: "a".repeat(48),
    target: { entity_type: "opportunities", entity_id: "opp-1" },
    source: {
        resolver: "opportunity_attention",
        resolver_version: 2,
        primary_reason_code: "stale_new_inquiry",
        reason_codes: ["stale_new_inquiry"],
        activity_signal_key: "idle",
    },
    next_action: {
        key: "respond_to_new_request",
        label: "Respond to new request",
        action_family: "follow_up",
        confidence: "deterministic",
    },
    reasoning: {
        summary: "Operational attention: New inquiry is stale.",
        factors: [{ code: "stale_new_inquiry", label: "New inquiry is stale", severity: "high" }],
    },
    suggested_content: null,
    generated_at_iso: "2026-05-20T12:00:00.000Z",
});

describe("buildOperationalRecommendationHandoffCopy", () => {
    it("uses attention suggestion next_action and reasoning when present", () => {
        const copy = buildOperationalRecommendationHandoffCopy({
            entityLabel: "Chen household",
            overviewData: {
                _operational_attention: minimalAttention(),
                _attention_suggestion: minimalSuggestion(),
            },
        });
        expect(copy.eyebrow).toBe("Recommended next step");
        expect(copy.primaryRecommendation).toBe("Respond to new request");
        expect(copy.operationalReason).toContain("New inquiry is stale");
        expect(copy.contextLine).toBe("Active record · Chen household");
        expect(copy.ctaLabel).toBe("Review next step");
    });

    it("falls back to attention primary when suggestion missing", () => {
        const copy = buildOperationalRecommendationHandoffCopy({
            entityLabel: "Patel household",
            overviewData: { _operational_attention: minimalAttention() },
        });
        expect(copy.primaryRecommendation).toBe("Respond to new request");
        expect(copy.operationalReason).toContain("New inquiry is stale");
    });

    it("avoids chatbot and AI marketing wording", () => {
        const copy = buildOperationalRecommendationHandoffCopy({
            entityLabel: "Lee household",
            overviewData: {
                _operational_attention: minimalAttention(),
                _attention_suggestion: minimalSuggestion(),
            },
        });
        const blob = JSON.stringify(copy);
        expect(blob).not.toMatch(/\bAI\b/i);
        expect(blob).not.toContain("Assistant");
        expect(blob).not.toContain("BOS thinks");
        expect(blob).not.toContain("chat");
    });
});

describe("OpportunityOperationalCompactStrip BOS handoff (shipped V1)", () => {
    it("renders compact handoff card and preserves auto-submit handoff", () => {
        const src = readFileSync(stripPath, "utf8");
        expect(src).toContain("OrchestratorHandoffCard");
        expect(src).toContain("BOS handoff");
        expect(src).toContain("Continue in Orchestrator");
        expect(src).toContain("autoSubmitSeedCommand: true");
        expect(src).not.toContain("buildOperationalRecommendationHandoffCopy");
        expect(src).not.toContain("Ask AI");
    });
});
