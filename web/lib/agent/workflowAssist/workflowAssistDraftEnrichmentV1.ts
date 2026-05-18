/**
 * Workflow Assist — AI draft enrichment (advisory only).
 * Raw AI/stub output is validated and normalized before UI or metadata; never applied as workflow truth.
 */

import type { WorkflowAssistCreateTemplateIdV1 } from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import {
    buildOperatorWorkflowLines,
    operatorNeedsReviewItems,
    workflowAssistDisplayTitle,
} from "@/lib/agent/workflowAssist/workflowAssistOperatorCopyV1";

export const WORKFLOW_ASSIST_ALLOWED_EVENT_TYPES = [
    "opportunity_schedule_tour_followup",
    "opportunity_status_changed",
    "entity_status_changed",
] as const;

export type WorkflowAssistAllowedEventTypeV1 = (typeof WORKFLOW_ASSIST_ALLOWED_EVENT_TYPES)[number];

export const WORKFLOW_ASSIST_ALLOWED_CHANNELS = ["sms", "email", "in_app"] as const;

export type WorkflowAssistAllowedChannelV1 = (typeof WORKFLOW_ASSIST_ALLOWED_CHANNELS)[number];

export type WorkflowAssistMessageProvenanceV1 =
    | "org_template"
    | "workflow_template"
    | "ai_generated"
    | "fallback_scaffold"
    | "deterministic_only";

export type WorkflowAssistEnrichmentConfidenceV1 = "deterministic" | "low" | "medium" | "high";

/** Bounded shape from AI/stub before normalization (never persisted verbatim). */
export type WorkflowAssistDraftEnrichmentRawV1 = {
    suggested_name?: string | null;
    suggested_description?: string | null;
    suggested_message_preview?: string | null;
    suggested_channel?: string | null;
    suggested_timing_description?: string | null;
    suggested_trigger_event_type?: string | null;
    suggested_entity_type?: string | null;
    suggested_conditions?: string[] | null;
    missing_information?: string[] | null;
    warnings?: string[] | null;
    confidence?: string | null;
};

export type WorkflowAssistDraftReviewChecklistItemV1 = {
    id: string;
    label: string;
    required: boolean;
};

/** Normalized advisory review surface (safe for UI + metadata snapshot). */
export type WorkflowAssistDraftReviewV1 = {
    version: 1;
    workflow_summary: {
        name: string;
        description: string | null;
        scope_label: string;
        disabled: true;
    };
    trigger: {
        event_type: WorkflowAssistAllowedEventTypeV1;
        entity_type: string;
        timing_description: string;
        human_label: string;
    };
    conditions: string[];
    action_preview: {
        summary: string;
        channel: WorkflowAssistAllowedChannelV1 | null;
        scaffold_only: boolean;
    };
    message_preview: {
        body: string;
        provenance: WorkflowAssistMessageProvenanceV1;
        provenance_label: string;
        needs_review: boolean;
        unresolved_tokens: string[];
    };
    /** Operator-facing compact card (primary UI). */
    operator: {
        display_title: string;
        scope_label: string;
        when_label: string;
        who_label: string;
        action_label: string;
        status_label: string;
        needs_review: string[];
    };
    /** Internal mechanics — default collapsed in UI. */
    advanced: {
        event_type: string;
        entity_type: string;
        trigger_technical: string;
        actions_technical: string;
        description: string | null;
        enrichment_source: string;
        confidence: WorkflowAssistEnrichmentConfidenceV1;
        rejected_fields: string[];
        warnings: string[];
        missing_information: string[];
    };
    ai_suggestions: {
        source: "stub_v1" | "deterministic_v1" | "openai_v1";
        confidence: WorkflowAssistEnrichmentConfidenceV1;
        missing_information: string[];
        warnings: string[];
        rejected_fields: string[];
    };
    /** @deprecated Use operator.needs_review — kept for tests/metadata compatibility. */
    review_checklist: WorkflowAssistDraftReviewChecklistItemV1[];
};

