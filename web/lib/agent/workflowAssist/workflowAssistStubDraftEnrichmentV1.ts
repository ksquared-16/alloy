import type { WorkflowAssistCreateTemplateIdV1 } from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import type { WorkflowAssistDraftEnrichmentRawV1 } from "@/lib/agent/workflowAssist/workflowAssistDraftEnrichmentV1";
import { buildTourReminderOperatorPreviewMessage } from "@/lib/agent/workflowAssist/workflowAssistMessageVariablesV1";

/**
 * Deterministic stub "AI" enrichment — no network I/O.
 */
export function buildStubWorkflowAssistDraftEnrichmentRaw(input: {
    template_id: WorkflowAssistCreateTemplateIdV1;
    source_command: string;
    lead_days_before_tour?: number | null;
    deterministic_name: string;
    deterministic_description: string | null;
    event_type: string;
}): WorkflowAssistDraftEnrichmentRawV1 {
    const days = input.lead_days_before_tour ?? 3;

    if (input.template_id === "tour_reminder") {
        return {
            suggested_name: input.deterministic_name,
            suggested_description: input.deterministic_description,
            suggested_message_preview: buildTourReminderOperatorPreviewMessage(days),
            suggested_channel: "sms",
            suggested_timing_description: `${days} day(s) before scheduled tour`,
            suggested_trigger_event_type: "opportunity_schedule_tour_followup",
            suggested_entity_type: "opportunity",
            suggested_conditions: [
                "Opportunity has a scheduled tour",
                "Tour is still in the future",
            ],
            missing_information: ["Site/location filters", "Exact send time offset"],
            warnings: [],
            confidence: "medium",
        };
    }

    if (input.template_id === "enrollment_when_move") {
        return {
            suggested_name: input.deterministic_name,
            suggested_description: input.deterministic_description,
            suggested_message_preview: null,
            suggested_channel: null,
            suggested_timing_description: "When opportunity status changes",
            suggested_trigger_event_type: "opportunity_status_changed",
            suggested_entity_type: "opportunity",
            suggested_conditions: ["After form completion", "Target status (e.g. Ready to Enroll)"],
            missing_information: ["Source status", "Target status name"],
            warnings: [],
            confidence: "low",
        };
    }

    return {
        suggested_name: input.deterministic_name,
        suggested_description: input.deterministic_description,
        suggested_message_preview: null,
        suggested_channel: null,
        suggested_timing_description: null,
        suggested_trigger_event_type: input.event_type,
        suggested_entity_type: "opportunity",
        suggested_conditions: [],
        missing_information: ["Template not matched — configure in Automations"],
        warnings: [],
        confidence: "low",
    };
}
