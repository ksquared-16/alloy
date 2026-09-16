/**
 * THE OPERATIONAL CONTEXT FIXTURES — one owner, two certifications.
 *
 * The projection-parity suite proved the SERVER computes what the browser used to. The render matrix
 * proves the CARD draws from that projection and from no raw configuration. Both need the same
 * contexts, and two copies of a fixture set drift until the two suites are quietly testing different
 * products.
 *
 * `REAL_OPERATING_PLAN` is a real published plan, not a sketch: the projections read work templates,
 * alternate paths and outcome refs, and a simplified plan exercises none of them.
 */

import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

export const NULL_SIGNALS = {
    work: { nextActionLabel: null, nextActionRef: null, openWorkCount: 0, workItems: [] },
    attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
    tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
    communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
    billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
} as unknown as OperationalContext["signals"];

/**
 * A REAL published operating plan, trimmed.
 *
 * Copied from the live Firefly answer rather than invented: an earlier hand-written fixture used
 * `work_key` and a `checklist` array, and the published shape uses `template_key` and carries no
 * checklist at all — so the projection threw on it. A fixture whose shape the product never
 * produces proves nothing about the product.
 */
export const REAL_OPERATING_PLAN = {
        "version": 1,
        "lifecycle_key": "enrollment",
        "stage_key": "lead",
        "journey_segment": "family",
        "purpose": "Review inbound lead and reach the family.",
        "outgoing_transitions": [
            {
                "transition_ref": "lead_to_tour",
                "source_stage_key": "lead",
                "target_stage_key": "tour",
                "label": "Move to Tour",
                "available": true
            }
        ],
        "outcomes": [
            {
                "outcome_key": "reached_qualified",
                "label": "Reached / Qualified",
                "work_template_key": "contact_family",
                "successful": true,
                "completes_work": true
            },
            {
                "outcome_key": "left_message",
                "label": "Left Message",
                "work_template_key": "contact_family"
            }
        ],
        "outcome_rules": [
            {
                "rule_key": "reached_move",
                "when_outcome_key": "reached_qualified",
                "targets": [
                    {
                        "kind": "update_family_case_status",
                        "status_key": "open"
                    },
                    {
                        "kind": "mark_stage_work_complete"
                    }
                ]
            }
        ],
        "attention_rules": [
            {
                "rule_key": "review_lead_overdue",
                "kind": "work_overdue",
                "targets": [
                    {
                        "kind": "create_needs_attention",
                        "attention_reason": "Review Lead overdue after 1 day",
                        "wait_bucket": "waiting_on_staff"
                    }
                ],
                "label": "Review Lead overdue",
                "severity": "medium",
                "threshold": 1,
                "threshold_duration": {
                    "offset_value": 1,
                    "offset_unit": "days"
                },
                "template_key": "review_lead"
            }
        ],
        "work_templates": [
            {
                "template_key": "contact_family",
                "label": "Contact Family",
                "required": true,
                "due_policy": {
                    "kind": "offset_days",
                    "days": 1
                },
                "owner_strategy": "record_owner",
                "description": "Reach the family, understand their needs, and determine the next step.",
                "work_definition_key": "contact_family",
                "primary": true,
                "completion_policy": {
                    "min_attempts": 3,
                    "max_attempts": 3,
                    "window_days": 7,
                    "repeat_until_outcome": true,
                    "repeat_due_days": 2,
                    "sufficient_command_results": [
                        {
                            "capability": "schedule_tour",
                            "result": "confirmed",
                            "satisfies_outcome_key": "tour_scheduled"
                        }
                    ]
                },
                "execution_mode": "direct_action",
                "primary_action": {
                    "action_ref": "quick_message",
                    "override_label": "Contact Family"
                },
                "helpful_actions": [
                    {
                        "action_ref": "schedule_tour"
                    },
                    {
                        "action_ref": "send_tour_invitation"
                    },
                    {
                        "action_ref": "move_to_waitlist"
                    },
                    {
                        "action_ref": "add_child"
                    }
                ],
                "alternate_paths": [
                    {
                        "transition_ref": "move_to_stage:waitlist"
                    },
                    {
                        "transition_ref": "move_to_stage:tour"
                    },
                    {
                        "action_ref": "close_lead"
                    }
                ],
                "outcome_refs": [
                    {
                        "outcome_ref": "reached_qualified"
                    },
                    {
                        "outcome_ref": "left_message"
                    },
                    {
                        "outcome_ref": "awaiting_response"
                    },
                    {
                        "outcome_ref": "unable_to_reach"
                    },
                    {
                        "outcome_ref": "contact_closed_lost"
                    }
                ]
            }
        ]
    };

