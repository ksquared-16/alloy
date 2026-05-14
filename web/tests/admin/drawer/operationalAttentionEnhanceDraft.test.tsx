import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import OperationalAttentionEnhanceDraft from "@/components/admin/drawer/OperationalAttentionEnhanceDraft";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";

const suggestionWithDraft = (): AttentionSuggestionV1 => ({
    version: 1,
    agent_key: "needs_attention_suggestion",
    suggestion_id: "b".repeat(48),
    target: { entity_type: "opportunities", entity_id: "opp-2" },
    source: {
        resolver: "opportunity_attention",
        resolver_version: 2,
        primary_reason_code: "follow_up_date_passed",
        reason_codes: ["follow_up_date_passed"],
    },
    next_action: { key: "nudge", label: "Nudge", action_family: "follow_up", confidence: "deterministic" },
    reasoning: { summary: "Test", factors: [] },
    suggested_content: { channel: "email", template_key: "t", body: "Draft text", variables: {} },
    generated_at_iso: "2026-05-13T12:00:00.000Z",
});

describe("OperationalAttentionEnhanceDraft", () => {
    it("renders Enhance draft affordance when suggested_content body exists (idle — no provider call)", () => {
        const html = renderToStaticMarkup(<OperationalAttentionEnhanceDraft suggestion={suggestionWithDraft()} />);
        expect(html).toContain("Enhance draft");
        expect(html).toContain('data-drawer-slot="enhance_draft_action"');
        expect(html).not.toContain("data-drawer-slot=\"enhance_draft_loading\"");
        expect(html).not.toContain("Enhanced draft ready");
        expect(html).not.toContain("Apply draft");
    });
});
