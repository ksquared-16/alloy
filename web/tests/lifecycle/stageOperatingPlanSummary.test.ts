/**
 * The operating plan, said in operator language.
 *
 * These run against the SHAPE of the certified Lead configuration, so the summary is proven to
 * describe what the backend actually does. If the page ever says something the configuration does
 * not support, that is the defect this sprint exists to prevent — and it fails here, not in a
 * browser.
 */

import { describe, expect, it } from "vitest";

import {
    humanTransition,
    summarizeOutcome,
    summarizeStageOperatingPlan,
    summarizeWorkItem,
} from "@/lib/lifecycle/stageOperatingPlanSummary";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/** The certified Lead plan, trimmed to what the summary reads. */
const LEAD = {
    version: 1,
    lifecycle_key: "enrollment",
    stage_key: "lead",
    journey_segment: "family",
    purpose: "Reach the family, understand their needs, determine fit, and establish the next operational step.",
    outgoing_transitions: [
        { transition_ref: "lead_to_tour", source_stage_key: "lead", target_stage_key: "tour", label: "Continue to Tour" },
        {
            transition_ref: "lead_to_closed",
            source_stage_key: "lead",
            target_stage_key: "closed",
            label: "Close as Lost",
            closes_record: true,
        },
    ],
    work_templates: [
        {
            template_key: "contact_family",
            label: "Contact Family",
            description: "Reach the family, understand their needs, determine fit.",
            required: true,
            primary: true,
            due_policy: { kind: "offset_days", days: 1 },
            primary_action: { action_ref: "quick_message" },
            helpful_actions: [{ action_ref: "call_parent" }, { action_ref: "schedule_tour" }],
            outcome_refs: [
                { outcome_ref: "reached_family" },
                { outcome_ref: "tour_scheduled" },
                { outcome_ref: "left_message" },
                { outcome_ref: "needs_follow_up" },
                { outcome_ref: "unable_to_reach" },
                { outcome_ref: "not_interested" },
            ],
        },
    ],
    outcomes: [
        { outcome_key: "reached_family", label: "Reached / Qualified", successful: true, completes_work: true },
        { outcome_key: "tour_scheduled", label: "Tour Scheduled", successful: true, completes_work: true },
        { outcome_key: "left_message", label: "Left Message" },
        { outcome_key: "needs_follow_up", label: "Awaiting Response" },
        { outcome_key: "unable_to_reach", label: "Unable to Reach" },
        { outcome_key: "not_interested", label: "Closed Lost", completes_work: true },
    ],
    outcome_rules: [
        {
            rule_key: "reached_qualified_complete",
            when_outcome_key: "reached_family",
            targets: [{ kind: "mark_stage_work_complete" }, { kind: "no_movement" }],
        },
        {
            rule_key: "tour_scheduled_to_tour",
            when_outcome_key: "tour_scheduled",
            targets: [{ kind: "mark_stage_work_complete" }, { kind: "move_to_stage", transition_ref: "lead_to_tour" }],
        },
        {
            rule_key: "tour_booking_scheduled_to_tour",
            when_domain_signal: { domain: "tour_booking", signal: "scheduled" },
            targets: [{ kind: "mark_stage_work_complete" }, { kind: "move_to_stage", transition_ref: "lead_to_tour" }],
        },
        {
            rule_key: "left_message_follow_up",
            when_outcome_key: "left_message",
            targets: [
                { kind: "no_movement" },
                {
                    kind: "create_next_work",
                    template_key: "contact_family",
                    follow_up_due_policy: { anchor: "outcome_recorded_at", offset_value: 1, offset_unit: "days", direction: "after" },
                },
            ],
        },
        {
            rule_key: "awaiting_response_follow_up",
            when_outcome_key: "needs_follow_up",
            targets: [
                { kind: "no_movement" },
                {
                    kind: "create_next_work",
                    template_key: "contact_family",
                    follow_up_due_policy: { anchor: "outcome_recorded_at", offset_value: 3, offset_unit: "days", direction: "after" },
                },
            ],
        },
        // Attempt-conditional behaviour is TWO rules on one outcome — the gate is rule-level.
        {
            rule_key: "unable_to_reach_retry",
            when_outcome_key: "unable_to_reach",
            when_attempt_count_lt: 3,
            targets: [{ kind: "no_movement" }, { kind: "create_next_work", template_key: "contact_family" }],
        },
        {
            rule_key: "unable_to_reach_escalate",
            when_outcome_key: "unable_to_reach",
            when_attempt_count_gte: 3,
            targets: [{ kind: "no_movement" }, { kind: "create_needs_attention", attention_reason: "Unable to reach" }],
        },
        {
            rule_key: "closed_lost_close",
            when_outcome_key: "not_interested",
            targets: [{ kind: "mark_stage_work_complete" }, { kind: "move_to_stage", transition_ref: "lead_to_closed" }],
        },
    ],
    attention_rules: [
        { rule_key: "first_contact_overdue", kind: "work_overdue", label: "Contact Family overdue", template_key: "contact_family", severity: "medium", targets: [] },
        { rule_key: "no_contact_attempt", kind: "work_overdue", label: "No contact attempt recorded", template_key: "contact_family", severity: "medium", targets: [] },
        { rule_key: "stage_age_7d", kind: "stage_age_exceeded", label: "Lead stage age > 7 days", severity: "medium", targets: [] },
        { rule_key: "missing_required_fields", kind: "missing_requirements", label: "Missing stage-required information", severity: "medium", targets: [] },
    ],
} as unknown as StageOperatingPlanV1;

