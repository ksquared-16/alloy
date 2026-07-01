import { describe, expect, it } from "vitest";

import { findWorkflowAssistDuplicates } from "@/lib/agent/workflowAssist/workflowAssistDuplicateDetectionV1";
import { buildTourReminderReminderIntentV1 } from "@/lib/agent/workflowAssist/workflowAssistMessageVariablesV1";

const ORG_WF = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("workflowAssistDuplicateDetectionV1", () => {
    const existing = [
        {
            id: ORG_WF,
            name: "Tour Reminder Draft",
            enabled: false,
            event_type: "opportunity_schedule_tour_followup",
            entity_type: "opportunity",
            metadata: {
                workflow_assist: {
                    template_id: "tour_reminder",
                    reminder_intent_v1: buildTourReminderReminderIntentV1({
                        lead_days: 3,
                        channel: "sms",
                        message_preview: "Reminder text",
                    }),
                },
            },
        },
    ];

    it("detects duplicate by template, event, and reminder intent", () => {
        const check = findWorkflowAssistDuplicates(existing, {
            template_id: "tour_reminder",
            proposed_name: "Tour Reminder Draft (new)",
            event_type: "opportunity_schedule_tour_followup",
            entity_type: "opportunity",
            lead_days_before_tour: 3,
            reminder_intent_v1: buildTourReminderReminderIntentV1({
                lead_days: 3,
                channel: "sms",
                message_preview: "Other",
            }),
        });
        expect(check.has_likely_duplicate).toBe(true);
        expect(check.matches[0]?.workflow_id).toBe(ORG_WF);
    });

    it("detects similar name with matching trigger", () => {
        const check = findWorkflowAssistDuplicates(existing, {
            template_id: "tour_reminder",
            proposed_name: "Tour reminder workflow",
            event_type: "opportunity_schedule_tour_followup",
            entity_type: "opportunity",
        });
        expect(check.has_likely_duplicate).toBe(true);
    });

    it("respects scoped duplicate vs different work unit", () => {
        const scopedRows = [
            {
                ...existing[0]!,
                metadata: {
                    scope: { work_unit_id: "11111111-1111-1111-1111-111111111111" },
                    workflow_assist: { template_id: "tour_reminder" },
                },
            },
        ];
        const check = findWorkflowAssistDuplicates(scopedRows, {
            template_id: "tour_reminder",
            proposed_name: "Tour Reminder",
            event_type: "opportunity_schedule_tour_followup",
            entity_type: "opportunity",
            scope: { work_unit_id: "22222222-2222-2222-2222-222222222222" },
        });
        expect(check.has_likely_duplicate).toBe(false);
    });

    it("returns no match for unrelated proposals", () => {
        const check = findWorkflowAssistDuplicates(existing, {
            template_id: "enrollment_when_move",
            proposed_name: "Enrollment move",
            event_type: "opportunity_status_changed",
            entity_type: "opportunity",
        });
        expect(check.has_likely_duplicate).toBe(false);
    });
});