export type WorkflowAssistEnrichmentContextV1 = {
    template_id: WorkflowAssistCreateTemplateIdV1;
    source_command: string;
    lead_days_before_tour?: number | null;
    scope_label?: string | null;
    deterministic: {
        name: string;
        description: string | null;
        event_type: string;
        entity_type: string;
        trigger_label: string;
        actions_label: string;
        unknowns: string[];
    };
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function trimStr(v: unknown, max: number): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim().slice(0, max);
    return t || null;
}

function trimStrArray(v: unknown, maxItems: number, maxLen: number): string[] {
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const x of v) {
        if (typeof x !== "string") continue;
        const t = x.trim().slice(0, maxLen);
        if (t) out.push(t);
        if (out.length >= maxItems) break;
    }
    return out;
}

export function parseWorkflowAssistDraftEnrichmentRaw(body: unknown): WorkflowAssistDraftEnrichmentRawV1 | null {
    if (!isRecord(body)) return null;
    return {
        suggested_name: trimStr(body.suggested_name, 200),
        suggested_description: trimStr(body.suggested_description, 2000),
        suggested_message_preview: trimStr(body.suggested_message_preview, 4000),
        suggested_channel: trimStr(body.suggested_channel, 32),
        suggested_timing_description: trimStr(body.suggested_timing_description, 500),
        suggested_trigger_event_type: trimStr(body.suggested_trigger_event_type, 120),
        suggested_entity_type: trimStr(body.suggested_entity_type, 64),
        suggested_conditions: trimStrArray(body.suggested_conditions, 12, 240),
        missing_information: trimStrArray(body.missing_information, 12, 240),
        warnings: trimStrArray(body.warnings, 16, 400),
        confidence: trimStr(body.confidence, 32),
    };
}

export function normalizeWorkflowAssistEventType(
    raw: string | null | undefined,
    fallback: WorkflowAssistAllowedEventTypeV1
): { value: WorkflowAssistAllowedEventTypeV1; rejected: boolean } {
    const key = String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
    if ((WORKFLOW_ASSIST_ALLOWED_EVENT_TYPES as readonly string[]).includes(key)) {
        return { value: key as WorkflowAssistAllowedEventTypeV1, rejected: false };
    }
    return { value: fallback, rejected: Boolean(raw?.trim()) };
}

export function normalizeWorkflowAssistChannel(
    raw: string | null | undefined,
    fallback: WorkflowAssistAllowedChannelV1 | null
): { value: WorkflowAssistAllowedChannelV1 | null; rejected: boolean } {
    const key = String(raw ?? "")
        .trim()
        .toLowerCase();
    if (key === "sms" || key === "text") return { value: "sms", rejected: key === "text" };
    if (key === "email" || key === "e-mail") return { value: "email", rejected: key === "e-mail" };
    if (key === "in_app" || key === "in-app" || key === "inapp") {
        return { value: "in_app", rejected: key !== "in_app" };
    }
    return { value: fallback, rejected: Boolean(raw?.trim()) };
}

export function normalizeWorkflowAssistConfidence(raw: string | null | undefined): WorkflowAssistEnrichmentConfidenceV1 {
    const k = String(raw ?? "")
        .trim()
        .toLowerCase();
    if (k === "high" || k === "medium" || k === "low") return k;
    return "medium";
}

export function provenanceLabel(provenance: WorkflowAssistMessageProvenanceV1): string {
    switch (provenance) {
        case "org_template":
            return "From org template";
        case "workflow_template":
            return "From workflow template";
        case "ai_generated":
            return "AI-suggested draft";
        case "fallback_scaffold":
            return "Fallback preview";
        default:
            return "Starter preview";
    }
}

