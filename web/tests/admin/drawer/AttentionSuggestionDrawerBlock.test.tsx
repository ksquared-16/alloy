import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AttentionSuggestionDrawerBlock from "@/components/admin/drawer/AttentionSuggestionDrawerBlock";
import OperationalAttentionDrawerSection from "@/components/admin/drawer/OperationalAttentionDrawerSection";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

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
        factors: [{ code: "stale_new_inquiry", label: "New inquiry is stale", severity: "medium", sla_tier: "breached" }],
    },
    suggested_content: {
        channel: "email",
        template_key: "generic_follow_up_short",
        body: "Hello there, test.",
        variables: { contact_name: "there", record_ref: "opp1" },
    },
    generated_at_iso: "2026-05-13T12:00:00.000Z",
});

const minimalAttention = (): OpportunityAttentionResult => ({
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
    priority_score: 1,
    priority_breakdown: [],
    auxiliary: {
        activity_stale: { key: "x", label: "Idle signal", severity: "medium", threshold_minutes: 60 },
    },
    resolver_version: 2,
    computed_at_iso: "2026-05-13T12:00:00.000Z",
});

describe("AttentionSuggestionDrawerBlock", () => {
    it("shows suggested next step, why, factors, draft, and no buttons", () => {
        const html = renderToStaticMarkup(
            <AttentionSuggestionDrawerBlock suggestion={minimalSuggestion()} operational={minimalAttention()} />,
        );
        expect(html).toContain("Suggested next step");
        expect(html).toContain("Why this is suggested");
        expect(html).toContain("Reasoning factors");
        expect(html).toContain("Draft message");
        expect(html).toContain("Not sent");
        expect(html).toContain("Activity context");
        expect(html).toContain("Idle signal");
        expect(html).not.toContain('type="button"');
        expect(html.toLowerCase()).not.toContain("send");
        expect(html.toLowerCase()).not.toContain("autonomous");
    });

    it("omits draft block when suggested_content is absent", () => {
        const s = minimalSuggestion();
        const s2: AttentionSuggestionV1 = { ...s, suggested_content: null };
        const html = renderToStaticMarkup(<AttentionSuggestionDrawerBlock suggestion={s2} operational={null} />);
        expect(html).not.toContain("Draft message");
    });
});

describe("OperationalAttentionDrawerSection", () => {
    it("renders operational panel when suggestion is null", () => {
        const overviewData = {
            _operational_attention: minimalAttention(),
            _operational_attention_error: null,
            _attention_suggestion: null,
        };
        const html = renderToStaticMarkup(<OperationalAttentionDrawerSection overviewData={overviewData} />);
        expect(html).toContain("Operational attention");
        expect(html).toContain("Primary");
        expect(html).not.toContain("Suggested next step");
    });

    it("renders suggestion when present", () => {
        const overviewData = {
            _operational_attention: minimalAttention(),
            _operational_attention_error: null,
            _attention_suggestion: minimalSuggestion(),
        };
        const html = renderToStaticMarkup(<OperationalAttentionDrawerSection overviewData={overviewData} />);
        expect(html).toContain("Suggested next step");
    });

    it("returns null when nothing to show", () => {
        const html = renderToStaticMarkup(<OperationalAttentionDrawerSection overviewData={{}} />);
        expect(html).toBe("");
    });
});
