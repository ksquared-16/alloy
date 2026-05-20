import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CrmCompactQueuePreview } from "@/app/adminV2/components/workspace/blocks/QueueBlock";
import OperationalAttentionDrawerPanel from "@/components/admin/drawer/OperationalAttentionDrawerPanel";
import OperationalAttentionHeaderStrip from "@/components/admin/drawer/OperationalAttentionHeaderStrip";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { suggestedContentForReason } from "@/lib/agent/needsAttentionSuggestion/suggestedContentTemplates";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import type { CrmCompactRowSemanticSlots } from "@/lib/ui-v2/workspace-types";

const minimalSuggestion = (): AttentionSuggestionV1 => {
    const sc = suggestedContentForReason("stale_new_inquiry", {
        entity_id: "opp-1",
        record_ref: "opp-1",
        contact_name: "there",
    });
    if (!sc) throw new Error("template");
    return {
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
        suggested_content: sc,
        generated_at_iso: "2026-05-13T12:00:00.000Z",
    };
};

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
        expect(html).toContain("What BOS has to say");
        expect(html).not.toContain("Future:");
        expect(html).not.toContain('data-drawer-slot="alloy_linked_actions_placeholder"');
        expect(html).toContain('data-operational-attention-canonical="chrome"');
        expect(html).not.toContain("Operational read");
        expect(html).not.toContain("data-drawer-slot=\"operational_summary_narrative\"");
        expect(html).toContain("Needs attention:");
        expect(html).toContain("Next ·");
        expect(html).toContain("Respond to new request");
        expect(html).toContain("Why ·");
        expect(html).toContain("Operational attention: New inquiry is stale.");
        expect(html).toContain("Draft · not sent");
        expect(html).toContain('data-drawer-slot="deterministic_draft_trigger"');
        expect(html).toContain('aria-expanded="false"');
        expect(html).not.toContain("I wanted to follow up on your inquiry");
        expect(html).not.toContain("Copy draft");
        expect(html).not.toContain('data-drawer-slot="attention_draft_popover"');
        expect(html).not.toMatch(/\bApply draft\b/);
        expect(html).toContain("Activity");
        expect(html).toContain("Idle signal");
        expect(html).toContain("Enhance draft");
        expect(html).not.toContain("Test AI enrichment");
        expect(html).toContain('data-drawer-slot="enhance_draft_action"');
    });

    it("panel variant remains available for non-drawer embeds without future placeholder", () => {
        const html = renderToStaticMarkup(
            <OperationalAttentionHeaderStrip
                variant="panel"
                overviewData={{
                    _operational_attention: minimalAttention(),
                    _operational_attention_error: null,
                    _attention_suggestion: minimalSuggestion(),
                }}
            />,
        );
        expect(html).not.toContain("Future:");
        expect(html).not.toContain('data-drawer-slot="alloy_linked_actions_placeholder"');
        expect(html).not.toContain('data-operational-attention-canonical="chrome"');
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
        expect(html).not.toContain("What BOS has to say");
        expect(html).not.toContain("Draft · not sent");
    });
});

describe("OperationalAttentionDrawerSection removal (Card 6)", () => {
    it("drawer section component file is removed from production tree", () => {
        const sectionPath = join(
            dirname(fileURLToPath(import.meta.url)),
            "../../../components/admin/drawer/OperationalAttentionDrawerSection.tsx"
        );
        expect(existsSync(sectionPath)).toBe(false);
    });
});

describe("OperationalAttentionDrawerPanel (panel variant retained)", () => {
    it("omitPrimaryAndNext hides duplicate primary/next when header shows suggestion", () => {
        const html = renderToStaticMarkup(
            <OperationalAttentionDrawerPanel
                payload={minimalAttention()}
                error={null}
                omitPrimaryAndNext
            />,
        );
        expect(html).not.toContain("Respond to new request");
        expect(html).not.toContain("Primary ·");
        expect(html).not.toContain("Draft · not sent");
    });

    it("shows full operational panel when omitPrimaryAndNext is false", () => {
        const html = renderToStaticMarkup(
            <OperationalAttentionDrawerPanel
                payload={minimalAttention()}
                error={null}
                omitPrimaryAndNext={false}
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
                    queuePriorityExplanation: "Overdue follow-up",
                })}
            />,
        );
        expect(html).toContain('data-queue-preview-slot="queue_priority_explanation"');
        expect(html).toContain("Overdue follow-up");
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