describe("transition names read as product language", () => {
    it("turns an identity key into a path", () => {
        expect(humanTransition("lead_to_tour")).toBe("Lead → Tour");
        expect(humanTransition("lead_to_closed")).toBe("Lead → Closed");
    });

    it("leaves an unrecognisable key alone rather than inventing a label", () => {
        expect(humanTransition("weird")).toBe("weird");
    });
});

describe("Reached / Qualified — the correction the backend certified", () => {
    const o = summarizeOutcome(LEAD, "reached_family")!;

    it("completes the work item and keeps the family in Lead", () => {
        expect(o.completesWork).toBe(true);
        expect(o.staysInStage).toBe(true);
        expect(o.movesThrough).toBeNull();
    });

    it("says so in one sentence, without schema words", () => {
        expect(o.sentence).toBe("Completes the work item, keeps the family in this stage.");
        expect(o.sentence).not.toMatch(/target|rule|no_movement|mark_stage/);
    });
});

describe("Tour Scheduled — automatic, and the page must say so", () => {
    const o = summarizeOutcome(LEAD, "tour_scheduled")!;

    it("moves the family through Lead → Tour", () => {
        expect(o.movesThrough).toBe("lead_to_tour");
        expect(o.completesWork).toBe(true);
    });

    it("is recognised as produced by the booking signal, not recorded by a person", () => {
        // Without this, a director would reasonably conclude an operator must record the outcome
        // by hand after booking — the double step the product model rejects.
        expect(o.automatic).toBe(true);
        expect(o.producedBy).toEqual({ domain: "tour_booking", signal: "scheduled" });
        expect(o.sentence).toContain("Recorded automatically when a tour booking is scheduled");
    });
});

