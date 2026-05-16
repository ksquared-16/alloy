import type { WorkflowAssistCreateTemplateIdV1 } from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import type {
    WorkflowAssistDraftEnrichmentRawV1,
    WorkflowAssistMessageProvenanceV1,
} from "@/lib/agent/workflowAssist/workflowAssistDraftEnrichmentV1";

/** Optional org-level templates under org_settings.metadata (advisory; not workflow truth). */
export type OrgWorkflowAssistMessageTemplates = {
    tour_reminder_sms?: string | null;
    enrollment_status_sms?: string | null;
};

const FALLBACK_TOUR_REMINDER_SMS = `Hi {{contact_name}},

This is a friendly reminder about your upcoming tour. If you need to reschedule, reply to this message.

Thanks,
{{team_line}}`;

const FALLBACK_GENERIC_SMS = `Hi {{contact_name}},

Following up from our team. Let us know if you have questions.

Thanks,
{{team_line}}`;

export function parseOrgWorkflowAssistMessageTemplates(metadata: unknown): OrgWorkflowAssistMessageTemplates {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
    const w = (metadata as Record<string, unknown>).workflow_assist_message_templates;
    if (!w || typeof w !== "object" || Array.isArray(w)) return {};
    const o = w as Record<string, unknown>;
    return {
        tour_reminder_sms: typeof o.tour_reminder_sms === "string" ? o.tour_reminder_sms.slice(0, 4000) : null,
        enrollment_status_sms:
            typeof o.enrollment_status_sms === "string" ? o.enrollment_status_sms.slice(0, 4000) : null,
    };
}

export function resolveOrgTemplateMessage(
    template_id: WorkflowAssistCreateTemplateIdV1,
    orgTemplates: OrgWorkflowAssistMessageTemplates
): string | null {
    if (template_id === "tour_reminder" && orgTemplates.tour_reminder_sms?.trim()) {
        return orgTemplates.tour_reminder_sms.trim();
    }
    if (template_id === "enrollment_when_move" && orgTemplates.enrollment_status_sms?.trim()) {
        return orgTemplates.enrollment_status_sms.trim();
    }
    return null;
}

export function buildFallbackScaffoldMessage(input: {
    template_id: WorkflowAssistCreateTemplateIdV1;
    lead_days?: number | null;
}): string {
    if (input.template_id === "tour_reminder") {
        const days = input.lead_days ?? 3;
        return (
            `[Review before enable] Reminder ~${days} day(s) before tour: personalize greeting and tour date. ` +
            `Placeholder variables: {{contact_name}}, {{team_line}}.`
        );
    }
    return FALLBACK_GENERIC_SMS;
}

export function resolveWorkflowAssistMessagePreview(input: {
    template_id: WorkflowAssistCreateTemplateIdV1;
    lead_days?: number | null;
    org_metadata: unknown;
    ai_raw: WorkflowAssistDraftEnrichmentRawV1 | null;
    existing_workflow_message?: string | null;
}): { body: string; provenance: WorkflowAssistMessageProvenanceV1; needs_review: boolean } {
    const orgTemplates = parseOrgWorkflowAssistMessageTemplates(input.org_metadata);
    const orgBody = resolveOrgTemplateMessage(input.template_id, orgTemplates);
    if (orgBody) {
        return { body: orgBody, provenance: "org_template", needs_review: true };
    }

    if (input.existing_workflow_message?.trim()) {
        return {
            body: input.existing_workflow_message.trim().slice(0, 4000),
            provenance: "workflow_template",
            needs_review: true,
        };
    }

    const aiBody = input.ai_raw?.suggested_message_preview?.trim();
    if (aiBody) {
        return { body: aiBody.slice(0, 4000), provenance: "ai_generated", needs_review: true };
    }

    if (input.template_id === "tour_reminder") {
        return {
            body: FALLBACK_TOUR_REMINDER_SMS,
            provenance: "fallback_scaffold",
            needs_review: true,
        };
    }

    return {
        body: buildFallbackScaffoldMessage(input),
        provenance: "fallback_scaffold",
        needs_review: true,
    };
}
