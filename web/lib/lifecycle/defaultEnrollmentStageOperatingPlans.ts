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
    qualification: {
        version: 1,
        journey_segment: "family",
        purpose: "Confirm fit and gather enrollment details.",
        work_templates: [
            {
                template_key: "confirm_child_info",
                label: "Confirm child information",
                required: true,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
                work_definition_key: "collect_missing_information",
            },
            {
                template_key: "confirm_location_program",
                label: "Confirm desired location, program, and start date",
                required: true,
                due_policy: { kind: "offset_days", days: 2 },
                owner_strategy: "record_owner",
            },
        ],
        outcomes: [
            { outcome_key: "qualified", label: "Qualified", successful: true },
            { outcome_key: "not_qualified", label: "Not qualified" },
            { outcome_key: "needs_more_info", label: "Needs more information" },
        ],
        outcome_rules: [
            {
                rule_key: "qualified_to_tour",
                when_outcome_key: "qualified",
                targets: [{ kind: "move_to_stage", stage_key: "tour" }, { kind: "mark_stage_work_complete" }],
            },
            {
                rule_key: "not_qualified_closed",
                when_outcome_key: "not_qualified",
                targets: [
                    { kind: "update_family_case_status", status_key: "closed" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "needs_info_attention",
                when_outcome_key: "needs_more_info",
                targets: attention("Missing qualification information"),
            },
        ],
        attention_rules: [
            {
                rule_key: "required_work_overdue",
                kind: "required_work_overdue",
                threshold: 1,
                targets: attention("Qualification work overdue"),
            },
        ],
    },
    tour: {
        version: 1,
        journey_segment: "family",
        purpose: "Schedule, confirm, and follow up on tours.",
        work_templates: [
            {
                template_key: "confirm_tour_date",
                label: "Confirm tour date",
                required: true,
                due_policy: { kind: "same_day" },
                owner_strategy: "record_owner",
            },
            {
                template_key: "send_tour_reminder",
                label: "Send tour reminder",
                required: false,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
            },
            {
                template_key: "record_tour_outcome_work",
                label: "Record tour outcome",
                required: true,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
                work_definition_key: "record_tour_outcome",
            },
        ],
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
                    { kind: "update_child_enrollment_status", disposition_key: "tour_completed" },
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
                    { kind: "update_child_enrollment_status", disposition_key: "family_withdrew" },
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
                    { kind: "update_child_enrollment_status", disposition_key: "offer_pending" },
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
                    { kind: "update_child_enrollment_status", disposition_key: "family_withdrew" },
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
        purpose: "Confirm the tour is on the calendar.",
        work_templates: [
            {
                template_key: "confirm_tour_date",
                label: "Confirm tour date",
                required: true,
                due_policy: { kind: "same_day" },
                owner_strategy: "record_owner",
            },
            {
                template_key: "send_tour_reminder",
                label: "Send tour reminder",
                required: false,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
            },
        ],
        outcomes: [
            { outcome_key: "tour_confirmed", label: "Tour confirmed", successful: true },
            { outcome_key: "reschedule", label: "Reschedule tour" },
            { outcome_key: "cancelled", label: "Tour cancelled" },
        ],
        outcome_rules: [
            {
                rule_key: "confirmed_to_completed_stage",
                when_outcome_key: "tour_confirmed",
                targets: [
                    { kind: "update_child_enrollment_status", disposition_key: "tour_scheduled" },
                    { kind: "move_to_stage", stage_key: "tour_completed" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
        ],
        attention_rules: [],
    },
    tour_completed: {
        version: 1,
        journey_segment: "child",
        purpose: "Record tour outcome and decide next steps.",
        work_templates: [
            {
                template_key: "record_tour_outcome_work",
                label: "Record tour outcome",
                required: true,
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
                    { kind: "update_child_enrollment_status", disposition_key: "tour_completed" },
                    { kind: "move_to_stage", stage_key: "decision_pending" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "no_show_attention",
                when_outcome_key: "no_show",
                targets: attention("Tour no-show — follow up required"),
            },
        ],
        attention_rules: [],
    },
    decision_pending: {
        version: 1,
        journey_segment: "child",
        purpose: "Family is deciding enrollment path for each child.",
        work_templates: [
            {
                template_key: "follow_up_decision",
                label: "Follow up on enrollment decision",
                required: true,
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
                    { kind: "update_child_enrollment_status", disposition_key: "offer_pending" },
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
                    { kind: "update_child_enrollment_status", disposition_key: "family_withdrew" },
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
                    { kind: "update_child_enrollment_status", disposition_key: "registration_pending" },
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
