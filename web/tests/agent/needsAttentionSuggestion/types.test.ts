import { describe, expect, it } from "vitest";

import { NEEDS_ATTENTION_SUGGESTION_AGENT_KEY, attentionSuggestionV1ToJson, type AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";

describe("AttentionSuggestionV1 types", () => {
    it("serializes to plain JSON without loss", () => {
        const v: AttentionSuggestionV1 = {
            version: 1,
            agent_key: NEEDS_ATTENTION_SUGGESTION_AGENT_KEY,
            suggestion_id: "a".repeat(48),
            target: { entity_type: "opportunities", entity_id: "opp-1" },
            source: {
                resolver: "opportunity_attention",
                resolver_version: 2,
                primary_reason_code: "stale_new_inquiry",
                reason_codes: ["stale_new_inquiry"],
                activity_signal_key: "act1",
            },
            next_action: {
                key: "respond_to_new_request",
                label: "Respond to new request",
                action_family: "follow_up",
                confidence: "deterministic",
            },
            reasoning: {
                summary: "Test summary.",
                factors: [{ code: "stale_new_inquiry", label: "Stale", severity: "medium", sla_tier: "breached" }],
            },
            suggested_content: {
                channel: "email",
                template_key: "generic_follow_up_short",
                body: "Hello",
                variables: { record_ref: "abc" },
            },
            generated_at_iso: "2026-05-13T12:00:00.000Z",
        };
        const json = attentionSuggestionV1ToJson(v);
        expect(json.version).toBe(1);
        expect(json.agent_key).toBe("needs_attention_suggestion");
        expect(JSON.stringify(json)).not.toContain("undefined");
    });
});
