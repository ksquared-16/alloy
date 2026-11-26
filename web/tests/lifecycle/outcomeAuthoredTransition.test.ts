/**
 * Authoring an exit path from the outcome that needs one.
 *
 * "Move through transition" used to be disabled whenever the stage had no outgoing path, while
 * the text beside it told the operator to create one — the control that required a transition was
 * the control that would not let them make it. The outcome editor can now author the path itself.
 *
 * These pin the part that must not go wrong: it writes the SAME canonical `outgoing_transitions`
 * entry the "Ways out of this stage" panel writes, and it does not quietly accumulate duplicates.
 */

import { describe, expect, it } from "vitest";

import {
    ensureOutgoingTransitionToStage,
    nextOutgoingTransitionDraft,
    newOutgoingTransitionDraft,
} from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { leadContactFamilyProofPlan } from "@/lib/lifecycle/fixtures/processStageOperatingContractProofPlans";
import { validateStageOperatingPlanOperatingContract } from "@/lib/lifecycle/validateStageOperatingPlanOperatingContract";

describe("transition_ref allocation", () => {
    it("does not reuse a ref the stage already holds", () => {
        const existing = [newOutgoingTransitionDraft("lead", 0, "tour")];
        const next = nextOutgoingTransitionDraft("lead", existing, "decision");
        expect(next.transition_ref).not.toBe(existing[0]!.transition_ref);
    });

    it("skips past a gap rather than colliding with a later ref", () => {
        // Remove the first path and the array length no longer predicts the next free index.
        const existing = [
            newOutgoingTransitionDraft("lead", 1, "tour"), // lead_transition_2
            newOutgoingTransitionDraft("lead", 2, "decision"), // lead_transition_3
        ];
        const next = nextOutgoingTransitionDraft("lead", existing, "waitlist");
        expect(existing.map((t) => t.transition_ref)).not.toContain(next.transition_ref);
    });
});

describe("find-or-create from an outcome", () => {
    it("creates the path when the stage has none", () => {
        const result = ensureOutgoingTransitionToStage("lead", [], "tour", "Tour");
        expect(result.created).toBe(true);
        expect(result.transitions).toHaveLength(1);
        expect(result.transition_ref).toBe(result.transitions[0]!.transition_ref);
    });

    it("writes the canonical shape, identical to the stage panel's own factory", () => {
        const { transitions } = ensureOutgoingTransitionToStage("lead", [], "tour", "Tour");
        const canonical = newOutgoingTransitionDraft("lead", 0, "tour");
        const created = transitions[0]!;
        expect(created.source_stage_key).toBe(canonical.source_stage_key);
        expect(created.target_stage_key).toBe(canonical.target_stage_key);
        expect(created.transition_ref).toBe(canonical.transition_ref);
        expect(created.available).toBe(canonical.available);
        // Only the operator-facing label differs — the destination is known here, so it can read
        // as a sentence instead of "New transition".
        expect(created.label).toBe("Move to Tour");
    });

    it("reuses the existing path to that destination instead of duplicating it", () => {
        const first = ensureOutgoingTransitionToStage("lead", [], "tour", "Tour");
        const second = ensureOutgoingTransitionToStage("lead", first.transitions, "tour", "Tour");

        expect(second.created).toBe(false);
        expect(second.transitions).toHaveLength(1);
        expect(second.transition_ref).toBe(first.transition_ref);
    });

    it("still adds a genuinely different destination", () => {
        const first = ensureOutgoingTransitionToStage("lead", [], "tour", "Tour");
        const second = ensureOutgoingTransitionToStage("lead", first.transitions, "decision", "Decision");
        expect(second.created).toBe(true);
        expect(second.transitions).toHaveLength(2);
        expect(second.transition_ref).not.toBe(first.transition_ref);
    });

    it("refuses a self-transition, which the operating contract rejects", () => {
        const result = ensureOutgoingTransitionToStage("lead", [], "lead", "Lead");
        expect(result.created).toBe(false);
        expect(result.transition_ref).toBeNull();
        expect(result.transitions).toHaveLength(0);
    });

    it("refuses an empty destination rather than writing a pathless path", () => {
        const result = ensureOutgoingTransitionToStage("lead", [], "   ");
        expect(result.created).toBe(false);
        expect(result.transition_ref).toBeNull();
    });

    it("leaves configured paths untouched", () => {
        const configured = [
            { ...newOutgoingTransitionDraft("lead", 0, "tour"), label: "Qualified", status_key: "open" },
        ];
        const result = ensureOutgoingTransitionToStage("lead", configured, "decision", "Decision");
        expect(result.transitions[0]).toEqual(configured[0]);
    });
});

