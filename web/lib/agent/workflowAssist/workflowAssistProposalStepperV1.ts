import type { WorkflowAssistDraftReviewV1 } from "@/lib/agent/workflowAssist/workflowAssistDraftEnrichmentV1";
import type { WorkflowAssistCreateTemplateIdV1 } from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";

export type WorkflowAssistProposalStepV1 = {
    id: string;
    title: string;
    body: string;
};

function triggerStepBody(template_id: WorkflowAssistCreateTemplateIdV1, event_type: string): string {
    if (template_id === "tour_reminder" || event_type === "opportunity_schedule_tour_followup") {
        return "A tour follow-up signal is created";
    }
    if (template_id === "enrollment_when_move" || event_type === "opportunity_status_changed") {
        return "An opportunity status change is recorded";
    }
    return "On the configured workflow trigger";
}

export function buildWorkflowAssistProposalStepperV1(input: {
    review: WorkflowAssistDraftReviewV1;
    template_id: WorkflowAssistCreateTemplateIdV1;
}): WorkflowAssistProposalStepV1[] {
    const { review, template_id } = input;
    const op = review.operator;

    return [
        {
            id: "trigger",
            title: "Trigger",
            body: triggerStepBody(template_id, review.trigger.event_type),
        },
        {
            id: "timing",
            title: "Timing",
            body: op.when_label,
        },
        {
            id: "audience",
            title: "Audience",
            body: op.who_label,
        },
        {
            id: "action",
            title: "Action",
            body: op.action_label,
        },
        {
            id: "message",
            title: "Message",
            body: review.message_preview.body,
        },
    ];
}
