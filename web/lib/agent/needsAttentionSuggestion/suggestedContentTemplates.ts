import type { OpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";
import type { AttentionSuggestionChannel, AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";

export type SuggestedContentTemplateKey =
    | "generic_follow_up_short"
    | "pending_decision_check_in"
    | "documents_request_short"
    | "payment_status_check"
    | "scheduled_event_follow_up";

/** Variables for deterministic templates (all values are plain strings for audit). */
export type SuggestedMessageTemplateContext = {
    entity_id: string;
    /** Short human-facing id tail for drafts. */
    record_ref: string;
    /**
     * Greeting name when known; otherwise a neutral placeholder (never empty).
     * Vertical-neutral default — not childcare-specific.
     */
    contact_name: string;
};

function fill(template: string, vars: Record<string, string>): string {
    let out = template;
    for (const [k, v] of Object.entries(vars)) {
        out = out.split(`{{${k}}}`).join(v);
    }
    return out;
}

type TemplateDef = {
    key: SuggestedContentTemplateKey;
    channel: AttentionSuggestionChannel;
    template: string;
    variablesFor: (ctx: SuggestedMessageTemplateContext) => Record<string, string>;
};

const TEMPLATES: Record<SuggestedContentTemplateKey, TemplateDef> = {
    generic_follow_up_short: {
        key: "generic_follow_up_short",
        channel: "email",
        template:
            "Hello {{contact_name}}, following up regarding this inquiry (reference {{record_ref}}). Please reply when you can.",
        variablesFor: (ctx) => ({
            contact_name: ctx.contact_name,
            record_ref: ctx.record_ref,
        }),
    },
    pending_decision_check_in: {
        key: "pending_decision_check_in",
        channel: "email",
        template:
            "Hello {{contact_name}}, checking in on a pending decision for this inquiry (reference {{record_ref}}). Let us know if you have questions.",
        variablesFor: (ctx) => ({
            contact_name: ctx.contact_name,
            record_ref: ctx.record_ref,
        }),
    },
    documents_request_short: {
        key: "documents_request_short",
        channel: "email",
        template:
            "Hello {{contact_name}}, we still need outstanding documents to move this inquiry forward (reference {{record_ref}}). Please upload or send them when you can.",
        variablesFor: (ctx) => ({
            contact_name: ctx.contact_name,
            record_ref: ctx.record_ref,
        }),
    },
    payment_status_check: {
        key: "payment_status_check",
        channel: "email",
        template:
            "Hello {{contact_name}}, confirming payment status for this inquiry (reference {{record_ref}}). Please reply with any questions.",
        variablesFor: (ctx) => ({
            contact_name: ctx.contact_name,
            record_ref: ctx.record_ref,
        }),
    },
    scheduled_event_follow_up: {
        key: "scheduled_event_follow_up",
        channel: "email",
        template:
            "Hello {{contact_name}}, following up after a recent scheduled appointment tied to this inquiry (reference {{record_ref}}). We would appreciate a quick update when convenient.",
        variablesFor: (ctx) => ({
            contact_name: ctx.contact_name,
            record_ref: ctx.record_ref,
        }),
    },
};

const REASON_TO_TEMPLATE_KEY: Partial<Record<OpportunityAttentionReasonCode, SuggestedContentTemplateKey>> = {
    follow_up_date_passed: "generic_follow_up_short",
    stale_new_inquiry: "generic_follow_up_short",
    high_value_stale: "generic_follow_up_short",
    mid_funnel_stale: "generic_follow_up_short",
    stale_qualified: "generic_follow_up_short",
    waiting_on_family: "generic_follow_up_short",
    waiting_on_staff: "generic_follow_up_short",
    blocked_internal: "generic_follow_up_short",
    blocked_external: "generic_follow_up_short",
    stale_quote_followup: "pending_decision_check_in",
    missing_quote_after_execution: "pending_decision_check_in",
    overdue_commitment: "generic_follow_up_short",
    missing_identity: "generic_follow_up_short",
    waiting_on_documents: "documents_request_short",
    waiting_on_payment: "payment_status_check",
    tour_date_passed: "scheduled_event_follow_up",
};

/**
 * Deterministic draft content only — no send path.
 * Returns null when no template is mapped for this reason (V1 conservative).
 */
export function suggestedContentForReason(
    primaryReasonCode: string,
    ctx: SuggestedMessageTemplateContext,
): NonNullable<AttentionSuggestionV1["suggested_content"]> | null {
    const tk = REASON_TO_TEMPLATE_KEY[primaryReasonCode as OpportunityAttentionReasonCode];
    if (!tk) return null;
    const def = TEMPLATES[tk];
    const variables = def.variablesFor(ctx);
    const body = fill(def.template, variables);
    return {
        channel: def.channel,
        template_key: def.key,
        body,
        variables,
    };
}