describe("outcomes that keep the family in Lead", () => {
    it("Left Message leaves the work open and schedules the next touch", () => {
        const o = summarizeOutcome(LEAD, "left_message")!;
        expect(o.completesWork).toBe(false);
        expect(o.staysInStage).toBe(true);
        expect(o.createsFollowUp).toEqual({ templateKey: "contact_family", dueInDays: 1, whileAttemptsUnder: null });
        expect(o.sentence).toBe(
            "Leaves the work item open, keeps the family in this stage, creates follow-up work due in 1 day.",
        );
    });

    it("Awaiting Response uses its own follow-up window", () => {
        const o = summarizeOutcome(LEAD, "needs_follow_up")!;
        expect(o.createsFollowUp?.dueInDays).toBe(3);
        expect(o.sentence).toContain("due in 3 days");
    });

    it("Unable to Reach raises attention and never moves or closes", () => {
        const o = summarizeOutcome(LEAD, "unable_to_reach")!;
        expect(o.staysInStage).toBe(true);
        expect(o.movesThrough).toBeNull();
        expect(o.createsAttention).toBe(true);
        expect(o.sentence).toContain("while under 3 attempts");
        expect(o.sentence).toContain("raises Needs Attention");
    });

    it("Closed Lost completes the work and leaves through the closing path", () => {
        const o = summarizeOutcome(LEAD, "not_interested")!;
        expect(o.completesWork).toBe(true);
        expect(o.movesThrough).toBe("lead_to_closed");
    });
});

describe("the Contact Family work item, as a card would show it", () => {
    const w = summarizeWorkItem(LEAD, LEAD.work_templates[0]!);

    it("carries its own identity and expectations", () => {
        expect(w.label).toBe("Contact Family");
        expect(w.required).toBe(true);
        expect(w.primary).toBe(true);
        expect(w.dueExpectation).toBe("Due in 1 day");
    });

    it("counts its actions, including the primary one", () => {
        expect(w.actionCount).toBe(3);
    });

    it("owns only the attention scoped to it — the stage keeps the rest", () => {
        // The persisted model already distinguishes these by `template_key`; this is presentation
        // over configuration that is already correct, not a re-parenting.
        expect(w.attentionLabels).toEqual(["Contact Family overdue", "No contact attempt recorded"]);
        expect(w.attentionLabels).not.toContain("Lead stage age > 7 days");
    });

    it("summarises follow-up so the collapsed card still means something", () => {
        expect(w.followUpLines).toEqual([
            "Left Message → follow-up in 1 day",
            "Awaiting Response → follow-up in 3 days",
            // The attempt gate is shown, so the card cannot imply an endless retry loop.
            "Unable to Reach → follow-up (while under 3 attempts)",
        ]);
    });

    it("names the one outcome that moves the family on", () => {
        expect(w.exitOutcome?.outcomeKey).toBe("tour_scheduled");
    });
});

describe("the stage overview — understandable without expanding anything", () => {
    const s = summarizeStageOperatingPlan(LEAD);

    it("reduces the stage to one honest headline", () => {
        expect(s.headline).toBe("1 work item · 6 outcomes · 2 ways out");
    });

    it("keeps stage-level attention separate from work-level", () => {
        expect(s.stageAttentionLabels).toEqual([
            "Lead stage age > 7 days",
            "Missing stage-required information",
        ]);
    });

    it("shows each exit path in product language, with what uses it", () => {
        const toTour = s.exitPaths.find((p) => p.transitionRef === "lead_to_tour")!;
        expect(toTour.label).toBe("Continue to Tour");
        expect(toTour.usedByOutcomes).toContain("Tour Scheduled");
        // The automatic path must be named too, or the page would imply the transition is only
        // reachable by hand.
        expect(toTour.usedByOutcomes).toContain("tour booking scheduled (automatic)");
    });

    it("marks the closing path as closing", () => {
        const toClosed = s.exitPaths.find((p) => p.transitionRef === "lead_to_closed")!;
        expect(toClosed.closesRecord).toBe(true);
        expect(toClosed.usedByOutcomes).toContain("Closed Lost");
    });
});

describe("an empty stage does not lie", () => {
    const empty = {
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: "blank",
        journey_segment: "family",
        work_templates: [],
        outcomes: [],
        outcome_rules: [],
        attention_rules: [],
        outgoing_transitions: [],
    } as unknown as StageOperatingPlanV1;

    it("reports nothing rather than inventing structure", () => {
        const s = summarizeStageOperatingPlan(empty);
        expect(s.headline).toBe("0 work items · 0 outcomes · 0 ways out");
        expect(s.exitPaths).toEqual([]);
        expect(s.workItems).toEqual([]);
    });
});
