import type { WorkflowAssistCreateTemplateIdV1 } from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import type {
    WorkflowAssistDraftEnrichmentRawV1,
    WorkflowAssistMessageProvenanceV1,
} from "@/lib/agent/workflowAssist/workflowAssistDraftEnrichmentV1";
import {
    buildGenericOperatorPreviewMessage,
    buildTourReminderOperatorPreviewMessage,
    sanitizeWorkflowAssistPreviewMessage,
} from "@/lib/agent/workflowAssist/workflowAssistMessageVariablesV1";

/** Optional org-level templates under org_settings.metadata (advisory; not workflow truth). */
export type OrgWorkflowAssistMessageTemplates = {
    tour_reminder_sms?: string | null;
    enrollment_status_sms?: string | null;
};

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

export type WorkflowAssistResolvedMessagePreviewV1 = {
    body: string;
    provenance: WorkflowAssistMessageProvenanceV1;
    needs_review: boolean;
    unresolved_tokens: string[];
};

export function resolveWorkflowAssistMessagePreview(input: {
    template_id: WorkflowAssistCreateTemplateIdV1;
    lead_days?: number | null;
    org_metadata: unknown;
    ai_raw: WorkflowAssistDraftEnrichmentRawV1 | null;
    existing_workflow_message?: string | null;
}): WorkflowAssistResolvedMessagePreviewV1 {
    const orgTemplates = parseOrgWorkflowAssistMessageTemplates(input.org_metadata);
    const orgBody = resolveOrgTemplateMessage(input.template_id, orgTemplates);
    if (orgBody) {
        const sanitized = sanitizeWorkflowAssistPreviewMessage(orgBody);
        return {
            body: sanitized.body,
            provenance: "org_template",
            needs_review: true,
            unresolved_tokens: sanitized.unresolved_tokens,
        };
    }

    if (input.existing_workflow_message?.trim()) {
        const sanitized = sanitizeWorkflowAssistPreviewMessage(input.existing_workflow_message.trim());
        return {
            body: sanitized.body.slice(0, 4000),
            provenance: "workflow_template",
            needs_review: true,
            unresolved_tokens: sanitized.unresolved_tokens,
        };
    }

    const aiBody = input.ai_raw?.suggested_message_preview?.trim();
    if (aiBody) {
        const sanitized = sanitizeWorkflowAssistPreviewMessage(aiBody);
        return {
            body: sanitized.body.slice(0, 4000),
            provenance: "ai_generated",
            needs_review: true,
            unresolved_tokens: sanitized.unresolved_tokens,
        };
    }

    const days = input.lead_days ?? 3;
    const fallbackBody =
        input.template_id === "tour_reminder" ?
            buildTourReminderOperatorPreviewMessage(days)
        :   buildGenericOperatorPreviewMessage();

    return {
        body: fallbackBody,
        provenance: "fallback_scaffold",
        needs_review: true,
        unresolved_tokens: [],
    };
}
