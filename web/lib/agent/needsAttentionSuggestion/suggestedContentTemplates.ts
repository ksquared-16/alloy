import type { OpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";
import type { AttentionSuggestionChannel, AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";

export type SuggestedContentTemplateKey =
    | "generic_follow_up_short"
    | "pending_decision_check_in"
    | "documents_request_short"
    | "payment_status_check"
    | "scheduled_event_follow_up";

/** Variables for deterministic templates (plain strings for audit). No user-facing record IDs. */
export type SuggestedMessageTemplateContext = {
    entity_id: string;
    /** @deprecated Not interpolated into copy — kept for callers/tests that still pass it. */
    record_ref: string;
    /**
     * Greeting name when known; otherwise a neutral placeholder (never empty).
     * Prefer a real contact / household name from entity resolution — vertical-neutral.
     */
    contact_name: string;
    /** Sign-off line (e.g. team name). Defaults to “Your team” when omitted. */
    team_line?: string;
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

const DEFAULT_TEAM_LINE = "Your team";

const TEMPLATES: Record<SuggestedContentTemplateKey, TemplateDef> = {
    generic_follow_up_short: {
        key: "generic_follow_up_short",
        channel: "email",
        template: `Hi {{contact_name}},

I wanted to follow up on your inquiry. We're ready for the next step whenever you are.

Let us know if you'd like to move forward or if you have any questions.

Thank you,
{{team_line}}`,
        variablesFor: (ctx) => ({
            contact_name: ctx.contact_name,
            team_line: ctx.team_line?.trim() || DEFAULT_TEAM_LINE,
        }),
    },
    pending_decision_check_in: {
        key: "pending_decision_check_in",
        channel: "email",
        template: `Hi {{contact_name}},

Just checking in on where things stand on your side. Whenever you're ready, we're happy to answer questions or help you decide on next steps.

Thank you,
{{team_line}}`,
        variablesFor: (ctx) => ({
            contact_name: ctx.contact_name,
            team_line: ctx.team_line?.trim() || DEFAULT_TEAM_LINE,
        }),
    },
    documents_request_short: {
        key: "documents_request_short",
        channel: "email",
        template: `Hi {{contact_name}},

We're missing a few items we need to keep your request moving. If you can share what's outstanding when you have a moment, we'll take it from there.

Thank you,
{{team_line}}`,
        variablesFor: (ctx) => ({
            contact_name: ctx.contact_name,
            team_line: ctx.team_line?.trim() || DEFAULT_TEAM_LINE,
        }),
    },
    payment_status_check: {
        key: "payment_status_check",
        channel: "email",
        template: `Hi {{contact_name}},

I wanted to touch base on payment or billing status so we can keep things on track. Reply with any questions and we'll help sort it out.

Thank you,
{{team_line}}`,
        variablesFor: (ctx) => ({
            contact_name: ctx.contact_name,
            team_line: ctx.team_line?.trim() || DEFAULT_TEAM_LINE,
        }),
    },
    scheduled_event_follow_up: {
        key: "scheduled_event_follow_up",
        channel: "email",
        template: `Hi {{contact_name}},

Following up after your recent scheduled visit or milestone. We'd love to hear how you'd like to proceed when you have a moment.

Thank you,
{{team_line}}`,
        variablesFor: (ctx) => ({
            contact_name: ctx.contact_name,
            team_line: ctx.team_line?.trim() || DEFAULT_TEAM_LINE,
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
 * Deterministic draft content only — no send path. Copy avoids internal IDs and weak filler phrasing.
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
