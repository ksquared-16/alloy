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
        purpose: "Review inbound lead and reach the family.",
        work_templates: [
            {
                template_key: "review_lead",
                label: "Review Lead",
                required: true,
                primary: true,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
                work_definition_key: "collect_missing_information",
            },
            {
                template_key: "contact_family",
                label: "Contact Family",
                required: true,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
                work_definition_key: "contact_family",
                completion_policy: {
                    min_attempts: 3,
                    max_attempts: 3,
                    window_days: 7,
                    repeat_until_outcome: true,
                    repeat_due_days: 2,
                },
            },
            {
                // Folded in from the removed `qualification` stage (Part 9): confirming fit /
                // desired location, program, and start date is lead work, not a separate stage.
                template_key: "qualify_fit",
                label: "Confirm fit — location, program, start date",
                required: true,
                due_policy: { kind: "offset_days", days: 2 },
                owner_strategy: "record_owner",
                work_definition_key: "collect_missing_information",
            },
        ],
        outcomes: [
            { outcome_key: "qualified", label: "Qualified", work_template_key: "qualify_fit", successful: true },
            { outcome_key: "not_qualified", label: "Not a fit", work_template_key: "qualify_fit" },
            { outcome_key: "review_qualified", label: "Reviewed", work_template_key: "review_lead", successful: true },
            { outcome_key: "needs_more_information", label: "Needs More Information", work_template_key: "review_lead" },
            { outcome_key: "duplicate", label: "Duplicate", work_template_key: "review_lead" },
            { outcome_key: "closed_lost", label: "Closed Lost", work_template_key: "review_lead" },
            { outcome_key: "reached_qualified", label: "Reached / Qualified", work_template_key: "contact_family", successful: true },
            { outcome_key: "left_message", label: "Left Message", work_template_key: "contact_family" },
            { outcome_key: "awaiting_response", label: "Awaiting Response", work_template_key: "contact_family" },
            { outcome_key: "unable_to_reach", label: "Unable To Reach", work_template_key: "contact_family" },
            { outcome_key: "contact_closed_lost", label: "Closed Lost", work_template_key: "contact_family" },
        ],
        outcome_rules: [
            {
                // Fit confirmed (folded-in qualification work) → advance directly to Tour.
                rule_key: "qualified_move",
                when_outcome_key: "qualified",
                targets: [
                    { kind: "update_family_case_status", status_key: "open" },
                    { kind: "move_to_stage", stage_key: "tour" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "not_qualified_close",
                when_outcome_key: "not_qualified",
                targets: [
                    { kind: "update_family_case_status", status_key: "closed", close_reason_key: "not_a_fit" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "review_complete_stay",
                when_outcome_key: "review_qualified",
                targets: [{ kind: "no_movement" }],
            },
            {
                // Needs more info: keep review as a recorded attempt, reopen Contact Family
                // outreach, and raise attention — all via existing outcome target kinds.
                rule_key: "needs_more_info_follow_up",
                when_outcome_key: "needs_more_information",
                targets: [
                    {
                        kind: "create_needs_attention",
                        attention_reason: "Needs more information from family",
                        wait_bucket: "waiting_on_family",
                    },
                    { kind: "reopen_work", template_key: "contact_family", due_days: 1 },
                ],
            },
            {
                rule_key: "duplicate_close",
                when_outcome_key: "duplicate",
                targets: [
                    { kind: "update_family_case_status", status_key: "closed" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "review_closed_lost",
                when_outcome_key: "closed_lost",
                targets: [
                    { kind: "update_family_case_status", status_key: "closed" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                // Reaching the family keeps the record in Lead; the qualify-fit work is what
                // advances to Tour (Part 9: qualification is lead work, not a separate stage).
                rule_key: "reached_stay",
                when_outcome_key: "reached_qualified",
                targets: [{ kind: "no_movement" }],
            },
            {
                rule_key: "left_message_repeat",
                when_outcome_key: "left_message",
                targets: [{ kind: "reopen_work", template_key: "contact_family", due_days: 2 }],
            },
            {
                rule_key: "awaiting_attention",
                when_outcome_key: "awaiting_response",
                targets: [
                    { kind: "no_movement" },
                    {
                        kind: "create_needs_attention",
                        attention_reason: "Awaiting family response",
                        wait_bucket: "waiting_on_family",
                    },
                ],
            },
            {
                rule_key: "unable_repeat",
                when_outcome_key: "unable_to_reach",
                when_attempt_count_lt: 3,
                targets: [{ kind: "reopen_work", template_key: "contact_family", due_days: 2 }],
            },
            {
                rule_key: "unable_attention",
                when_outcome_key: "unable_to_reach",
                when_attempt_count_gte: 3,
                targets: [
                    {
                        kind: "create_needs_attention",
                        attention_reason: "Unable to reach after 3 attempts",
                        wait_bucket: "waiting_on_staff",
                    },
                ],
            },
            {
                rule_key: "contact_closed_lost",
                when_outcome_key: "contact_closed_lost",
                targets: [
                    { kind: "update_family_case_status", status_key: "closed" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
        ],
        attention_rules: [
            {
                rule_key: "review_lead_overdue",
                kind: "work_overdue",
                label: "Review Lead overdue",
                severity: "medium",
                threshold: 1,
                template_key: "review_lead",
                targets: attention("Review Lead overdue after 1 day"),
            },
            {
                rule_key: "first_contact_overdue",
                kind: "work_overdue",
                label: "First contact overdue",
                severity: "medium",
                threshold: 1,
                template_key: "contact_family",
                targets: attention("First contact overdue after 1 day"),
            },
            {
                rule_key: "contact_attempts_window",
                kind: "no_contact_attempt",
                label: "Contact Family fewer than 3 attempts after 7 days",
                severity: "high",
                threshold: 3,
                template_key: "contact_family",
                targets: attention("Fewer than 3 contact attempts after 7 days"),
            },
            {
                rule_key: "stage_age_7d",
                kind: "stage_age_exceeded",
                label: "Stage age > 7 days",
                severity: "medium",
                threshold: 7,
                targets: attention("Lead stage aging beyond 7 days"),
            },
            {
                rule_key: "missing_required_fields",
                kind: "missing_required_fields",
                label: "Missing required fields",
                severity: "medium",
                targets: attention("Missing required Lead stage fields"),
            },
        ],
    },
    // `qualification` stage removed (Part 9): no distinct work lived here — confirming fit /
    // location / program / start date is now the `qualify_fit` work template on the Lead stage.
    tour: {
        version: 1,
        journey_segment: "family",
        purpose: "Legacy coarse tour stage — prefer tour_scheduled / tour_completed / decision_pending.",
        work_templates: [],
        outcomes: [
            { outcome_key: "tour_completed", label: "Tour completed", successful: true },
            { outcome_key: "no_show", label: "No show" },
            { outcome_key: "reschedule", label: "Reschedule tour" },
            { outcome_key: "not_interested", label: "Not interested" },
        ],
        outcome_rules: [
            {
                rule_key: "completed_decision_pending",
                when_outcome_key: "tour_completed",
                targets: [
                    // Tour completion is family-grain (S4/S8): case stays `open` and advances to
                    // the decision stage. It does NOT set a child enrollment disposition.
                    { kind: "update_family_case_status", status_key: "open" },
                    { kind: "move_to_stage", stage_key: "decision" },
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
                    { kind: "update_family_case_status", status_key: "closed" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
        ],
        attention_rules: [],
    },
    decision: {
        version: 1,
        journey_segment: "family",
        purpose: "Choose each child's enrollment path after the family tour.",
        work_templates: [
            {
                template_key: "review_child_paths",
                label: "Review each child's path",
                required: true,
                due_policy: { kind: "offset_days", days: 2 },
                owner_strategy: "record_owner",
            },
        ],
        outcomes: [
            { outcome_key: "paths_chosen", label: "Child paths chosen", successful: true },
            { outcome_key: "needs_follow_up", label: "Needs follow-up" },
        ],
        outcome_rules: [
            {
                rule_key: "paths_chosen_complete",
                when_outcome_key: "paths_chosen",
                targets: [{ kind: "mark_stage_work_complete" }],
            },
            {
                rule_key: "follow_up_attention",
                when_outcome_key: "needs_follow_up",
                targets: attention("Decision follow-up required"),
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
                    { kind: "move_to_stage", stage_key: "closed_withdrawn" },
                ],
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
                    { kind: "update_child_enrollment_status", disposition_key: "waitlisted" },
                    { kind: "move_to_stage", stage_key: "enrollment" },
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
                rule_key: "reached_to_qualification",
                when_outcome_key: "reached_family",
                targets: [
                    { kind: "update_family_case_status", status_key: "open" },
                    { kind: "move_to_stage", stage_key: "qualification" },
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
