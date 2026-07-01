import type { OpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";
import type { AttentionSuggestionActionFamily } from "@/lib/agent/needsAttentionSuggestion/types";

export type SuggestionActionRow = {
    key: string;
    label: string;
    action_family: AttentionSuggestionActionFamily;
};

const MAP: Readonly<Record<OpportunityAttentionReasonCode, SuggestionActionRow>> = {
    follow_up_date_passed: {
        key: "complete_follow_up",
        label: "Follow up",
        action_family: "follow_up",
    },
    tour_date_passed: {
        key: "complete_scheduled_event_follow_up",
        label: "Follow up after scheduled event",
        action_family: "follow_up",
    },
    overdue_commitment: {
        key: "resolve_commitment",
        label: "Resolve overdue commitment",
        action_family: "review",
    },
    missing_quote_after_execution: {
        key: "prepare_offer_or_quote",
        label: "Prepare offer or quote",
        action_family: "update_record",
    },
    stale_quote_followup: {
        key: "check_pending_decision",
        label: "Check on pending decision",
        action_family: "follow_up",
    },
    missing_identity: {
        key: "link_primary_person_or_account",
        label: "Link primary person or account",
        action_family: "update_record",
    },
    missing_required_info: {
        key: "complete_required_information",
        label: "Complete required information",
        action_family: "update_record",
    },
    high_value_stale: {
        key: "reengage_priority_record",
        label: "Re-engage priority record",
        action_family: "follow_up",
    },
    mid_funnel_stale: {
        key: "advance_or_pause_record",
        label: "Advance or pause record",
        action_family: "review",
    },
    stale_new_inquiry: {
        key: "respond_to_new_request",
        label: "Respond to new request",
        action_family: "follow_up",
    },
    stale_qualified: {
        key: "move_qualified_record_forward",
        label: "Move qualified record forward",
        action_family: "review",
    },
    waiting_on_family: {
        key: "request_external_response",
        label: "Request external response",
        action_family: "follow_up",
    },
    waiting_on_staff: {
        key: "complete_internal_action",
        label: "Complete internal action",
        action_family: "review",
    },
    waiting_on_documents: {
        key: "request_documents",
        label: "Request documents",
        action_family: "send_message",
    },
    waiting_on_payment: {
        key: "confirm_payment_status",
        label: "Confirm payment status",
        action_family: "send_message",
    },
    blocked_internal: {
        key: "resolve_internal_blocker",
        label: "Resolve internal blocker",
        action_family: "review",
    },
    blocked_external: {
        key: "track_external_dependency",
        label: "Track external dependency",
        action_family: "review",
    },
    stage_work_overdue: {
        key: "complete_stage_work",
        label: "Complete overdue stage work",
        action_family: "review",
    },
    stage_age_exceeded: {
        key: "advance_stale_stage_record",
        label: "Advance stale stage record",
        action_family: "review",
    },
    stage_missing_required_fields: {
        key: "complete_stage_required_fields",
        label: "Complete stage required fields",
        action_family: "update_record",
    },
    stage_attempts_incomplete: {
        key: "complete_stage_contact_attempts",
        label: "Complete stage contact attempts",
        action_family: "follow_up",
    },
};

export function suggestionActionForReasonCode(code: string): SuggestionActionRow {
    const row = MAP[code as OpportunityAttentionReasonCode];
    if (row) return row;
    return {
        key: "review_operational_state",
        label: "Review operational state",
        action_family: "review",
    };
}
