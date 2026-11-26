/**
 * Offer spot is a concrete placement and the start of Registration:
 *   - a room comes from the child's location's rooms and brings its own site and program; a start
 *     date is a date; both are recorded on the child's placement draft (the facts pricing, the
 *     Children card and enrollment materialization read) by explicit configuration;
 *   - a sourced choice that resolved to nothing refuses, never accepts an arbitrary value;
 *   - the validator refuses a placement binding on an answer of the wrong kind;
 *   - a template carrying per-child paths has its plain completion owned by the runtime.
 */
import { describe, expect, it } from "vitest";

import { applyParticipantDecisionInputs } from "@/lib/lifecycle/applyParticipantDecisionInputs";
import { participationPatchFromAnswers, withSourcedInputOptions } from "@/lib/lifecycle/participantDecisionInputOptions";
import { runtimeCompletionOutcomeKey } from "@/lib/lifecycle/participantDecisionCompletion";
import { parseParticipantDecision, parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const offerSpot = {
    decision_key: "child_offer_spot",
    action_ref: "update_enrollment_status",
    subject_grain: "child",
    label: "Offer spot",
    targets: [
        { kind: "update_child_enrollment_status", disposition_key: "enrolling" },
        { kind: "move_to_stage", stage_key: "enrolling" },
    ],
    required_inputs: [
        { key: "room", label: "Room", type: "select", required: true, options_source: "location_rooms", binds_to_participation_field: "program_room_cohort_key" },
        { key: "start_date", label: "Start date", type: "date", required: true, binds_to_participation_field: "start_date" },
    ],
};
const rooms = [
    { id: "room-3", label: "Room 3 · Infant", siteLocationId: "site-1", programCategoryId: "cat-infant" },
    { id: "room-5", label: "Room 5", siteLocationId: "site-1", programCategoryId: null },
];

describe("Offer spot — a concrete placement that starts Registration", () => {
    it("the parser keeps the rooms source and the placement bindings", () => {
        const parsed = parseParticipantDecision(offerSpot)!;
        expect(parsed.required_inputs?.[0]).toMatchObject({ options_source: "location_rooms", binds_to_participation_field: "program_room_cohort_key" });
        expect(parsed.required_inputs?.[1]).toMatchObject({ type: "date", binds_to_participation_field: "start_date" });
    });

    it("a chosen room records the room, its site and its program; the date records the start", () => {
        const decision = withSourcedInputOptions(parseParticipantDecision(offerSpot)!, { location_rooms: rooms.map((r) => ({ value: r.id, label: r.label })) });
        const bound = applyParticipantDecisionInputs({ decision, values: { room: "room-3", start_date: "2026-11-02" } });
        expect(bound.ok).toBe(true);
        if (!bound.ok) return;
        expect(bound.answers.map((a) => a.value_label)).toEqual(["Room 3 · Infant", "2026-11-02"]);
        expect(participationPatchFromAnswers({ inputs: decision.required_inputs!, answers: bound.answers, rooms, offerLocationId: "site-1" })).toEqual({
            program_room_cohort_key: "room-3",
            location_id: "site-1",
            program_category_id: "cat-infant",
            start_date: "2026-11-02",
        });
    });

    it("a room from elsewhere, a location with no rooms, or a malformed date is refused", () => {
        const decision = withSourcedInputOptions(parseParticipantDecision(offerSpot)!, { location_rooms: rooms.map((r) => ({ value: r.id, label: r.label })) });
        expect(applyParticipantDecisionInputs({ decision, values: { room: "room-elsewhere", start_date: "2026-11-02" } }).ok).toBe(false);
        expect(applyParticipantDecisionInputs({ decision, values: { room: "room-3", start_date: "Nov 2" } }).ok).toBe(false);
        const none = withSourcedInputOptions(parseParticipantDecision(offerSpot)!, { location_rooms: [] });
        expect(applyParticipantDecisionInputs({ decision: none, values: { room: "room-3", start_date: "2026-11-02" } }).ok).toBe(false);
    });

    it("a path with no placement bindings records no placement", () => {
        const waitlist = parseParticipantDecision({ ...offerSpot, decision_key: "child_waitlist", required_inputs: [] })!;
        expect(participationPatchFromAnswers({ inputs: waitlist.required_inputs ?? [], answers: [], rooms, offerLocationId: "site-1" })).toEqual({});
    });
});

describe("per-child work: the runtime owns plain completion", () => {
    const plan = (completionTargets: Array<{ kind: string }>) =>
        parseStageOperatingPlanV1({
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "decision",
            journey_segment: "family",
            work_templates: [
                {
                    template_key: "review_child_paths",
                    label: "Decide each child's path",
                    required: true,
                    primary: true,
                    due_policy: { kind: "same_day" },
                    owner_strategy: "record_owner",
                    work_definition_key: "contact_family",
                    participant_decisions: [offerSpot],
                },
                { template_key: "decision_follow_up", label: "Follow up on the decision", required: false, primary: false, due_policy: { kind: "offset_days", days: 2 }, owner_strategy: "record_owner", work_definition_key: "contact_family" },
            ],
            outcomes: [
                { outcome_key: "paths_chosen", label: "Child paths chosen", completes_work: true },
                { outcome_key: "needs_follow_up", label: "Needs follow-up" },
            ],
            outcome_rules: [
                { rule_key: "done", when_outcome_key: "paths_chosen", targets: completionTargets },
                { rule_key: "follow_up", when_outcome_key: "needs_follow_up", targets: [{ kind: "create_next_work", template_key: "decision_follow_up" }] },
            ],
        })!;

    it("the one outcome that only completes the work is the runtime's", () => {
        const p = plan([{ kind: "mark_stage_work_complete" }]);
        expect(runtimeCompletionOutcomeKey(p, p.work_templates[0]!)).toBe("paths_chosen");
    });

    it("an outcome with consequences stays the operator's", () => {
        const p = plan([{ kind: "mark_stage_work_complete" }, { kind: "create_needs_attention" }]);
        expect(runtimeCompletionOutcomeKey(p, p.work_templates[0]!)).toBeNull();
    });

    it("work without per-child paths keeps every outcome the operator's", () => {
        const p = plan([{ kind: "mark_stage_work_complete" }]);
        expect(runtimeCompletionOutcomeKey(p, p.work_templates[1]!)).toBeNull();
    });
});
