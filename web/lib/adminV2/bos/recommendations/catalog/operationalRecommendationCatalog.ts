/**
 * Deterministic operational recommendation catalog (Phase 1 / Card 1.2).
 * Replaces generic {@link suggestionActionMap} labels over time — not wired to builders yet.
 */

import type { OpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";
import {
    renderCatalogTemplate,
    renderCatalogTemplateWithOptionalClauses,
} from "@/lib/adminV2/bos/recommendations/catalog/recommendationCopyTemplates";
import type {
    CatalogInterpolationValues,
    OperationalRecommendationCatalogEntryV1,
    OperationalRecommendationCatalogKey,
    RenderedCatalogCopyV1,
} from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogTypes";
import { validateOperationalRecommendationCatalog } from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogValidation";

/** Phase 1 minimum coverage (execution pack + sprint audit). */
export const PHASE1_REQUIRED_CATALOG_KEYS = [
    "stale_new_inquiry",
    "follow_up_date_passed",
    "tour_date_passed",
    "waiting_on_family",
    "waiting_on_staff",
    "high_value_stale",
    "unanswered_inbound",
    "sla_breach",
] as const satisfies readonly OperationalRecommendationCatalogKey[];

/**
 * `waiting_on_internal` is not a platform reason code — use `waiting_on_staff`.
 * @see docs/sprints/archive/05_2026/bos_operational_recommendation_phase1_execution.md
 */
export const WAITING_ON_INTERNAL_CATALOG_KEY = "waiting_on_staff" as const satisfies OpportunityAttentionReasonCode;

function entry(
    partial: OperationalRecommendationCatalogEntryV1
): OperationalRecommendationCatalogEntryV1 {
    return partial;
}

const CATALOG_ENTRIES: OperationalRecommendationCatalogEntryV1[] = [
    entry({
        catalog_key: "stale_new_inquiry",
        attention_reason_code: "stale_new_inquiry",
        template_id: "stale_new_inquiry.full.v1",
        tier: "full",
        recommendation_type: "communication",
        default_urgency_band: "p1_today",
        default_confidence_level: "high",
        trust_boundary: "insight_only",
        title_template: "New inquiry needs timely response",
        current_state_summary_template: "{{primary_label}} · new inquiry awaiting first staff response",
        why_it_matters_template: "{{intake_age_phrase}}. Timely first contact keeps this inquiry active.",
        urgency_reason_template: "{{urgency_reason_line}}",
        recommended_action: {
            key: "send_first_response",
            labelTemplate: "Send a warm first response and confirm the family's preferred next step",
            action_family: "follow_up",
        },
        action_rationale_template:
            "A clear first reply sets expectations and keeps this inquiry in an active conversation.",
        likely_outcome_template:
            "Timely outreach should improve the chance of scheduling a tour or follow-up conversation.",
        likely_risk_template: "Delayed first contact often leads to families choosing another provider.",
        available_actions: [
            { key: "draft_sms", label: "Draft SMS", kind: "task_assist_intent", intent: "draft_message" },
            { key: "draft_email", label: "Draft email", kind: "task_assist_intent", intent: "draft_message" },
        ],
        required_grounding_signals: ["primary_attention_reason", "status_stale_new_inquiry"],
        stale_validation_hints: ["status_key", "activity_signal_key", "primary_reason_code"],
        workflow_reference_hints: null,
        communication_reference_hints: {
            channel_hint: "email",
            timing_hint_template: "within 24 hours",
            template_key: null,
        },
        escalation_hints: null,
        required_interpolation: ["primary_label", "intake_age_phrase", "urgency_reason_line"],
    }),

    entry({
        catalog_key: "follow_up_date_passed",
        attention_reason_code: "follow_up_date_passed",
        template_id: "follow_up_date_passed.full.v1",
        tier: "full",
        recommendation_type: "operational",
        default_urgency_band: "p1_today",
        default_confidence_level: "high",
        trust_boundary: "insight_only",
        title_template: "Follow-up commitment is overdue",
        current_state_summary_template: "{{primary_label}} · {{timing_phrase}}",
        why_it_matters_template:
            "The recorded follow-up date has passed without a completed touch. The family may be waiting on a clear next step from your team.",
        urgency_reason_template: "Commitment date passed · {{sla_tier}} vs goal",
        recommended_action: {
            key: "complete_follow_up",
            labelTemplate: "Complete the overdue follow-up and log the next step on the record",
            action_family: "follow_up",
        },
        action_rationale_template:
            "Closing the overdue commitment restores trust and keeps pipeline timing accurate.",
        likely_outcome_template: "The family receives clarity on what happens next in the process.",
        likely_risk_template: null,
        available_actions: [
            { key: "draft_sms", label: "Draft SMS", kind: "task_assist_intent", intent: "draft_message" },
            { key: "set_reminder", label: "Set reminder", kind: "task_assist_intent", intent: "create_reminder" },
        ],
        required_grounding_signals: ["primary_attention_reason", "sla_breached"],
        stale_validation_hints: ["primary_reason_code", "status_key"],
        workflow_reference_hints: null,
        communication_reference_hints: null,
        escalation_hints: null,
        required_interpolation: ["primary_label", "timing_phrase"],
    }),

    entry({
        catalog_key: "tour_date_passed",
        attention_reason_code: "tour_date_passed",
        template_id: "tour_date_passed.full.v1",
        tier: "full",
        recommendation_type: "communication",
        default_urgency_band: "p1_today",
        default_confidence_level: "high",
        trust_boundary: "insight_only",
        title_template: "Post-tour follow-up is due",
        current_state_summary_template: "{{primary_label}} · scheduled tour date has passed",
        why_it_matters_template:
            "The tour window has passed without a documented outcome. Families in tour stages often need a prompt check-in to keep enrollment momentum.",
        urgency_reason_template: "Tour follow-up window · {{severity}} priority",
        recommended_action: {
            key: "complete_scheduled_event_follow_up",
            labelTemplate: "Confirm how the tour went and propose the next enrollment step",
            action_family: "follow_up",
        },
        action_rationale_template:
            "Post-tour clarity prevents qualified families from stalling between tour and application.",
        likely_outcome_template: "You should learn whether the family is moving forward, needs another touch, or should be paused.",
        likely_risk_template: "Quiet periods after tours are a common drop-off point in enrollment funnels.",
        available_actions: [
            { key: "draft_email", label: "Draft email", kind: "task_assist_intent", intent: "draft_message" },
        ],
        required_grounding_signals: ["primary_attention_reason"],
        stale_validation_hints: ["primary_reason_code", "status_key"],
        workflow_reference_hints: null,
        communication_reference_hints: {
            channel_hint: "email",
            timing_hint_template: "within 24 hours",
            template_key: null,
        },
        escalation_hints: null,
        required_interpolation: ["primary_label"],
    }),

    entry({
        catalog_key: "waiting_on_family",
        attention_reason_code: "waiting_on_family",
        template_id: "waiting_on_family.full.v1",
        tier: "full",
        recommendation_type: "communication",
        default_urgency_band: "p2_soon",
        default_confidence_level: "medium",
        trust_boundary: "insight_only",
        title_template: "Waiting on family response",
        current_state_summary_template: "{{primary_label}} · {{wait_bucket_label}} [[· {{timing_phrase}}]]",
        why_it_matters_template:
            "The next step depends on the family, and the wait has reached a point where a polite check-in may unblock progress without pressure.",
        urgency_reason_template: "Family wait · {{sla_tier}} vs goal",
        recommended_action: {
            key: "request_external_response",
            labelTemplate: "Send a brief check-in confirming they received your last request",
            action_family: "follow_up",
        },
        action_rationale_template:
            "Light outreach can surface questions or timing constraints without advancing status prematurely.",
        likely_outcome_template: "The family may reply with timing, questions, or documents needed to move forward.",
        likely_risk_template: null,
        available_actions: [
            { key: "draft_sms", label: "Draft SMS", kind: "task_assist_intent", intent: "draft_message" },
        ],
        required_grounding_signals: ["wait_bucket_waiting_on_family", "wait_duration"],
        stale_validation_hints: ["waiting_bucket", "waiting_since_iso"],
        workflow_reference_hints: null,
        communication_reference_hints: {
            channel_hint: "sms",
            timing_hint_template: "when appropriate this week",
            template_key: null,
        },
        escalation_hints: null,
        required_interpolation: ["primary_label", "wait_bucket_label"],
    }),

    entry({
        catalog_key: "waiting_on_staff",
        attention_reason_code: "waiting_on_staff",
        template_id: "waiting_on_staff.full.v1",
        tier: "full",
        recommendation_type: "operational",
        default_urgency_band: "p1_today",
        default_confidence_level: "high",
        trust_boundary: "insight_only",
        title_template: "Staff action is outstanding",
        current_state_summary_template: "{{primary_label}} · {{wait_bucket_label}} [[· {{timing_phrase}}]]",
        why_it_matters_template:
            "Internal staff owe the next step on this record. Delays here block the family even when they are ready to proceed.",
        urgency_reason_template: "Staff wait · {{sla_tier}} vs goal",
        recommended_action: {
            key: "complete_internal_action",
            labelTemplate: "Complete the internal task and update the record with the outcome",
            action_family: "review",
        },
        action_rationale_template:
            "Resolving staff-owned work unlocks the pipeline without shifting responsibility to the family.",
        likely_outcome_template: "The inquiry can advance to the next stage once the internal step is done.",
        likely_risk_template: "Extended staff delays often show up as family disengagement in reporting.",
        available_actions: [{ key: "open_record", label: "Open record sections", kind: "drawer_tab" }],
        required_grounding_signals: ["wait_bucket_waiting_on_staff", "wait_duration"],
        stale_validation_hints: ["waiting_bucket", "waiting_since_iso"],
        workflow_reference_hints: null,
        communication_reference_hints: null,
        escalation_hints: null,
        required_interpolation: ["primary_label", "wait_bucket_label"],
    }),

    entry({
        catalog_key: "high_value_stale",
        attention_reason_code: "high_value_stale",
        template_id: "high_value_stale.full.v1",
        tier: "full",
        recommendation_type: "conversion",
        default_urgency_band: "p1_today",
        default_confidence_level: "medium",
        trust_boundary: "insight_only",
        title_template: "High-value inquiry needs re-engagement",
        current_state_summary_template: "{{primary_label}} · mid-funnel inactivity [[~{{days}} days]]",
        why_it_matters_template:
            "This inquiry is in a high-intent stage but has gone quiet. Mid-funnel stalls on prioritized records often need a deliberate touch before families disengage.",
        urgency_reason_template: "Mid-funnel stall · {{severity}} priority",
        recommended_action: {
            key: "reengage_priority_record",
            labelTemplate: "Re-engage with a specific next step tied to their current stage",
            action_family: "follow_up",
        },
        action_rationale_template:
            "A targeted message or call task is more effective than a generic status change when value and timing both matter.",
        likely_outcome_template: "Re-engagement should surface whether the family is still considering enrollment this season.",
        likely_risk_template: "Quiet high-value inquiries frequently drop without a logged decision.",
        available_actions: [
            { key: "draft_email", label: "Draft email", kind: "task_assist_intent", intent: "draft_message" },
        ],
        required_grounding_signals: ["primary_attention_reason"],
        stale_validation_hints: ["status_key", "primary_reason_code"],
        workflow_reference_hints: null,
        communication_reference_hints: {
            channel_hint: "email",
            timing_hint_template: "within 48 hours",
            template_key: null,
        },
        escalation_hints: null,
        required_interpolation: ["primary_label"],
    }),

    entry({
        catalog_key: "unanswered_inbound",
        attention_reason_code: null,
        template_id: "unanswered_inbound.overlay.v1",
        tier: "full",
        recommendation_type: "communication",
        default_urgency_band: "p1_today",
        default_confidence_level: "medium",
        trust_boundary: "insight_only",
        title_template: "Inbound message needs a reply",
        current_state_summary_template: "{{primary_label}} · inbound thread awaiting staff reply",
        why_it_matters_template:
            "The family has reached out and a timely reply keeps trust high. Unanswered inbound threads often stall tours and paperwork even when status looks idle.",
        urgency_reason_template: "Inbound reply pending · respond within one business day",
        recommended_action: {
            key: "reply_to_inbound",
            labelTemplate: "Reply in the thread with the next clear step for the family",
            action_family: "send_message",
        },
        action_rationale_template:
            "Closing the inbound loop before other follow-ups avoids duplicate or conflicting outreach.",
        likely_outcome_template: "A direct reply should reduce duplicate outreach and keep the conversation coherent.",
        likely_risk_template: null,
        available_actions: [
            { key: "open_comms", label: "Open communications", kind: "drawer_tab" },
            { key: "draft_sms", label: "Draft SMS", kind: "task_assist_intent", intent: "draft_message" },
        ],
        required_grounding_signals: ["activity_stale_unanswered_inbound"],
        stale_validation_hints: ["activity_signal_key"],
        workflow_reference_hints: null,
        communication_reference_hints: {
            channel_hint: "sms",
            timing_hint_template: "within one business day",
            template_key: null,
        },
        escalation_hints: null,
        required_interpolation: ["primary_label"],
    }),

    entry({
        catalog_key: "sla_breach",
        attention_reason_code: null,
        template_id: "sla_breach.escalation.v1",
        tier: "full",
        recommendation_type: "escalation",
        default_urgency_band: "p0_urgent",
        default_confidence_level: "high",
        trust_boundary: "insight_only",
        title_template: "Response timing is past goal",
        current_state_summary_template: "{{primary_label}} · service timing past SLA goal",
        why_it_matters_template:
            "This record is past the configured service window for {{primary_label}}. Leadership visibility may be needed if frontline staff cannot clear the blocker today.",
        urgency_reason_template: "SLA breached · {{sla_tier}}",
        recommended_action: {
            key: "escalate_operational_review",
            labelTemplate: "Review with a lead and assign a same-day resolution path",
            action_family: "review",
        },
        action_rationale_template:
            "Escalation is about clearing blockers and documenting accountability — not sending automated messages.",
        likely_outcome_template: "Same-day review should produce an owner and a logged next step on the record.",
        likely_risk_template: "Continued SLA breach without ownership increases drop-off and operator distrust of the queue.",
        available_actions: [{ key: "open_record", label: "Open record", kind: "drawer_tab" }],
        required_grounding_signals: ["sla_breached", "primary_attention_reason"],
        stale_validation_hints: ["primary_reason_code", "resolver_recomputed"],
        workflow_reference_hints: null,
        communication_reference_hints: null,
        escalation_hints: {
            policy_basis_template: "Attention SLA tier {{sla_tier}} for {{primary_label}}",
            applies_when_sla_tier: "breached",
        },
        required_interpolation: ["primary_label", "sla_tier"],
    }),
];

function indexCatalog(
    entries: OperationalRecommendationCatalogEntryV1[]
): Record<OperationalRecommendationCatalogKey, OperationalRecommendationCatalogEntryV1> {
    const out = {} as Record<OperationalRecommendationCatalogKey, OperationalRecommendationCatalogEntryV1>;
    for (const e of entries) {
        out[e.catalog_key] = e;
    }
    return out;
}

export const OPERATIONAL_RECOMMENDATION_CATALOG_V1: Readonly<
    Record<OperationalRecommendationCatalogKey, OperationalRecommendationCatalogEntryV1>
> = indexCatalog(CATALOG_ENTRIES);

// Fail fast in dev/test importers — not a runtime builder.
validateOperationalRecommendationCatalog(OPERATIONAL_RECOMMENDATION_CATALOG_V1);

export function getOperationalRecommendationCatalogEntry(
    key: OperationalRecommendationCatalogKey
): OperationalRecommendationCatalogEntryV1 | null {
    return OPERATIONAL_RECOMMENDATION_CATALOG_V1[key] ?? null;
}

export function resolveCatalogKeyForAttentionReason(
    reasonCode: OpportunityAttentionReasonCode
): OperationalRecommendationCatalogKey {
    if (reasonCode in OPERATIONAL_RECOMMENDATION_CATALOG_V1) {
        return reasonCode;
    }
    return reasonCode;
}

/**
 * Render catalog templates to operator copy (deterministic). Does not produce OperationalRecommendationV1.
 */
export function renderCatalogEntryCopy(
    key: OperationalRecommendationCatalogKey,
    values: CatalogInterpolationValues
): RenderedCatalogCopyV1 {
    const entry = getOperationalRecommendationCatalogEntry(key);
    if (!entry) {
        throw new Error(`recommendation_catalog: unknown catalog key: ${key}`);
    }

    const required = entry.required_interpolation;
    const fieldPrefix = entry.catalog_key;

    const title = renderCatalogTemplate(entry.title_template, values, {
        required,
        field: `${fieldPrefix}.title`,
    });
    const current_state_summary = renderCatalogTemplateWithOptionalClauses(
        entry.current_state_summary_template,
        values,
        { field: `${fieldPrefix}.current_state_summary` }
    );
    const why_it_matters = renderCatalogTemplateWithOptionalClauses(entry.why_it_matters_template, values, {
        required,
        field: `${fieldPrefix}.why_it_matters`,
    });
    const urgency_reason = renderCatalogTemplate(entry.urgency_reason_template, values, {
        field: `${fieldPrefix}.urgency_reason`,
    });
    const action_rationale = renderCatalogTemplate(entry.action_rationale_template, values, {
        field: `${fieldPrefix}.action_rationale`,
    });
    const likely_outcome = entry.likely_outcome_template
        ? renderCatalogTemplate(entry.likely_outcome_template, values, {
              field: `${fieldPrefix}.likely_outcome`,
          })
        : null;
    const likely_risk = entry.likely_risk_template
        ? renderCatalogTemplate(entry.likely_risk_template, values, { field: `${fieldPrefix}.likely_risk` })
        : null;

    const recommended_action = {
        key: entry.recommended_action.key,
        label: renderCatalogTemplate(entry.recommended_action.labelTemplate, values, {
            required,
            field: `${fieldPrefix}.recommended_action.label`,
        }),
        action_family: entry.recommended_action.action_family,
    };

    return {
        catalog_key: entry.catalog_key,
        template_id: entry.template_id,
        tier: entry.tier,
        title,
        current_state_summary,
        why_it_matters,
        urgency_reason,
        recommended_action,
        action_rationale,
        likely_outcome,
        likely_risk,
    };
}

/** Legacy generic copy for regression tests. */
export const LEGACY_STALE_NEW_INQUIRY_ACTION_LABEL = "Respond to new request";

export const LEGACY_STALE_NEW_INQUIRY_SUMMARY_PREFIX = "Operational attention:";