export const PROCESS_STAGES = [
    { key: "lead", label: "Lead" },
    { key: "tour", label: "Tour" },
    { key: "decision", label: "Decision" },
    { key: "waitlist", label: "Waitlist" },
    { key: "enrolling", label: "Enrolling" },
];

export function publishedStageInputs(stageKey: string, options?: { helpful?: string[] }) {
    const template = {
        ...REAL_OPERATING_PLAN.work_templates[0],
        ...(options?.helpful ? { helpful_actions: options.helpful.map((action_ref) => ({ action_ref })) } : {}),
    };
    return {
        operatingPlan: { ...REAL_OPERATING_PLAN, stage_key: stageKey, work_templates: [template] },
        actionCatalog: null,
        fieldRules: null,
        processKey: "enrollment",
        stageKey,
        departmentMetadata: {},
        processStages: PROCESS_STAGES,
    } as unknown as OperationalContext["publishedStageInputs"];
}

export function context(partial: Partial<OperationalContext>): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Test Family" },
        businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "lead" },
        perspective: null,
        truth: {},
        signals: NULL_SIGNALS,
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
        ...partial,
    } as OperationalContext;
}

/**
 * The mandated parity matrix, expressed as contexts.
 *
 * Grain, stage and published configuration are what the projections actually read, so these are the
 * dimensions that can diverge. A fixture with NO published inputs is included deliberately: that is
 * the pre-settlement frame, and it is where an eager chokepoint would most plausibly differ.
 */
export const FIXTURES: { name: string; context: OperationalContext }[] = [
    { name: "Lead family", context: context({ publishedStageInputs: publishedStageInputs("lead") }) },
    {
        name: "Tour family",
        context: context({
            businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "tour" },
            publishedStageInputs: publishedStageInputs("tour"),
            signals: { ...NULL_SIGNALS, tour: { scheduled: true, startAt: "2026-09-20T15:00:00Z", statusLabel: "Scheduled", statusKey: "scheduled", bookingId: "bk-1" } } as unknown as OperationalContext["signals"],
        }),
    },
    {
        name: "Waitlist child",
        context: context({
            grain: "child",
            subject: { type: "customer_member", id: "cm-1", label: "Child A" },
            businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "waitlist" },
            publishedStageInputs: publishedStageInputs("waitlist"),
        }),
    },
    {
        name: "Enrolling child",
        context: context({
            grain: "child",
            subject: { type: "customer_member", id: "cm-2", label: "Child B" },
            businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "enrolling" },
            publishedStageInputs: publishedStageInputs("enrolling"),
        }),
    },
    {
        name: "mixed-grain family — family Lead with child participants",
        context: context({
            publishedStageInputs: publishedStageInputs("lead"),
            truth: { _inquiry_children: [{ id: "cm-1", name: "Child A", stage_key: "waitlist" }, { id: "cm-2", name: "Child B", stage_key: "enrolling" }] } as unknown as OperationalContext["truth"],
        }),
    },
    {
        name: "composed stage + work actions",
        context: context({ publishedStageInputs: publishedStageInputs("lead", { helpful: ["contact_family", "schedule_tour", "move_to_waitlist", "add_child"] }) }),
    },
    {
        name: "attention / blocked",
        context: context({
            publishedStageInputs: publishedStageInputs("lead"),
            signals: { ...NULL_SIGNALS, attention: { needsAttention: true, primaryReason: "missing_health_form", reasonCount: 2 } } as unknown as OperationalContext["signals"],
        }),
    },
    {
        name: "no published inputs — the pre-settlement frame",
        context: context({ publishedStageInputs: null }),
    },
    {
        name: "cannot mutate",
        context: context({ publishedStageInputs: publishedStageInputs("lead"), capabilities: { canMutate: false, maskedChannels: false } }),
    },
];

