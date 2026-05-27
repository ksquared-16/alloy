import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
    buildOperationalRecommendationHandoffCopy,
    formatOrchestratorHandoffSeedFromCopy,
    HANDOFF_EYEBROW,
    hasStructuredOperationalHandoff,
} from "@/lib/adminV2/bos/operationalRecommendationHandoff";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import { getRecommendationHandoff } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import { orchestratorHandoffSeedCommand } from "@/lib/adminV2/bos/activeOperationalContext";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";

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
    it("prefers canonical handoff with review-assist vocabulary", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const copy = buildOperationalRecommendationHandoffCopy({
            entityLabel: "Chen household",
            overviewData: {
                _operational_attention: minimalAttention(),
                _operational_recommendation: rec,
                _attention_suggestion: minimalSuggestion(),
            },
        });
        expect(copy.eyebrow).toBe(HANDOFF_EYEBROW);
        expect(copy.operationalRead).toBe(rec.render.handoff.primary_recommendation);
        expect(copy.whyNow).toBe(rec.render.handoff.operational_reason);
        expect(copy.doNext).toBe(rec.recommended_action.label);
        expect(copy.operationalRead).not.toBe("Respond to new request");
        expect(copy.likelyOutcome).toBeTruthy();
    });

    it("uses legacy suggestion with cognition field mapping", () => {
        const copy = buildOperationalRecommendationHandoffCopy({
            entityLabel: "Chen household",
            overviewData: {
                _operational_attention: minimalAttention(),
                _attention_suggestion: minimalSuggestion(),
            },
        });
        expect(copy.eyebrow).toBe(HANDOFF_EYEBROW);
        expect(copy.doNext).toBe("Respond to new request");
        expect(copy.whyNow).toContain("New inquiry is stale");
        expect(copy.operationalRead).toBe("New inquiry is stale.");
        expect(copy.contextLine).toBe("Active record · Chen household");
        expect(copy.ctaLabel).toBe("Continue in Orchestrator");
    });

    it("falls back to attention primary when suggestion missing", () => {
        const copy = buildOperationalRecommendationHandoffCopy({
            entityLabel: "Patel household",
            overviewData: { _operational_attention: minimalAttention() },
        });
        expect(copy.doNext).toBe("Respond to new request");
        expect(copy.operationalRead).toBe("New inquiry is stale");
        expect(copy.whyNow).toContain("New inquiry is stale");
    });

    it("avoids chatbot, AI marketing, and legacy handoff labels", () => {
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
        expect(blob).not.toContain("Alloy suggestion");
        expect(blob).not.toContain("Suggested next step");
        expect(blob).not.toContain("Recommended next step");
        expect(blob).not.toContain("I recommend");
    });
});

describe("formatOrchestratorHandoffSeedFromCopy", () => {
    it("sequences operational read, why now, and do next", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const handoff = getRecommendationHandoff({ _operational_recommendation: rec });
        expect(handoff).not.toBeNull();
        const seed = formatOrchestratorHandoffSeedFromCopy("Chen household", handoff!);
        expect(seed).toContain("New inquiry needs timely response");
        expect(seed).toContain("Why now:");
        expect(seed).toContain("Do next:");
        expect(seed).toContain("Send a warm first response");
        expect(seed).not.toContain("Follow up with");
        expect(seed).not.toContain("Alloy suggestion");
        expect(seed).not.toMatch(/AI confidence|model believes|99% sure/i);
    });

    it("appends compact readiness note when stale without certainty language", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        rec.render.drawer_strip.is_stale = true;
        const handoff = getRecommendationHandoff({ _operational_recommendation: rec });
        const seed = formatOrchestratorHandoffSeedFromCopy("Chen household", handoff!);
        expect(seed).toContain("Needs refresh");
        expect(seed).not.toMatch(/critical|emergency|high confidence/i);
    });
});

describe("orchestratorHandoffSeedCommand parity", () => {
    it("prefers canonical operational read in seed", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const seed = orchestratorHandoffSeedCommand({
            entityLabel: "Mitchell Family",
            overviewData: {
                _operational_recommendation: rec,
                _attention_suggestion: { next_action: { label: "Send tour confirmation" } },
            },
        });
        expect(seed).toContain("Mitchell Family");
        expect(seed).toMatch(/^Draft a message to Mitchell Family/);
        expect(seed).toContain("Why now:");
        expect(seed).not.toContain("Send tour confirmation");
        expect(seed).not.toContain("Follow up with");
    });

    it("falls back to draft message when no structured handoff", () => {
        expect(hasStructuredOperationalHandoff({})).toBe(false);
        const seed = orchestratorHandoffSeedCommand({
            entityLabel: null,
            overviewData: {},
        });
        expect(seed).toBe("Draft message for this inquiry");
    });
});

describe("OpportunityOperationalCompactStrip BOS handoff (shipped V1)", () => {
    it("renders compact handoff card with structured copy hooks", () => {
        const src = readFileSync(stripPath, "utf8");
        expect(src).toContain("OrchestratorHandoffCard");
        expect(src).toContain("buildOperationalRecommendationHandoffCopy");
        expect(src).toContain("data-handoff-row=\"operational_read\"");
        expect(src).toContain("Operational read");
        expect(src).toContain("Continue in Orchestrator");
        expect(src).toContain("autoSubmitSeedCommand: true");
        expect(src).not.toContain("BOS handoff");
        expect(src).not.toContain("Alloy suggestion");
        expect(src).not.toContain("Ask AI");
    });
});