export function buildWorkflowAssistDraftReviewV1(input: {
    context: WorkflowAssistEnrichmentContextV1;
    raw: WorkflowAssistDraftEnrichmentRawV1 | null;
    message: {
        body: string;
        provenance: WorkflowAssistMessageProvenanceV1;
        needs_review: boolean;
        unresolved_tokens: string[];
    };
    enrichment_source: WorkflowAssistDraftReviewV1["ai_suggestions"]["source"];
    rejected_fields: string[];
}): WorkflowAssistDraftReviewV1 {
    const det = input.context.deterministic;
    const raw = input.raw;
    const fallbackEvent = normalizeWorkflowAssistEventType(det.event_type, "opportunity_status_changed");
    const eventNorm = normalizeWorkflowAssistEventType(raw?.suggested_trigger_event_type, fallbackEvent.value);
    if (eventNorm.rejected) input.rejected_fields.push("suggested_trigger_event_type");

    const entityType =
        trimStr(raw?.suggested_entity_type, 64)?.toLowerCase() === "opportunity" ||
        det.entity_type === "opportunity" ?
            "opportunity"
        :   "opportunity";

    const channelNorm = normalizeWorkflowAssistChannel(
        raw?.suggested_channel,
        input.context.template_id === "tour_reminder" ? "sms" : null
    );
    if (channelNorm.rejected) input.rejected_fields.push("suggested_channel");

    const name =
        trimStr(raw?.suggested_name, 200) && !input.rejected_fields.includes("suggested_name") ?
            trimStr(raw?.suggested_name, 200)!
        :   det.name;

    const description = trimStr(raw?.suggested_description, 2000) ?? det.description;

    const operatorLines = buildOperatorWorkflowLines({
        template_id: input.context.template_id,
        lead_days_before_tour: input.context.lead_days_before_tour,
        scope_label: input.context.scope_label,
        channel: channelNorm.value,
    });

    const conditions = [
        ...trimStrArray(raw?.suggested_conditions, 8, 240),
        ...det.unknowns.filter((u) => /condition|status|site|field/i.test(u)),
    ].slice(0, 10);

    const missing = trimStrArray(raw?.missing_information, 12, 240);
    const internalWarnings = [
        ...trimStrArray(raw?.warnings, 16, 400),
        ...det.unknowns,
        ...(input.rejected_fields.length ?
            [`Rejected AI fields: ${input.rejected_fields.join(", ")}`]
        :   []),
        ...(input.message.unresolved_tokens.length ?
            [`Preview tokens need Automations mapping: ${input.message.unresolved_tokens.join(", ")}`]
        :   []),
    ].slice(0, 20);

    const needsReview = operatorNeedsReviewItems(input.context.template_id);
    const review_checklist = needsReview.map((label, i) => ({
        id: `review_${i}`,
        label,
        required: true,
    }));

    return {
        version: 1,
        workflow_summary: {
            name,
            description,
            scope_label: input.context.scope_label ?? "Org-wide",
            disabled: true,
        },
        trigger: {
            event_type: eventNorm.value,
            entity_type: entityType,
            timing_description: operatorLines.when_label,
            human_label: det.trigger_label,
        },
        conditions,
        action_preview: {
            summary: operatorLines.action_label,
            channel: channelNorm.value,
            scaffold_only: true,
        },
        message_preview: {
            body: input.message.body,
            provenance: input.message.provenance,
            provenance_label: provenanceLabel(input.message.provenance),
            needs_review: input.message.needs_review,
            unresolved_tokens: input.message.unresolved_tokens,
        },
        operator: {
            display_title: workflowAssistDisplayTitle(input.context.template_id),
            scope_label: input.context.scope_label ?? "Org-wide",
            when_label: operatorLines.when_label,
            who_label: operatorLines.who_label,
            action_label: operatorLines.action_label,
            status_label: operatorLines.status_label,
            needs_review: needsReview,
        },
        advanced: {
            event_type: eventNorm.value,
            entity_type: entityType,
            trigger_technical: det.trigger_label,
            actions_technical: det.actions_label,
            description,
            enrichment_source: input.enrichment_source,
            confidence:
                input.enrichment_source === "deterministic_v1" ?
                    "deterministic"
                :   normalizeWorkflowAssistConfidence(raw?.confidence ?? null),
            rejected_fields: [...input.rejected_fields],
            warnings: internalWarnings,
            missing_information: missing,
        },
        ai_suggestions: {
            source: input.enrichment_source,
            confidence:
                input.enrichment_source === "deterministic_v1" ?
                    "deterministic"
                :   normalizeWorkflowAssistConfidence(raw?.confidence ?? null),
            missing_information: missing,
            warnings: internalWarnings,
            rejected_fields: [...input.rejected_fields],
        },
        review_checklist,
    };
}
