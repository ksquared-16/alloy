import { describe, expect, it } from "vitest";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { shouldCloseWorkAfterStageOutcome } from "@/lib/lifecycle/shouldCloseWorkAfterStageOutcome";

describe("shouldCloseWorkAfterStageOutcome", () => {
    const leadPlan = defaultStageOperatingPlanForEnrollmentStage("lead")!;

    it("closes on successful outcome (qualified)", () => {
        expect(shouldCloseWorkAfterStageOutcome(leadPlan, "qualified")).toEqual({
            shouldClose: true,
            reason: "success",
        });
    });

    it("keeps work open on retry outcome (left_message)", () => {
        expect(shouldCloseWorkAfterStageOutcome(leadPlan, "left_message")).toEqual({
            shouldClose: false,
            reason: "retry",
        });
    });

    it("keeps work open on retry outcome (unable_to_reach below max)", () => {
        expect(shouldCloseWorkAfterStageOutcome(leadPlan, "unable_to_reach")).toEqual({
            shouldClose: false,
            reason: "retry",
        });
    });

    it("keeps work open on retry outcome (awaiting_response)", () => {
        expect(shouldCloseWorkAfterStageOutcome(leadPlan, "awaiting_response")).toEqual({
            shouldClose: false,
            reason: "retry",
        });
    });

    it("closes on terminal non-success (closed_lost → closed case)", () => {
        expect(shouldCloseWorkAfterStageOutcome(leadPlan, "closed_lost")).toEqual({
            shouldClose: true,
            reason: "terminal",
        });
    });

    it("closes on child terminal disposition (enrolled)", () => {
        const enrollingPlan = defaultStageOperatingPlanForEnrollmentStage("enrolling")!;
        expect(shouldCloseWorkAfterStageOutcome(enrollingPlan, "enrollment_complete")).toEqual({
            shouldClose: true,
            reason: "success",
        });
    });
});

/**
 * WORK CANNOT BE RETRIED IN A STAGE THE RECORD HAS LEFT.
 *
 * Measured on staging, on a disposable QA case standing at Tour with Conduct Tour open. The
 * published Tour plan configures BOTH completion outcomes this way:
 *
 *   outcome_7  "Tour Completed — Interested"       successful: null
 *   outcome_8  "Tour Completed — Needs Follow-up"  successful: null
 *   both rules: targets [{ kind: "move_to_stage", transition_ref: "tour_transition_2" }]
 *
 * Terminality was read only from the two status-moving target kinds, so `move_to_stage` fell
 * through to "retry". Recording the outcome executed the move and provisioned the Decision entry
 * work ("Review each child's path"), while Conduct Tour stayed `status: open` at Tour — a stage
 * nobody was standing in any more. Nothing could ever resolve it, and as prior-stage open work it
 * permanently blocked `tour_transition_2`, the very exit the outcome had just performed.
 *
 * The fixtures below are authored inline rather than taken from a default plan, because the
 * behaviour belongs to the target kind and must not depend on one process's defaults.
 */
describe("an outcome that leaves the stage closes its work", () => {
    const planWith = (targets: Record<string, unknown>[], successful: boolean | null = null) => ({
        version: 1,
        purpose: null,
        work_templates: [],
        outcomes: [{ outcome_key: "departs", label: "Departs", successful }],
        outcome_rules: [{ rule_key: "r", when_outcome_key: "departs", targets }],
    }) as never;

    it("closes when the configured consequence moves the record to another stage", () => {
        expect(shouldCloseWorkAfterStageOutcome(planWith([{ kind: "move_to_stage", transition_ref: "t2" }]), "departs"))
            .toEqual({ shouldClose: true, reason: "terminal" });
    });

    it("still keeps work open when the outcome stays put", () => {
        // `no_movement` is how the same plan authors a genuine retry — Tour's Awaiting Family
        // Response and No Show both use it. Closing those would destroy the retry contract.
        expect(shouldCloseWorkAfterStageOutcome(planWith([{ kind: "no_movement" }]), "departs"))
            .toEqual({ shouldClose: false, reason: "retry" });
    });

    it("closes when a move is one of several targets", () => {
        expect(shouldCloseWorkAfterStageOutcome(
            planWith([{ kind: "create_needs_attention", wait_bucket: "waiting_on_staff" }, { kind: "move_to_stage", transition_ref: "t2" }]),
            "departs",
        )).toEqual({ shouldClose: true, reason: "terminal" });
    });

    it("a successful outcome is still reported as success, not terminal", () => {
        // Ordering matters: `successful` is the stronger statement and is answered first.
        expect(shouldCloseWorkAfterStageOutcome(planWith([{ kind: "move_to_stage", transition_ref: "t2" }], true), "departs"))
            .toEqual({ shouldClose: true, reason: "success" });
    });
});