describe("one problem is reported once", () => {
    // Materialising `outgoing_transitions` made a second validation pass reachable, and it reached
    // the same conclusion as the first: the surface rendered the identical sentence twice and gave
    // both list rows the same React key.
    it("does not report the same issue twice for one control", () => {
        const plan = leadContactFamilyProofPlan();
        const { transitions } = ensureOutgoingTransitionToStage(
            plan.stage_key,
            plan.outgoing_transitions ?? [],
            "tour",
            "Tour",
        );
        // Point an outcome at a path that is not an edge — the case both passes flag.
        const rule = plan.outcome_rules.find((r) => r.targets.some((t) => t.kind === "move_to_stage"))
            ?? plan.outcome_rules[0]!;
        rule.targets = [{ kind: "move_to_stage", transition_ref: "not_an_edge" }];

        const issues = validateStageOperatingPlanOperatingContract({
            plan: { ...plan, outgoing_transitions: transitions },
            transitionOptions: transitions.map((t) => ({
                transition_ref: t.transition_ref,
                label: t.label,
                target_stage_key: t.target_stage_key,
                target_stage_label: t.target_stage_key,
            })),
        });

        // `controlId:code` is the key the issues surface renders with, so it must be unique.
        const renderKeys = issues.map((i) => `${i.controlId}:${i.code}`);
        expect(new Set(renderKeys).size, "duplicate React keys in the issues list").toBe(
            renderKeys.length,
        );
    });

    it("keeps problems that differ by control, code, or grain", () => {
        const plan = leadContactFamilyProofPlan();
        plan.work_templates[0]!.primary_action = undefined;
        plan.work_templates[0]!.execution_mode = "direct_action";
        plan.outcome_rules[0]!.targets = [{ kind: "move_to_stage", transition_ref: "" }];

        const issues = validateStageOperatingPlanOperatingContract({
            plan,
            validPrimaryActionRefs: ["quick_message"],
        });
        // Dedup collapses restatements, never distinct diagnoses.
        expect(issues.some((i) => i.code === "primary_action_missing")).toBe(true);
        expect(issues.length).toBeGreaterThan(1);
    });
});

describe("the created path survives the persisted plan", () => {
    it("round-trips through the real Lead plan and clears the contract", () => {
        const plan = leadContactFamilyProofPlan();
        const { transitions, transition_ref } = ensureOutgoingTransitionToStage(
            plan.stage_key,
            plan.outgoing_transitions ?? [],
            "tour",
            "Tour",
        );

        const parsed = parseStageOperatingPlanV1({ ...plan, outgoing_transitions: transitions });
        expect(parsed, "an outcome-authored path must not invalidate the plan").not.toBeNull();
        const persisted = parsed!.outgoing_transitions ?? [];
        expect(persisted.some((t) => t.transition_ref === transition_ref)).toBe(true);
        expect(persisted.find((t) => t.transition_ref === transition_ref)?.target_stage_key).toBe("tour");

        // The identity checks that reject a hand-written path must pass for an authored one.
        const issues = validateStageOperatingPlanOperatingContract({ plan: parsed! });
        for (const code of [
            "transition_identity_invalid",
            "transition_identity_duplicate",
            "transition_source_invalid",
            "transition_destination_self",
        ]) {
            expect(issues.some((i) => i.code === code), code).toBe(false);
        }
    });
});
