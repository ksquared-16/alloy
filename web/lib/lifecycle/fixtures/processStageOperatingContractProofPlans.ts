/**
 * Process Stage operating-contract proof plans.
 *
 * Product fixtures only — not imported by generic resolvers.
 * Tour / Lead / Decision are enrollment-shaped; Billing proves non-enrollment.
 */

import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/** Tour · Conduct Tour — outcome-led, no Primary Action. */
export function tourConductTourProofPlan(): StageOperatingPlanV1 {
    return {
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: "tour",
        journey_segment: "family",
        purpose: "Conduct the tour and record what happened.",
        work_templates: [
            {
                template_key: "conduct_tour",
                label: "Conduct Tour",
                description: "Guide the family through the tour, then record the outcome.",
                required: true,
                primary: true,
                due_policy: { kind: "same_day" },
                owner_strategy: "record_owner",
                work_definition_key: "record_tour_outcome",
                execution_mode: "outcome_led",
                helpful_actions: [
                    { action_ref: "schedule_tour" },
                    { action_ref: "send_confirmation" },
                    { action_ref: "send_reminder" },
                    { action_ref: "reschedule" },
                    { action_ref: "quick_message" },
                ],
                outcome_refs: [
                    { outcome_ref: "tour_scheduled" },
                    { outcome_ref: "tour_completed" },
                    { outcome_ref: "no_show" },
                    { outcome_ref: "needs_follow_up" },
                    { outcome_ref: "family_declined" },
                    { outcome_ref: "no_availability" },
                ],
            },
            {
                template_key: "send_tour_confirmation",
                label: "Send Tour Confirmation",
                required: false,
                due_policy: { kind: "same_day" },
                owner_strategy: "record_owner",
                work_definition_key: "contact_family",
                execution_mode: "direct_action",
                primary_action: { action_ref: "send_confirmation" },
            },
            {
                template_key: "send_tour_reminder",
                label: "Send Tour Reminder",
                required: false,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
                work_definition_key: "contact_family",
                execution_mode: "direct_action",
                primary_action: { action_ref: "send_reminder" },
            },
            {
                template_key: "reschedule_tour",
                label: "Reschedule Tour",
                required: false,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
                work_definition_key: "schedule_tour",
                execution_mode: "direct_action",
                primary_action: { action_ref: "schedule_tour" },
            },
            {
                template_key: "follow_up_after_tour",
                label: "Follow Up After Tour",
                required: false,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
                work_definition_key: "contact_family",
                execution_mode: "outcome_led",
            },
            {
                template_key: "availability_follow_up",
                label: "Availability Follow-up",
                required: false,
                due_policy: { kind: "offset_days", days: 2 },
                owner_strategy: "record_owner",
                work_definition_key: "contact_family",
                execution_mode: "outcome_led",
            },
        ],
        outcomes: [
            { outcome_key: "tour_scheduled", label: "Tour Scheduled", work_template_key: "conduct_tour" },
            {
                outcome_key: "tour_completed",
                label: "Tour Completed",
                work_template_key: "conduct_tour",
                successful: true,
                completes_work: true,
            },
            { outcome_key: "no_show", label: "No Show", work_template_key: "conduct_tour", completes_work: true },
            { outcome_key: "needs_follow_up", label: "Needs Follow-up", work_template_key: "conduct_tour" },
            {
                outcome_key: "family_declined",
                label: "Family Declined",
                work_template_key: "conduct_tour",
                completes_work: true,
            },
            { outcome_key: "no_availability", label: "No Availability", work_template_key: "conduct_tour" },
        ],
        outcome_rules: [
            {
                rule_key: "tour_scheduled_remain",
                when_outcome_key: "tour_scheduled",
                targets: [
                    { kind: "no_movement" },
                    {
                        kind: "create_next_work",
                        template_key: "send_tour_confirmation",
                        due_days: 0,
                        follow_up_due_policy: {
                            anchor: "outcome_recorded_at",
                            offset_value: 0,
                            offset_unit: "days",
                            direction: "after",
                            missing_anchor_behavior: "use_outcome_recorded_at",
                        },
                    },
                    {
                        kind: "create_next_work",
                        template_key: "send_tour_reminder",
                        follow_up_due_policy: {
                            anchor: "scheduled_event_start",
                            offset_value: 1,
                            offset_unit: "days",
                            direction: "before",
                            missing_anchor_behavior: "use_outcome_recorded_at",
                        },
                    },
                ],
            },
            {
                rule_key: "tour_completed_to_decision",
                when_outcome_key: "tour_completed",
                targets: [
                    { kind: "update_family_case_status", status_key: "open" },
                    {
                        kind: "move_to_stage",
                        stage_key: "decision",
                        transition_ref: "tour_to_decision",
                    },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "no_show_reschedule",
                when_outcome_key: "no_show",
                targets: [
                    { kind: "no_movement" },
                    {
                        kind: "create_next_work",
                        template_key: "reschedule_tour",
                        due_days: 1,
                        follow_up_due_policy: {
                            anchor: "outcome_recorded_at",
                            offset_value: 1,
                            offset_unit: "days",
                            direction: "after",
                            missing_anchor_behavior: "use_outcome_recorded_at",
                        },
                    },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "needs_follow_up_remain",
                when_outcome_key: "needs_follow_up",
                targets: [
                    { kind: "no_movement" },
                    {
                        kind: "create_next_work",
                        template_key: "follow_up_after_tour",
                        due_days: 1,
                        follow_up_due_policy: {
                            anchor: "outcome_recorded_at",
                            offset_value: 1,
                            offset_unit: "days",
                            direction: "after",
                            missing_anchor_behavior: "use_outcome_recorded_at",
                        },
                    },
                ],
            },
            {
                rule_key: "family_declined_close",
                when_outcome_key: "family_declined",
                targets: [
                    { kind: "update_family_case_status", status_key: "closed" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "no_availability_follow_up",
                when_outcome_key: "no_availability",
                targets: [
                    {
                        kind: "create_next_work",
                        template_key: "availability_follow_up",
                        due_days: 2,
                        follow_up_due_policy: {
                            anchor: "outcome_recorded_at",
                            offset_value: 2,
                            offset_unit: "days",
                            direction: "after",
                            missing_anchor_behavior: "use_outcome_recorded_at",
                        },
                    },
                    {
                        kind: "move_to_stage",
                        stage_key: "waitlist",
                        transition_ref: "tour_to_waitlist",
                    },
                ],
            },
        ],
        attention_rules: [],
    };
}

/** Lead · Contact Family — direct action Open Communications. */
export function leadContactFamilyProofPlan(): StageOperatingPlanV1 {
    return {
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: "lead",
        journey_segment: "family",
        purpose: "Reach the family and determine next steps.",
        work_templates: [
            {
                template_key: "contact_family",
                label: "Contact Family",
                description: "Reach the family, understand their needs, and determine the next step.",
                required: true,
                primary: true,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
                work_definition_key: "contact_family",
                execution_mode: "direct_action",
                primary_action: { action_ref: "quick_message", override_label: "Contact Family" },
                helpful_actions: [
                    { action_ref: "schedule_tour" },
                    { action_ref: "send_form" },
                ],
                outcome_refs: [
                    { outcome_ref: "reached" },
                    { outcome_ref: "left_message" },
                    { outcome_ref: "awaiting_response" },
                    { outcome_ref: "not_interested" },
                ],
            },
        ],
        outcomes: [
            { outcome_key: "reached", label: "Reached", work_template_key: "contact_family", successful: true },
            { outcome_key: "left_message", label: "Left Message", work_template_key: "contact_family" },
            { outcome_key: "awaiting_response", label: "Awaiting Response", work_template_key: "contact_family" },
            { outcome_key: "not_interested", label: "Not Interested", work_template_key: "contact_family", completes_work: true },
        ],
        outcome_rules: [
            {
                rule_key: "not_interested_close",
                when_outcome_key: "not_interested",
                targets: [
                    { kind: "update_family_case_status", status_key: "closed" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
        ],
        attention_rules: [],
    };
}

/** Decision · Support Enrollment Decision — outcome-led. */
export function decisionSupportEnrollmentProofPlan(): StageOperatingPlanV1 {
    return {
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: "decision",
        journey_segment: "family",
        purpose: "Support the family enrollment decision.",
        work_templates: [
            {
                template_key: "support_enrollment_decision",
                label: "Support Enrollment Decision",
                description: "Help the family choose a path, then record the decision outcome.",
                required: true,
                primary: true,
                due_policy: { kind: "offset_days", days: 2 },
                owner_strategy: "record_owner",
                work_definition_key: "contact_family",
                execution_mode: "outcome_led",
                helpful_actions: [
                    { action_ref: "quick_message" },
                    { action_ref: "send_form" },
                ],
                outcome_refs: [
                    { outcome_ref: "ready_to_enroll" },
                    { outcome_ref: "needs_time" },
                    { outcome_ref: "wants_waitlist" },
                    { outcome_ref: "declined" },
                ],
            },
        ],
        outcomes: [
            {
                outcome_key: "ready_to_enroll",
                label: "Ready to Enroll",
                work_template_key: "support_enrollment_decision",
                successful: true,
                completes_work: true,
            },
            { outcome_key: "needs_time", label: "Needs Time", work_template_key: "support_enrollment_decision" },
            {
                outcome_key: "wants_waitlist",
                label: "Wants Waitlist",
                work_template_key: "support_enrollment_decision",
                successful: true,
                completes_work: true,
            },
            {
                outcome_key: "declined",
                label: "Declined",
                work_template_key: "support_enrollment_decision",
                completes_work: true,
            },
        ],
        outcome_rules: [
            {
                rule_key: "ready_to_enroll_move",
                when_outcome_key: "ready_to_enroll",
                targets: [
                    {
                        kind: "move_to_stage",
                        stage_key: "enrolling",
                        transition_ref: "decision_to_enrolling",
                    },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "needs_time_remain",
                when_outcome_key: "needs_time",
                targets: [{ kind: "no_movement" }],
            },
            {
                rule_key: "waitlist_move",
                when_outcome_key: "wants_waitlist",
                targets: [
                    {
                        kind: "move_to_stage",
                        stage_key: "waitlist",
                        transition_ref: "decision_to_waitlist",
                    },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "declined_close",
                when_outcome_key: "declined",
                targets: [
                    { kind: "update_family_case_status", status_key: "closed" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
        ],
        attention_rules: [],
    };
}

/** Billing · Collect Payment — direct action, no childcare leakage. */
export function billingCollectPaymentProofPlan(): StageOperatingPlanV1 {
    return {
        version: 1,
        lifecycle_key: "billing",
        stage_key: "collect_payment",
        journey_segment: "family",
        purpose: "Collect payment for the billing period.",
        work_templates: [
            {
                template_key: "collect_payment",
                label: "Collect Payment",
                description: "Collect payment for the current period.",
                required: true,
                primary: true,
                due_policy: { kind: "offset_days", days: 3 },
                owner_strategy: "record_owner",
                work_definition_key: "collect_payment",
                execution_mode: "direct_action",
                primary_action: { action_ref: "record_payment" },
                helpful_actions: [
                    { action_ref: "send_reminder" },
                    { action_ref: "payment_plan" },
                ],
                outcome_refs: [
                    { outcome_ref: "paid" },
                    { outcome_ref: "promise_to_pay" },
                    { outcome_ref: "unable_to_collect" },
                ],
            },
        ],
        outcomes: [
            {
                outcome_key: "paid",
                label: "Paid",
                work_template_key: "collect_payment",
                successful: true,
                completes_work: true,
            },
            { outcome_key: "promise_to_pay", label: "Promise to Pay", work_template_key: "collect_payment" },
            { outcome_key: "unable_to_collect", label: "Unable to Collect", work_template_key: "collect_payment" },
        ],
        outcome_rules: [
            {
                rule_key: "paid_complete",
                when_outcome_key: "paid",
                targets: [{ kind: "mark_stage_work_complete" }],
            },
            {
                rule_key: "promise_follow_up",
                when_outcome_key: "promise_to_pay",
                targets: [
                    { kind: "no_movement" },
                    {
                        kind: "create_next_work",
                        template_key: "collect_payment",
                        due_days: 7,
                        follow_up_due_policy: {
                            anchor: "outcome_recorded_at",
                            offset_value: 7,
                            offset_unit: "days",
                            direction: "after",
                            missing_anchor_behavior: "use_outcome_recorded_at",
                        },
                    },
                ],
            },
        ],
        attention_rules: [],
    };
}

export const PROCESS_STAGE_OPERATING_CONTRACT_PROOF_PLANS = {
    tour: tourConductTourProofPlan,
    lead: leadContactFamilyProofPlan,
    decision: decisionSupportEnrollmentProofPlan,
    billing: billingCollectPaymentProofPlan,
} as const;
