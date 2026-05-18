import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    TOUR_REMINDER_TOUR_DATE_MERGE_PATH,
    TOUR_REMINDER_TOUR_TIME_MERGE_PATH,
    buildTourReminderOperatorPreviewMessage,
    buildTourReminderReminderIntentV1,
    findUnsupportedPreviewTokens,
    mergeTokenForPath,
    sanitizeWorkflowAssistPreviewMessage,
} from "@/lib/agent/workflowAssist/workflowAssistMessageVariablesV1";
import { resolveWorkflowAssistMessagePreview } from "@/lib/agent/workflowAssist/workflowAssistMessageProvenanceV1";
import { enrichWorkflowAssistCreateSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistEnrichCreateProposalV1";
import { buildWorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";

describe("workflowAssistMessageVariablesV1", () => {
    it("flags contact_name as unsupported workflow merge token", () => {
        expect(findUnsupportedPreviewTokens("Hi {{contact_name}}")).toEqual(["contact_name"]);
    });

    it("does not flag documented opportunity tour merge paths as unsupported", () => {
        const body = buildTourReminderOperatorPreviewMessage(3);
        expect(body).toContain(mergeTokenForPath(TOUR_REMINDER_TOUR_DATE_MERGE_PATH));
        expect(body).toContain(mergeTokenForPath(TOUR_REMINDER_TOUR_TIME_MERGE_PATH));
        expect(findUnsupportedPreviewTokens(body)).toEqual([]);
    });

    it("sanitizes unsupported tokens to bracket placeholders", () => {
        const { body, unresolved_tokens } = sanitizeWorkflowAssistPreviewMessage("Hi {{contact_name}}, thanks");
        expect(unresolved_tokens).toContain("contact_name");
        expect(body).toContain("[Family first name]");
        expect(body).not.toContain("{{contact_name}}");
    });

    it("resolve preview fallback uses documented tour date/time tokens", () => {
        const msg = resolveWorkflowAssistMessagePreview({
            template_id: "tour_reminder",
            lead_days: 3,
            org_metadata: {},
            ai_raw: null,
        });
        expect(msg.body).toContain("{{opportunity.metadata.tour_date}}");
        expect(msg.body).toContain("{{opportunity.metadata.tour_time}}");
        expect(msg.body).not.toMatch(/\{\{contact_name\}\}/);
        expect(msg.provenance).toBe("fallback_scaffold");
    });

    it("buildTourReminderReminderIntentV1 records unresolved mappings for operator review", () => {
        const intent = buildTourReminderReminderIntentV1({
            lead_days: 3,
            channel: "sms",
            message_preview: buildTourReminderOperatorPreviewMessage(3),
        });
        expect(intent.action).toBe("send_reminder");
        expect(intent.channel).toBe("sms");
        expect(intent.timing.days).toBe(3);
        expect(intent.tour_date_field).toBe(TOUR_REMINDER_TOUR_DATE_MERGE_PATH);
        expect(intent.unresolved_mappings.length).toBeGreaterThanOrEqual(2);
        expect(intent.unresolved_mappings.every((m) => m.needs_mapping)).toBe(true);
    });
});

describe("workflowAssist proposal review UX", () => {
    it("compact review panel contract", () => {
        const src = readFileSync(
            join(process.cwd(), "app/adminV2/components/aiCommandSurface/WorkflowAssistProposalReviewPanel.tsx"),
            "utf8"
        );
        expect(src).toContain("data-command-surface-workflow-assist-advanced-details");
        expect(src).toContain("<details");
        expect(src).toContain("data-command-surface-workflow-assist-safety-once");
        expect(src).toContain('label="Uses"');
        expect(src).toContain("CommandSurfaceCardLink");
        expect(src).not.toContain("read-only summary cards above");
        expect(src).not.toContain("AI-assisted ·");
    });

    it("enriched suggestion has operator tour fields and reminder intent metadata", () => {
        const base = buildWorkflowAssistSuggestionV1({
            orgId: "22222222-2222-2222-2222-222222222222",
            actorUserId: "33333333-3333-3333-3333-333333333333",
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
        });
        expect(enriched.draft_review?.operator.display_title).toBe("Tour reminder workflow");
        expect(enriched.draft_review?.operator.uses_label).toMatch(/tour date/i);
        expect(enriched.draft_review?.operator.needs_review).toContain("Confirm recipient");
        expect(enriched.draft_review?.message_preview.body).toContain("{{opportunity.metadata.tour_date}}");
        expect(enriched.reasoning.warnings).toEqual([]);
        expect(enriched.draft_row?.enabled).toBe(false);

        const wa = (enriched.draft_row?.metadata as { workflow_assist?: { reminder_intent_v1?: { action: string } } })
            ?.workflow_assist;
        expect(wa?.reminder_intent_v1?.action).toBe("send_reminder");
    });
});
