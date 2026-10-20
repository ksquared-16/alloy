/**
 * Offer spot as child-specific Decision work:
 *  - a placement input may source its options from the child's location's program categories, valued
 *    by category id; validation runs against those, and an unknown id is refused;
 *  - the configuration survives the one parser (options_source, state_label) and the validator accepts
 *    a sourced select with no static options;
 *  - a transition's admin-authored label is used, and an unavailable one is not offered.
 */
import { describe, expect, it } from "vitest";

import { applyParticipantDecisionInputs } from "@/lib/lifecycle/applyParticipantDecisionInputs";
import { withSourcedInputOptions } from "@/lib/lifecycle/participantDecisionInputOptions";
import { parseParticipantDecision } from "@/lib/lifecycle/stageOperatingPlanV1";

const offerSpot = {
    decision_key: "child_offer_spot",
    action_ref: "waitlist_child",
    subject_grain: "child",
    label: "Offer spot",
    state_label: "Offer pending",
    targets: [
        { kind: "update_child_enrollment_status", disposition_key: "waitlisted" },
        { kind: "move_to_stage", stage_key: "offered" },
    ],
    required_inputs: [{ key: "placement", label: "Placement", type: "select", required: true, options_source: "location_program_categories" }],
};

describe("Offer spot placement source", () => {
    it("the parser keeps options_source and state_label", () => {
        const parsed = parseParticipantDecision(offerSpot)!;
        expect(parsed.state_label).toBe("Offer pending");
        expect(parsed.required_inputs?.[0]).toMatchObject({ key: "placement", type: "select", options_source: "location_program_categories" });
        expect(parsed.required_inputs?.[0]?.options).toBeUndefined();
    });

    it("options are the location's programs by category id; an id from elsewhere is refused", () => {
        const parsed = parseParticipantDecision(offerSpot)!;
        const programs = [{ value: "cat-toddler", label: "Toddler (North Campus)" }, { value: "cat-pre-k", label: "Pre-K" }];
        const decision = withSourcedInputOptions(parsed, programs);
        expect(decision.required_inputs?.[0]?.options).toEqual(programs);

        const ok = applyParticipantDecisionInputs({ decision, values: { placement: "cat-toddler" } });
        expect(ok.ok && ok.answers).toEqual([{ key: "placement", label: "Placement", value: "cat-toddler", value_label: "Toddler (North Campus)" }]);

        const refused = applyParticipantDecisionInputs({ decision, values: { placement: "Infant room" } });
        expect(refused.ok).toBe(false);
    });

    it("a location with no programs offers nothing to choose — and the required placement refuses", () => {
        const decision = withSourcedInputOptions(parseParticipantDecision(offerSpot)!, []);
        const r = applyParticipantDecisionInputs({ decision, values: {} });
        expect(r.ok).toBe(false);
    });
});
