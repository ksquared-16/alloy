import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    buildTourReminderOperatorPreviewMessage,
    findUnsupportedPreviewTokens,
    sanitizeWorkflowAssistPreviewMessage,
} from "@/lib/agent/workflowAssist/workflowAssistMessageVariablesV1";
import { resolveWorkflowAssistMessagePreview } from "@/lib/agent/workflowAssist/workflowAssistMessageProvenanceV1";
import { enrichWorkflowAssistCreateSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistEnrichCreateProposalV1";
import { buildWorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";

describe("workflowAssistMessageVariablesV1", () => {
    it("flags contact_name as unsupported workflow merge token", () => {
        expect(findUnsupportedPreviewTokens("Hi {{contact_name}}")).toEqual(["contact_name"]);
    });

    it("fallback tour message has no merge tokens", () => {
        const body = buildTourReminderOperatorPreviewMessage(3);
        expect(body).not.toContain("{{");
        expect(body).toMatch(/3 days/i);
    });

    it("sanitizes unsupported tokens to bracket placeholders", () => {
        const { body, unresolved_tokens } = sanitizeWorkflowAssistPreviewMessage("Hi {{contact_name}}, thanks");
        expect(unresolved_tokens).toContain("contact_name");
        expect(body).toContain("[Family first name]");
        expect(body).not.toContain("{{contact_name}}");
    });

    it("resolve preview fallback does not use contact_name", () => {
        const msg = resolveWorkflowAssistMessagePreview({
            template_id: "tour_reminder",
            lead_days: 3,
            org_metadata: {},
            ai_raw: null,
        });
        expect(msg.body).not.toMatch(/\{\{contact_name\}\}/);
        expect(msg.provenance).toBe("fallback_scaffold");
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
        expect(src).not.toContain("read-only summary cards above");
        expect(src).not.toContain("AI-assisted ·");
    });

    it("enriched suggestion has operator section and empty public warnings", () => {
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
        expect(enriched.draft_review?.operator.needs_review.length).toBeLessThanOrEqual(4);
        expect(enriched.reasoning.warnings).toEqual([]);
        expect(enriched.draft_row?.enabled).toBe(false);
    });
});
