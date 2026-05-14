import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CrmCompactQueuePreview } from "@/app/adminV2/components/workspace/blocks/QueueBlock";
import OperationalAttentionDrawerSection from "@/components/admin/drawer/OperationalAttentionDrawerSection";
import OperationalAttentionHeaderStrip from "@/components/admin/drawer/OperationalAttentionHeaderStrip";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import type { CrmCompactRowSemanticSlots } from "@/lib/ui-v2/workspace-types";

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

const baseSlots = (partial: Partial<CrmCompactRowSemanticSlots>): CrmCompactRowSemanticSlots => ({
    primaryIdentity: "Patel family",
    childName: "Liam",
    childrenLines: null,
    stageLabel: null,
    statusLabel: "New",
    nextStep: null,
    lastActivity: null,
    commercialValue: null,
    contactSnippet: null,
    programContext: null,
    roomContext: null,
    ageContext: "",
    attentionReason: "New inquiry is stale",
    familyNote: null,
    ...partial,
});

describe("OperationalAttentionHeaderStrip", () => {
    it("surfaces suggestion as primary chrome (headline, suggested next step, why, draft affordance)", () => {
        const html = renderToStaticMarkup(
            <OperationalAttentionHeaderStrip
                variant="chrome"
                overviewData={{
                    _operational_attention: minimalAttention(),
                    _operational_attention_error: null,
                    _attention_suggestion: minimalSuggestion(),
                }}
            />,
        );
        expect(html).toContain("Recommended by Alloy");
        expect(html).toContain('data-drawer-slot="alloy_linked_actions_placeholder"');
        expect(html).not.toContain("Operational read");
        expect(html).not.toContain("data-drawer-slot=\"operational_summary_narrative\"");
        expect(html).toContain("Needs attention:");
        expect(html).toContain("Next ·");
        expect(html).toContain("Respond to new request");
        expect(html).toContain("Why ·");
        expect(html).toContain("Operational attention: New inquiry is stale.");
        expect(html).toContain("Draft · not sent");
        expect(html).toContain("Hello there, test.");
        expect(html).toContain("Copy draft");
        expect(html).toContain("Activity");
        expect(html).toContain("Idle signal");
        expect(html).toContain("Enhance draft");
        expect(html).not.toContain("Test AI enrichment");
        expect(html).toContain('data-drawer-slot="enhance_draft_action"');
    });

    it("uses deterministic copy when suggestion is absent", () => {
        const html = renderToStaticMarkup(
            <OperationalAttentionHeaderStrip
                variant="chrome"
                overviewData={{
                    _operational_attention: minimalAttention(),
                    _operational_attention_error: null,
                    _attention_suggestion: null,
                }}
            />,
        );
        expect(html).toContain("Suggested next step");
        expect(html).not.toContain("Recommended by Alloy");
        expect(html).not.toContain("Draft · not sent");
    });
});

describe("OperationalAttentionDrawerSection", () => {
    it("keeps body as secondary detail without duplicating header suggestion blocks", () => {
        const html = renderToStaticMarkup(
            <OperationalAttentionDrawerSection
                overviewData={{
                    _operational_attention: minimalAttention(),
                    _operational_attention_error: null,
                    _attention_suggestion: minimalSuggestion(),
                }}
            />,
        );
        expect(html).toContain("Operational detail");
        expect(html).toContain("<details");
        expect(html).not.toContain("Respond to new request");
        expect(html).not.toContain("Primary ·");
        expect(html).not.toContain("Draft · not sent");
    });

    it("shows full operational panel in body when no suggestion", () => {
        const html = renderToStaticMarkup(
            <OperationalAttentionDrawerSection
                overviewData={{
                    _operational_attention: minimalAttention(),
                    _operational_attention_error: null,
                    _attention_suggestion: null,
                }}
            />,
        );
        expect(html).toContain("Primary ·");
        expect(html).toContain("Suggested next step");
    });
});

describe("CrmCompactQueuePreview suggestion preview", () => {
    it("renders compact Alloy suggestion strip (preview-only)", () => {
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                slots={baseSlots({
                    attentionSuggestionPreview: {
                        nextLabel: "Respond to new request",
                        whyLine: "Operational attention: New inquiry is stale.",
                    },
                    operationalNextHint: null,
                })}
            />,
        );
        expect(html).toContain('data-queue-preview-slot="attention_suggestion"');
        expect(html).toContain("Alloy suggestion");
        expect(html).toContain("Respond to new request");
        expect(html).toContain("Operational attention: New inquiry is stale.");
    });
});

describe("CrmCompactQueuePreview queue priority explanation", () => {
    it("renders deterministic priority line when present", () => {
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                slots={baseSlots({
                    attentionReason: "Needs attention: Follow-up overdue",
                    queuePriorityExplanation: "Follow-up overdue · Past due vs goal",
                })}
            />,
        );
        expect(html).toContain('data-queue-preview-slot="queue_priority_explanation"');
        expect(html).toContain("Follow-up overdue · Past due vs goal");
    });
});

describe("CrmCompactQueuePreview operational summary preview", () => {
    it("renders compact read strip when headline is present", () => {
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                slots={baseSlots({
                    operationalSummaryPreview: {
                        headline: "Stale inquiry — draft ready for review.",
                        risk_urgency_hint: "medium",
                    },
                })}
            />,
        );
        expect(html).toContain('data-queue-preview-slot="operational_summary"');
        expect(html).toContain("Stale inquiry");
    });
});
