import type { WorkflowAssistCreateTemplateIdV1 } from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";

export function workflowAssistDisplayTitle(template_id: WorkflowAssistCreateTemplateIdV1): string {
    switch (template_id) {
        case "tour_reminder":
            return "Tour reminder workflow";
        case "enrollment_when_move":
            return "Enrollment status workflow";
        default:
            return "Workflow draft";
    }
}

export function buildOperatorWorkflowLines(input: {
    template_id: WorkflowAssistCreateTemplateIdV1;
    lead_days_before_tour?: number | null;
    scope_label?: string | null;
    channel?: "sms" | "email" | "in_app" | null;
}): {
    when_label: string;
    who_label: string;
    action_label: string;
    status_label: string;
} {
    const scope = input.scope_label?.trim();
    const scopeSuffix =
        scope && scope !== "Org-wide" ? ` in ${scope}` : scope === "Org-wide" ? " (org-wide)" : "";

    if (input.template_id === "tour_reminder") {
        const days = input.lead_days_before_tour ?? 3;
        const dayWord = days === 1 ? "day" : "days";
        return {
            when_label: `${days} ${dayWord} before a scheduled tour`,
            who_label: `Families with upcoming tours${scopeSuffix}`,
            action_label: input.channel === "email" ? "Send email reminder" : "Send SMS reminder",
            status_label: "Disabled until you enable it in Automations",
        };
    }

    if (input.template_id === "enrollment_when_move") {
        return {
            when_label: "When an opportunity status changes (configure exact transition in Automations)",
            who_label: `Matching enrollment opportunities${scopeSuffix}`,
            action_label: "Update status / notify (configure in Automations)",
            status_label: "Disabled until you enable it in Automations",
        };
    }

    return {
        when_label: "On configured trigger (set in Automations)",
        who_label: `Matching records${scopeSuffix}`,
        action_label: "Configured actions (add in Automations)",
        status_label: "Disabled until you enable it in Automations",
    };
}

export const WORKFLOW_ASSIST_OPERATOR_NEEDS_REVIEW_TOUR: readonly string[] = [
    "Confirm timing (days before tour)",
    "Confirm audience and conditions",
    "Review message copy",
    "Enable from Automations when ready",
];

export const WORKFLOW_ASSIST_OPERATOR_NEEDS_REVIEW_GENERIC: readonly string[] = [
    "Confirm trigger and conditions",
    "Review actions and message content",
    "Enable from Automations when ready",
];

export function operatorNeedsReviewItems(template_id: WorkflowAssistCreateTemplateIdV1): string[] {
    return template_id === "tour_reminder" ?
            [...WORKFLOW_ASSIST_OPERATOR_NEEDS_REVIEW_TOUR]
        :   [...WORKFLOW_ASSIST_OPERATOR_NEEDS_REVIEW_GENERIC];
}
