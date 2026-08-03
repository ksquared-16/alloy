/**
 * Default stage_operating_plan_v1 for canonical enrollment builder stages.
 */

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { ENROLLMENT_TEMPLATE_STAGE_KEYS } from "@/lib/businessProcessTemplates/enrollmentQueueMembershipDefaults";
import type {
    StageOperatingPlanV1,
    StageOutcomeRuleTargetV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

const ENROLLMENT_DEFAULT_STAGE_KEYS = ENROLLMENT_TEMPLATE_STAGE_KEYS;

function attention(reason: string): StageOutcomeRuleTargetV1[] {
    return [
        {
            kind: "create_needs_attention",
            attention_reason: reason,
            wait_bucket: "waiting_on_staff",
        },
    ];
}

const ENROLLMENT_STAGE_OPERATING_DEFAULTS: Record<string, Omit<StageOperatingPlanV1, "lifecycle_key" | "stage_key">> = {
    lead: {
        version: 1,
        journey_segment: "family",
        purpose: "Reach the family and determine next steps.",
        outgoing_transitions: [
            {
                transition_ref: "lead_to_tour",
                source_stage_key: "lead",
                target_stage_key: "tour",
                label: "Continue to Tour",
                available: true,
                status_key: "open",
            },
            {
                transition_ref: "lead_to_closed_lost",
                source_stage_key: "lead",
                target_stage_key: "closed_lost",
                label: "Close as Lost",
                available: true,
                status_key: "closed",
                closes_record: true,
            },
        ],
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
                // Command-result sufficiency (R2): an objective integrated send is
                // "contact attempted" (left_message, stays in stage) — configuration,
                // not code, decides this. The operator is never asked to re-declare it.
                completion_policy: {
                    sufficient_command_results: [
                        {
                            capability: "communications_send",
                            result: "sent",
                            satisfies_outcome_key: "left_message",
                        },
                        {
                            // Confirmed tour booking is objective success for schedule_tour.
                            // Maps to Tour Scheduled → outcome rules own stage movement.
                            capability: "schedule_tour",
                            result: "confirmed",
                            satisfies_outcome_key: "tour_scheduled",
                        },
                    ],
                },
                primary_action: { action_ref: "quick_message", override_label: "Contact Family" },
                helpful_actions: [
                    { action_ref: "schedule_tour" },
                    { action_ref: "send_form" },
                ],
                outcome_refs: [
                    { outcome_ref: "reached_family" },
                    { outcome_ref: "left_message" },
                    { outcome_ref: "needs_follow_up" },
                    { outcome_ref: "interested" },
                    { outcome_ref: "tour_scheduled" },
                    { outcome_ref: "not_interested" },
                ],
            },
        ],
        outcomes: [
            { outcome_key: "reached_family", label: "Reached Family", successful: true },
            { outcome_key: "left_message", label: "Left Message" },
            { outcome_key: "needs_follow_up", label: "Needs Follow-up" },
            { outcome_key: "interested", label: "Interested", successful: true },
            {
                outcome_key: "tour_scheduled",
                label: "Tour Scheduled",
                successful: true,
                completes_work: true,
            },
            { outcome_key: "not_interested", label: "Not Interested", completes_work: true },
        ],
        outcome_rules: [
            {
                rule_key: "reached_family_to_tour",
                when_outcome_key: "reached_family",
                targets: [{ kind: "move_to_stage", transition_ref: "lead_to_tour" }],
            },
            {
                rule_key: "interested_to_tour",
                when_outcome_key: "interested",
                targets: [{ kind: "move_to_stage", transition_ref: "lead_to_tour" }],
            },
            {
                rule_key: "tour_scheduled_to_tour",
                when_outcome_key: "tour_scheduled",
                targets: [{ kind: "move_to_stage", transition_ref: "lead_to_tour" }],
            },
            {
                // Domain signal from confirmed booking — same progression as Tour Scheduled outcome.
                // Actions never hardcode stage moves; configuration owns meaning.
                rule_key: "domain_tour_booking_scheduled_to_tour",
                when_domain_signal: { domain: "tour_booking", signal: "scheduled" },
                targets: [{ kind: "move_to_stage", transition_ref: "lead_to_tour" }],
            },
            {
                rule_key: "not_interested_close",
                when_outcome_key: "not_interested",
                targets: [{ kind: "move_to_stage", transition_ref: "lead_to_closed_lost" }],
            },
            {
                rule_key: "left_message_remain",
                when_outcome_key: "left_message",
                targets: [{ kind: "no_movement" }],
            },
            {
                rule_key: "needs_follow_up_remain",
                when_outcome_key: "needs_follow_up",
                targets: [{ kind: "no_movement" }],
            },
        ],
        attention_rules: [
            {
                rule_key: "first_contact_overdue",
                kind: "work_overdue",
                label: "First contact overdue",
                severity: "medium",
                threshold: 1,
                threshold_duration: { offset_value: 1, offset_unit: "days" },
                template_key: "contact_family",
                targets: attention("First contact overdue after 1 day"),
            },
            {
                rule_key: "stage_age_7d",
                kind: "stage_age_exceeded",
                label: "Stage age > 7 days",
                severity: "medium",
                threshold: 7,
                threshold_duration: { offset_value: 7, offset_unit: "days" },
                targets: attention("Lead stage aging beyond 7 days"),
            },
            {
                rule_key: "missing_required_fields",
                kind: "missing_requirements",
                label: "Missing required fields",
                severity: "medium",
                targets: attention("Missing required Lead stage fields"),
            },
        ],
    },
    // `qualification` stage removed (Part 9): confirming fit is lead work, not a separate stage.
    tour: {
        version: 1,
        journey_segment: "family",
        purpose: "Conduct the tour and record what happened.",
        outgoing_transitions: [
            {
                transition_ref: "tour_to_decision",
                source_stage_key: "tour",
                target_stage_key: "decision",
                label: "Continue to Decision",
                available: true,
                status_key: "open",
            },
            {
                transition_ref: "tour_to_waitlist",
                source_stage_key: "tour",
                target_stage_key: "waitlist",
                label: "Move to Waitlist",
                available: true,
            },
            {
                transition_ref: "tour_to_closed_lost",
                source_stage_key: "tour",
                target_stage_key: "closed_lost",
                label: "Close as Lost",
                available: true,
                status_key: "closed",
                closes_record: true,
            },
        ],
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
        ],
        outcomes: [
            { outcome_key: "tour_scheduled", label: "Tour Scheduled" },
            {
                outcome_key: "tour_completed",
                label: "Tour Completed",
                successful: true,
                completes_work: true,
            },
            { outcome_key: "no_show", label: "No Show", completes_work: true },
            { outcome_key: "needs_follow_up", label: "Needs Follow-up" },
            { outcome_key: "family_declined", label: "Family Declined", completes_work: true },
            { outcome_key: "no_availability", label: "No Availability" },
        ],
        outcome_rules: [
            {
                rule_key: "tour_completed_to_decision",
                when_outcome_key: "tour_completed",
                targets: [{ kind: "move_to_stage", transition_ref: "tour_to_decision" }],
            },
            {
                rule_key: "no_show_follow_up",
                when_outcome_key: "no_show",
                targets: [
                    { kind: "no_movement" },
                    {
                        kind: "create_next_work",
                        template_key: "conduct_tour",
                        follow_up_due_policy: {
                            anchor: "outcome_recorded_at",
                            offset_value: 2,
                            offset_unit: "hours",
                            direction: "after",
                            missing_anchor_behavior: "use_outcome_recorded_at",
                        },
                    },
                ],
            },
            {
                rule_key: "needs_follow_up_attention",
                when_outcome_key: "needs_follow_up",
                targets: [
                    { kind: "no_movement" },
                    {
                        kind: "create_needs_attention",
                        attention_reason: "Tour needs follow-up",
                        wait_bucket: "waiting_on_staff",
                        follow_up_due_policy: {
                            anchor: "outcome_recorded_at",
                            offset_value: 3,
                            offset_unit: "days",
                            direction: "after",
                        },
                    },
                ],
            },
            {
                rule_key: "family_declined_close",
                when_outcome_key: "family_declined",
                targets: [{ kind: "move_to_stage", transition_ref: "tour_to_closed_lost" }],
            },
            {
                rule_key: "no_availability_waitlist",
                when_outcome_key: "no_availability",
                targets: [{ kind: "move_to_stage", transition_ref: "tour_to_waitlist" }],
            },
            {
                rule_key: "tour_scheduled_remain",
                when_outcome_key: "tour_scheduled",
                targets: [{ kind: "no_movement" }],
            },
        ],
        attention_rules: [],
    },
    decision: {
        version: 1,
        journey_segment: "family",
        purpose: "Support the family enrollment decision.",
        outgoing_transitions: [
            {
                transition_ref: "decision_to_enrolling",
                source_stage_key: "decision",
                target_stage_key: "enrolling",
                label: "Continue to Enrolling",
                available: true,
            },
            {
                transition_ref: "decision_to_waitlist",
                source_stage_key: "decision",
                target_stage_key: "waitlist",
                label: "Move to Waitlist",
                available: true,
            },
            {
                transition_ref: "decision_to_closed_lost",
                source_stage_key: "decision",
                target_stage_key: "closed_lost",
                label: "Close as Lost",
                available: true,
                status_key: "closed",
                closes_record: true,
            },
        ],
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
                    { outcome_ref: "family_enrolling" },
                    { outcome_ref: "needs_time" },
                    { outcome_ref: "wants_waitlist" },
                    { outcome_ref: "declined" },
                ],
            },
        ],
        outcomes: [
            {
                outcome_key: "family_enrolling",
                label: "Family Enrolling",
                successful: true,
                completes_work: true,
            },
            { outcome_key: "needs_time", label: "Needs Time" },
            {
                outcome_key: "wants_waitlist",
                label: "Wants Waitlist",
                successful: true,
                completes_work: true,
            },
            { outcome_key: "declined", label: "Declined", completes_work: true },
        ],
        outcome_rules: [
            {
                rule_key: "family_enrolling_move",
                when_outcome_key: "family_enrolling",
                targets: [{ kind: "move_to_stage", transition_ref: "decision_to_enrolling" }],
            },
            {
                rule_key: "needs_time_remain",
                when_outcome_key: "needs_time",
                targets: [{ kind: "no_movement" }],
            },
            {
                rule_key: "waitlist_move",
                when_outcome_key: "wants_waitlist",
                targets: [{ kind: "move_to_stage", transition_ref: "decision_to_waitlist" }],
            },
            {
                rule_key: "declined_close",
                when_outcome_key: "declined",
                targets: [{ kind: "move_to_stage", transition_ref: "decision_to_closed_lost" }],
            },
        ],
        attention_rules: [],
    },
    closed: {
        version: 1,
        journey_segment: "family",
        purpose: "Family enrollment case is closed.",
        work_templates: [],
        outcomes: [{ outcome_key: "acknowledged", label: "Acknowledged", successful: true }],
        outcome_rules: [{ rule_key: "noop", when_outcome_key: "acknowledged", targets: [{ kind: "no_movement" }] }],
        attention_rules: [],
    },
    enrolling: {
        version: 1,
        journey_segment: "family",
        purpose: "Complete enrollment paperwork after the family decides to enroll.",
        outgoing_transitions: [],
        work_templates: [
            {
                template_key: "send_enrollment_packet",
                label: "Send Enrollment Packet",
                description: "Send the enrollment packet / forms after the family enters Enrolling.",
                required: true,
                primary: true,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
                work_definition_key: "contact_family",
                execution_mode: "direct_action",
                primary_action: { action_ref: "send_form", override_label: "Send Enrollment Packet" },
            },
        ],
        outcomes: [
            { outcome_key: "packet_sent", label: "Packet sent", successful: true, completes_work: true },
            { outcome_key: "packet_pending", label: "Packet still pending" },
        ],
        outcome_rules: [
            {
                rule_key: "packet_sent_complete",
                when_outcome_key: "packet_sent",
                targets: [{ kind: "mark_stage_work_complete" }],
            },
            {
                rule_key: "packet_attention",
                when_outcome_key: "packet_pending",
                targets: attention("Enrollment packet incomplete"),
            },
        ],
        attention_rules: [],
    },
    closed_withdrawn: {
        version: 1,
        journey_segment: "child",
        purpose: "Child enrollment track was withdrawn or closed.",
        work_templates: [],
        outcomes: [{ outcome_key: "acknowledged", label: "Acknowledged", successful: true }],
        outcome_rules: [{ rule_key: "noop", when_outcome_key: "acknowledged", targets: [{ kind: "no_movement" }] }],
        attention_rules: [],
    },
    waitlist: {
        version: 1,
        journey_segment: "child",
        purpose: "Manage waitlist candidates and spot offers.",
        work_templates: [
            {
                template_key: "review_waitlist_position",
                label: "Review waitlist position",
                required: false,
                due_policy: { kind: "offset_days", days: 3 },
                owner_strategy: "record_owner",
            },
            {
                template_key: "offer_spot",
                label: "Offer spot",
                required: false,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
            },
        ],
        outcomes: [
            { outcome_key: "spot_offered", label: "Spot offered", successful: true },
            { outcome_key: "candidate_paused", label: "Candidate paused" },
            { outcome_key: "no_response", label: "No response to offer" },
        ],
        outcome_rules: [
            {
                rule_key: "offer_to_enrolling",
                when_outcome_key: "spot_offered",
                targets: [
                    { kind: "update_child_enrollment_status", disposition_key: "enrolling" },
                    { kind: "move_to_stage", stage_key: "enrolling" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "pause_candidate",
                when_outcome_key: "candidate_paused",
                targets: [{ kind: "update_candidate_status", candidate_status: "paused" }],
            },
            {
                rule_key: "no_response_attention",
                when_outcome_key: "no_response",
                targets: attention("No response to waitlist offer"),
            },
        ],
        attention_rules: [],
    },
    enrollment: {
        version: 1,
        journey_segment: "child",
        purpose: "Complete enrollment paperwork and confirm start.",
        work_templates: [
            {
                template_key: "send_enrollment_packet",
                label: "Send enrollment packet",
                required: true,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
            },
            {
                template_key: "confirm_start_date",
                label: "Confirm start date",
                required: true,
                due_policy: { kind: "offset_days", days: 3 },
                owner_strategy: "record_owner",
            },
        ],
        outcomes: [
            { outcome_key: "enrollment_complete", label: "Enrollment complete", successful: true },
            { outcome_key: "packet_pending", label: "Packet still pending" },
            { outcome_key: "family_withdrew", label: "Family withdrew" },
        ],
        outcome_rules: [
            {
                rule_key: "complete_to_enrolled",
                when_outcome_key: "enrollment_complete",
                targets: [
                    { kind: "update_child_enrollment_status", disposition_key: "enrolled" },
                    { kind: "move_to_stage", stage_key: "enrolled" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "packet_attention",
                when_outcome_key: "packet_pending",
                targets: attention("Enrollment packet incomplete"),
            },
            {
                rule_key: "withdrew",
                when_outcome_key: "family_withdrew",
                targets: [
                    { kind: "update_child_enrollment_status", disposition_key: "not_enrolling", close_reason_key: "family_withdrew" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
        ],
        attention_rules: [
            {
                rule_key: "required_docs_overdue",
                kind: "required_work_overdue",
                threshold: 1,
                targets: attention("Required enrollment work overdue"),
            },
        ],
    },
    enrolled: {
        version: 1,
        journey_segment: "child",
        purpose: "Post-enrollment follow-up.",
        work_templates: [],
        outcomes: [{ outcome_key: "acknowledged", label: "Acknowledged", successful: true }],
        outcome_rules: [{ rule_key: "noop", when_outcome_key: "acknowledged", targets: [{ kind: "no_movement" }] }],
        attention_rules: [],
    },
    new_lead: {
        version: 1,
        journey_segment: "family",
        purpose: "A new family inquiry has entered your pipeline.",
        work_templates: [
            {
                template_key: "review_new_inquiry",
                label: "Review new inquiry",
                required: true,
                due_policy: { kind: "same_day" },
                owner_strategy: "record_owner",
            },
        ],
        outcomes: [
            { outcome_key: "ready_to_contact", label: "Ready to contact", successful: true },
        ],
        outcome_rules: [
            {
                rule_key: "to_contacting",
                when_outcome_key: "ready_to_contact",
                targets: [{ kind: "move_to_stage", stage_key: "contacting" }, { kind: "mark_stage_work_complete" }],
            },
        ],
        attention_rules: [],
    },
    contacting: {
        version: 1,
        journey_segment: "family",
        purpose: "Reach the family and confirm interest.",
        work_templates: [
            {
                template_key: "contact_attempt_1",
                label: "Contact attempt #1",
                required: true,
                due_policy: { kind: "same_day" },
                owner_strategy: "record_owner",
                work_definition_key: "contact_family",
            },
            {
                template_key: "contact_attempt_2",
                label: "Contact attempt #2",
                required: true,
                due_policy: { kind: "offset_days", days: 2 },
                owner_strategy: "record_owner",
                work_definition_key: "contact_family",
            },
            {
                template_key: "contact_attempt_3",
                label: "Contact attempt #3",
                required: true,
                due_policy: { kind: "offset_days", days: 5 },
                owner_strategy: "record_owner",
                work_definition_key: "contact_family",
            },
        ],
        outcomes: [
            { outcome_key: "reached_family", label: "Reached family", successful: true },
            { outcome_key: "left_voicemail", label: "Left voicemail" },
            { outcome_key: "sent_text", label: "Sent text" },
            { outcome_key: "no_answer", label: "No answer" },
            { outcome_key: "bad_number", label: "Bad number" },
            { outcome_key: "not_interested", label: "Not interested" },
        ],
        outcome_rules: [
            {
                // `qualification` was removed from the enrollment template (Part 9). The stale
                // move_to_stage target is removed here so this default path no longer references a
                // stage absent from the current template. Reaching the family marks the contact
                // work complete; stage advancement is a configured transition, not a code default.
                rule_key: "reached_family_qualified",
                when_outcome_key: "reached_family",
                targets: [
                    { kind: "update_family_case_status", status_key: "open" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "not_interested_closed",
                when_outcome_key: "not_interested",
                targets: [
                    { kind: "update_family_case_status", status_key: "closed" },
                    { kind: "move_to_stage", stage_key: "closed_lost" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "bad_number_attention",
                when_outcome_key: "bad_number",
                targets: attention("Invalid contact information"),
            },
        ],
        attention_rules: [
            {
                rule_key: "three_attempts_no_success",
                kind: "tasks_without_success",
                threshold: 3,
                targets: attention("No response after 3 contact attempts"),
            },
            {
                rule_key: "seven_days_no_success",
                kind: "days_without_success",
                threshold: 7,
                targets: attention("No family contact in 7 days"),
            },
        ],
    },
    tour_scheduled: {
        version: 1,
        journey_segment: "family",
        purpose: "Tour is on the calendar. Confirmation and reminders are handled by tour comms.",
        work_templates: [],
        outcomes: [
            { outcome_key: "tour_confirmed", label: "Tour confirmed", successful: true },
            { outcome_key: "reschedule", label: "Reschedule tour" },
            { outcome_key: "cancelled", label: "Tour cancelled" },
        ],
        outcome_rules: [
            {
                rule_key: "confirmed_noop",
                when_outcome_key: "tour_confirmed",
                targets: [{ kind: "mark_stage_work_complete" }],
            },
            {
                rule_key: "reschedule_noop",
                when_outcome_key: "reschedule",
                targets: [{ kind: "no_movement" }],
            },
            {
                rule_key: "cancelled_attention",
                when_outcome_key: "cancelled",
                targets: attention("Tour canceled — follow up required"),
            },
            {
                rule_key: "status_tour_no_show_attention",
                when_enter_status_key: "tour_no_show",
                targets: attention("Tour no-show — follow up required"),
            },
            {
                rule_key: "domain_tour_booking_canceled_attention",
                when_domain_signal: { domain: "tour_booking", signal: "canceled" },
                targets: attention("Tour canceled — follow up required"),
            },
        ],
        attention_rules: [],
    },
    tour_completed: {
        version: 1,
        journey_segment: "family",
        purpose: "Record tour outcome and decide next steps.",
        work_templates: [
            {
                template_key: "record_tour_outcome_work",
                label: "Record tour outcome",
                required: true,
                primary: true,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
                work_definition_key: "record_tour_outcome",
            },
        ],
        outcomes: [
            { outcome_key: "tour_completed", label: "Tour completed", successful: true },
            { outcome_key: "no_show", label: "No show" },
            { outcome_key: "not_interested", label: "Not interested" },
        ],
        outcome_rules: [
            {
                rule_key: "completed_to_decision",
                when_outcome_key: "tour_completed",
                targets: [
                    // Case status collapses to `open` (S4); the decision phase is a stage move.
                    { kind: "update_family_case_status", status_key: "open" },
                    { kind: "move_to_stage", stage_key: "decision_pending" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "no_show_attention",
                when_outcome_key: "no_show",
                targets: attention("Tour no-show — follow up required"),
            },
            {
                rule_key: "not_interested_closed",
                when_outcome_key: "not_interested",
                targets: [
                    { kind: "update_family_case_status", status_key: "closed", close_reason_key: "not_a_fit" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
        ],
        attention_rules: [],
    },
    decision_pending: {
        version: 1,
        journey_segment: "family",
        purpose: "Family is deciding enrollment path for each child.",
        work_templates: [
            {
                template_key: "follow_up_decision",
                label: "Follow up on enrollment decision",
                required: true,
                primary: true,
                due_policy: { kind: "offset_days", days: 2 },
                owner_strategy: "record_owner",
            },
        ],
        outcomes: [
            { outcome_key: "enrolling", label: "Enrolling", successful: true },
            { outcome_key: "waitlist", label: "Waitlist", successful: true },
            { outcome_key: "declined", label: "Declined" },
        ],
        outcome_rules: [
            {
                rule_key: "to_enrolling",
                when_outcome_key: "enrolling",
                targets: [
                    // Decision → enrolling: child disposition becomes `enrolling` and the
                    // child track moves to the enrolling stage (S4/S8).
                    { kind: "update_child_enrollment_status", disposition_key: "enrolling" },
                    { kind: "move_to_stage", stage_key: "enrolling" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "to_waitlist",
                when_outcome_key: "waitlist",
                targets: [
                    { kind: "update_child_enrollment_status", disposition_key: "waitlisted" },
                    { kind: "move_to_stage", stage_key: "waitlist" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "declined_closed",
                when_outcome_key: "declined",
                targets: [
                    { kind: "update_child_enrollment_status", disposition_key: "not_enrolling", close_reason_key: "not_moving_forward" },
                    { kind: "move_to_stage", stage_key: "withdrawn" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
        ],
        attention_rules: [],
    },
    closed_lost: {
        version: 1,
        journey_segment: "family",
        purpose: "Family is not proceeding with enrollment.",
        work_templates: [],
        outcomes: [{ outcome_key: "acknowledged", label: "Acknowledged", successful: true }],
        outcome_rules: [{ rule_key: "noop", when_outcome_key: "acknowledged", targets: [{ kind: "no_movement" }] }],
        attention_rules: [],
    },
    offered_spot: {
        version: 1,
        journey_segment: "child",
        purpose: "Spot has been offered — confirm family response.",
        work_templates: [
            {
                template_key: "confirm_offer_response",
                label: "Confirm offer response",
                required: true,
                due_policy: { kind: "offset_days", days: 2 },
                owner_strategy: "record_owner",
            },
        ],
        outcomes: [
            { outcome_key: "accepted", label: "Offer accepted", successful: true },
            { outcome_key: "declined", label: "Offer declined" },
            { outcome_key: "no_response", label: "No response" },
        ],
        outcome_rules: [
            {
                rule_key: "accepted_enrolling",
                when_outcome_key: "accepted",
                targets: [
                    { kind: "update_child_enrollment_status", disposition_key: "enrolling" },
                    { kind: "move_to_stage", stage_key: "enrolling" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "no_response_attention",
                when_outcome_key: "no_response",
                targets: attention("No response to spot offer"),
            },
        ],
        attention_rules: [],
    },
    future_start: {
        version: 1,
        journey_segment: "child",
        purpose: "Child has a confirmed future start date.",
        work_templates: [
            {
                template_key: "pre_start_checklist",
                label: "Pre-start checklist",
                required: true,
                due_policy: { kind: "offset_days", days: 3 },
                owner_strategy: "record_owner",
            },
        ],
        outcomes: [
            { outcome_key: "enrolled", label: "Enrolled", successful: true },
            { outcome_key: "start_delayed", label: "Start delayed" },
        ],
        outcome_rules: [
            {
                rule_key: "to_enrolled",
                when_outcome_key: "enrolled",
                targets: [
                    { kind: "update_child_enrollment_status", disposition_key: "enrolled" },
                    { kind: "move_to_stage", stage_key: "enrolled" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
        ],
        attention_rules: [],
    },
    withdrawn: {
        version: 1,
        journey_segment: "child",
        purpose: "Child enrollment track was withdrawn.",
        work_templates: [],
        outcomes: [{ outcome_key: "acknowledged", label: "Acknowledged", successful: true }],
        outcome_rules: [{ rule_key: "noop", when_outcome_key: "acknowledged", targets: [{ kind: "no_movement" }] }],
        attention_rules: [],
    },
};

export function defaultStageOperatingPlanForEnrollmentStage(
    stageKey: string,
    lifecycleKey: string = ENROLLMENT_PROCESS_KEY,
): StageOperatingPlanV1 | null {
    const normalized = stageKey.trim();
    if (!normalized || lifecycleKey !== ENROLLMENT_PROCESS_KEY) return null;
    if (!ENROLLMENT_DEFAULT_STAGE_KEYS.has(normalized)) return null;
    const spec = ENROLLMENT_STAGE_OPERATING_DEFAULTS[normalized];
    if (!spec) return null;
    return {
        ...structuredClone(spec),
        lifecycle_key: lifecycleKey,
        stage_key: normalized,
    };
}
