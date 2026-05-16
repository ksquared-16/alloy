import type { WorkflowAssistCreateTemplateIdV1 } from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import type { WorkflowAssistDraftEnrichmentRawV1 } from "@/lib/agent/workflowAssist/workflowAssistDraftEnrichmentV1";

/**
 * Deterministic stub "AI" enrichment — no network I/O.
 * Produces bounded raw enrichment for normalization (staging/openai policy branches can swap provider later).
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
    const cmd = input.source_command.trim().slice(0, 500);

    if (input.template_id === "tour_reminder") {
        return {
            suggested_name: input.deterministic_name,
            suggested_description:
                input.deterministic_description ??
                `Reminder workflow draft (~${days}d before tour). Review timing, conditions, and SMS copy before enabling.`,
            suggested_message_preview:
                `Hi {{contact_name}},\n\nJust a reminder about your upcoming tour` +
                (days ? ` in about ${days} days` : "") +
                `. Reply if you need to reschedule.\n\nThanks,\n{{team_line}}`,
            suggested_channel: "sms",
            suggested_timing_description: `Approximately ${days} day(s) before the tour-related enrollment signal`,
            suggested_trigger_event_type: "opportunity_schedule_tour_followup",
            suggested_entity_type: "opportunity",
            suggested_conditions: [
                "Opportunity has a scheduled tour date",
                "Opportunity status is tour_scheduled (configure in Automations)",
                "Exclude families who already completed enrollment",
            ],
            missing_information: [
                "Exact site/location filter not inferred from command",
                "Approved sender number and template variables must be confirmed",
            ],
            warnings: [
                "Stub enrichment only — verify copy with your enrollment team before enabling.",
                cmd.length < 12 ? "Command was very short; defaults may not match intent." : null,
            ].filter((x): x is string => Boolean(x)),
            confidence: "medium",
        };
    }

    if (input.template_id === "enrollment_when_move") {
        return {
            suggested_name: input.deterministic_name,
            suggested_description:
                input.deterministic_description ??
                "Status-transition draft from when/move language. Map real form-complete event and target status in Automations.",
            suggested_message_preview: null,
            suggested_channel: null,
            suggested_timing_description: "When opportunity status changes (configure source/target in Automations)",
            suggested_trigger_event_type: "opportunity_status_changed",
            suggested_entity_type: "opportunity",
            suggested_conditions: ["Source status after form completion", "Target status (e.g. Ready to Enroll)"],
            missing_information: [
                "Form-complete event type not inferred",
                "Target status not specified in command",
            ],
            warnings: ["No message action scaffolded — add steps manually in Automations."],
            confidence: "low",
        };
    }

    return {
        suggested_name: input.deterministic_name,
        suggested_description: input.deterministic_description,
        suggested_message_preview: null,
        suggested_channel: null,
        suggested_timing_description: "Configure trigger timing in Automations",
        suggested_trigger_event_type: input.event_type,
        suggested_entity_type: "opportunity",
        suggested_conditions: [],
        missing_information: ["No template matched — configure workflow manually."],
        warnings: ["Generic stub — review all fields before enabling."],
        confidence: "low",
    };
}
