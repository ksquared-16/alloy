import { describe, expect, it } from "vitest";

import {
    buildWorkflowAssistDraftReviewV1,
    normalizeWorkflowAssistChannel,
    normalizeWorkflowAssistEventType,
    parseWorkflowAssistDraftEnrichmentRaw,
} from "@/lib/agent/workflowAssist/workflowAssistDraftEnrichmentV1";
import { enrichWorkflowAssistCreateSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistEnrichCreateProposalV1";
import { resolveWorkflowAssistMessagePreview } from "@/lib/agent/workflowAssist/workflowAssistMessageProvenanceV1";
import { buildWorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";

const orgId = "22222222-2222-2222-2222-222222222222";
const userId = "33333333-3333-3333-3333-333333333333";

describe("workflowAssistDraftEnrichmentV1", () => {
    it("parses and rejects unsupported event types in normalization", () => {
        const raw = parseWorkflowAssistDraftEnrichmentRaw({
            suggested_trigger_event_type: "custom_magic_event",
            suggested_channel: "fax",
        });
        expect(raw?.suggested_trigger_event_type).toBe("custom_magic_event");
        const ev = normalizeWorkflowAssistEventType(raw?.suggested_trigger_event_type, "opportunity_schedule_tour_followup");
        expect(ev.rejected).toBe(true);
        expect(ev.value).toBe("opportunity_schedule_tour_followup");
        const ch = normalizeWorkflowAssistChannel(raw?.suggested_channel, "sms");
        expect(ch.rejected).toBe(true);
        expect(ch.value).toBe("sms");
    });

    it("prefers org template message provenance", () => {
        const msg = resolveWorkflowAssistMessagePreview({
            template_id: "tour_reminder",
            org_metadata: {
                workflow_assist_message_templates: {
                    tour_reminder_sms: "Hi from org template",
                },
            },
            ai_raw: { suggested_message_preview: "AI body" },
        });
        expect(msg.provenance).toBe("org_template");
        expect(msg.body).toContain("org template");
    });

    it("falls back to AI then scaffold without contact_name", () => {
        const ai = resolveWorkflowAssistMessagePreview({
            template_id: "tour_reminder",
            org_metadata: {},
            ai_raw: { suggested_message_preview: "Reminder: tour in 3 days. Reply to reschedule." },
        });
        expect(ai.provenance).toBe("ai_generated");
        expect(ai.body).not.toContain("{{contact_name}}");

        const fb = resolveWorkflowAssistMessagePreview({
            template_id: "tour_reminder",
            lead_days: 3,
            org_metadata: {},
            ai_raw: null,
        });
        expect(fb.provenance).toBe("fallback_scaffold");
        expect(fb.body).not.toMatch(/\{\{contact_name\}\}/);
    });

    it("enrich create suggestion keeps workflow disabled and attaches draft_review", () => {
        const base = buildWorkflowAssistSuggestionV1({
            orgId,
            actorUserId: userId,
            parsed: {
                version: 1,
                proposal_kind: "create_workflow",
                draft: {
                    name: "Tour Reminder Draft",
                    event_type: "opportunity_schedule_tour_followup",
                    entity_type: "opportunity",
                    enabled: false,
                },
            },
        });
        const enriched = enrichWorkflowAssistCreateSuggestionV1({
            suggestion: base,
            template_id: "tour_reminder",
            source_command: "Create a workflow that sends a reminder 3 days before tours",
            lead_days_before_tour: 3,
            org_metadata: {},
            enrichment_enabled: true,
            interpreted: {
                trigger_label: "tour trigger",
                actions_label: "log scaffold",
                unknowns: [],
            },
        });
        expect(enriched.draft_row?.enabled).toBe(false);
        expect(enriched.draft_review?.version).toBe(1);
        expect(enriched.draft_review?.message_preview.body.length).toBeGreaterThan(10);
        const meta = enriched.draft_row?.metadata as { workflow_assist?: { enrichment_v1?: { advisory_only?: boolean } } };
        expect(meta?.workflow_assist?.enrichment_v1?.advisory_only).toBe(true);
    });

    it("buildWorkflowAssistDraftReviewV1 records rejected fields", () => {
        const review = buildWorkflowAssistDraftReviewV1({
            context: {
                template_id: "tour_reminder",
                source_command: "test",
                deterministic: {
                    name: "A",
                    description: null,
                    event_type: "opportunity_schedule_tour_followup",
                    entity_type: "opportunity",
                    trigger_label: "t",
                    actions_label: "a",
                    unknowns: [],
                },
            },
            raw: { suggested_trigger_event_type: "not_real" },
            message: { body: "msg", provenance: "ai_generated", needs_review: true, unresolved_tokens: [] },
            enrichment_source: "stub_v1",
            rejected_fields: ["suggested_trigger_event_type"],
        });
        expect(review.ai_suggestions.rejected_fields).toContain("suggested_trigger_event_type");
        expect(review.trigger.event_type).toBe("opportunity_schedule_tour_followup");
    });
});
