/**
 * Firefly Operating Configuration — certification of observed runtime behavior.
 *
 * Loads the EXACT operating plans the live Firefly tenant is running (captured to
 * docs/sprints/active/assets/firefly-config/inventory.json) and runs them through the SAME
 * matcher + transition resolver the certified transaction engine uses. Because the engine is
 * already certified to honor configuration faithfully (see capability-certification-report.md),
 * resolving the real config through these functions IS the observed runtime behavior — without
 * mutating the live family record.
 *
 * These tests assert what the configuration CURRENTLY does. Several assertions document
 * defects-in-configuration on purpose; the recommended changes live in the report, not here.
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { outcomeRulesForKey } from "@/lib/lifecycle/stageOperatingPlanV1";
import { resolveStageTransitionExecutionTargets } from "@/lib/lifecycle/resolveStageTransitionExecutionTargets";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const INVENTORY = path.join(
    __dirname,
    "../../../docs/sprints/active/assets/firefly-config/inventory.json",
);

const CONFIGURED_STAGES = new Set(["lead", "qualification", "tour", "waitlist", "enrollment", "enrolled"]);

function loadPlan(stageKey: string): StageOperatingPlanV1 {
    const inv = JSON.parse(fs.readFileSync(INVENTORY, "utf8")) as {
        stage_bootstraps: Record<string, { stage_operating_plan: StageOperatingPlanV1 | null }>;
    };
    const plan = inv.stage_bootstraps[stageKey]?.stage_operating_plan;
    if (!plan) throw new Error(`no plan for ${stageKey}`);
    return plan;
}

/** Resolve every executable target an outcome produces, mirroring executeStageOperatingOutcome. */
function resolveOutcome(plan: StageOperatingPlanV1, outcomeKey: string, attemptCount: number | null = null) {
    const rules = outcomeRulesForKey(plan, outcomeKey, { attemptCount });
    const targets: string[] = [];
    const errors: string[] = [];
    const stagesMovedTo: string[] = [];
    for (const rule of rules) {
        for (const target of rule.targets) {
            const resolved = resolveStageTransitionExecutionTargets(plan, target);
            if (resolved.error) {
                errors.push(resolved.error);
                continue;
            }
            for (const t of resolved.targets) {
                targets.push(t.kind);
                if (t.kind === "move_to_stage" && t.stage_key) stagesMovedTo.push(t.stage_key);
            }
        }
    }
    return { ruleCount: rules.length, targets, errors, stagesMovedTo };
}

describe("Firefly config — LEAD stage", () => {
    const plan = loadPlan("lead");

    it("Reached / Qualified moves the family to `qualification`", () => {
        const r = resolveOutcome(plan, "reached_qualified");
        expect(r.stagesMovedTo).toEqual(["qualification"]);
        expect(r.targets).toContain("update_family_case_status");
    });

    it("DEFECT (config): `qualification` is not a configured stage with a plan — the reached lead lands in a void", () => {
        // qualification IS in the configured stage set, but its operating plan is null (below),
        // so a reached lead moves into a stage with no work, no outcomes and no transitions.
        const inv = JSON.parse(fs.readFileSync(INVENTORY, "utf8")) as {
            stage_bootstraps: Record<string, { stage_operating_plan: unknown }>;
        };
        expect(CONFIGURED_STAGES.has("qualification")).toBe(true);
        expect(inv.stage_bootstraps["qualification"].stage_operating_plan).toBeNull();
    });

    it("DEFECT (config): `left_message` reopens the work with NO attempt cap — the loop never escalates", () => {
        // At attempt 1 and at attempt 3 (the configured max) the behavior is identical: reopen.
        const atOne = resolveOutcome(plan, "left_message", 1);
        const atMax = resolveOutcome(plan, "left_message", 3);
        expect(atOne.targets).toEqual(["reopen_work"]);
        expect(atMax.targets).toEqual(["reopen_work"]); // still reopens at the cap
    });

    it("`unable_to_reach` DOES escalate at the cap — proving the gate exists and was simply omitted from left_message", () => {
        const below = resolveOutcome(plan, "unable_to_reach", 2);
        const atCap = resolveOutcome(plan, "unable_to_reach", 3);
        expect(below.targets).toEqual(["reopen_work"]);
        expect(atCap.targets).toEqual(["create_needs_attention"]);
    });

    it("Closed Lost closes the family case", () => {
        const r = resolveOutcome(plan, "contact_closed_lost");
        expect(r.targets).toContain("update_family_case_status");
        expect(r.errors).toEqual([]);
    });
});

describe("Firefly config — TOUR stage", () => {
    const plan = loadPlan("tour");

    it("DEFECT (config): Tour Completed — Interested moves the family to `decision`, which is NOT a configured stage", () => {
        const r = resolveOutcome(plan, "outcome_7");
        // The transition resolves cleanly (it IS declared), so the engine will really write
        // stage_key = "decision" — a stage absent from the 6 configured stages.
        expect(r.errors).toEqual([]);
        expect(r.stagesMovedTo).toEqual(["decision"]);
        expect(CONFIGURED_STAGES.has("decision")).toBe(false);
    });

    it("DEFECT (config): Tour Completed — Needs Follow-up also strands the family in `decision`", () => {
        const r = resolveOutcome(plan, "outcome_8");
        expect(r.stagesMovedTo).toEqual(["decision"]);
        expect(CONFIGURED_STAGES.has("decision")).toBe(false);
    });

    it("Move to Waitlist correctly targets the configured `waitlist` stage", () => {
        const r = resolveOutcome(plan, "outcome_4");
        expect(r.stagesMovedTo).toEqual(["waitlist"]);
        expect(CONFIGURED_STAGES.has("waitlist")).toBe(true);
    });

    it("DEFECT (config): three outcomes have NO rule — recording them does nothing", () => {
        const ruled = new Set(plan.outcome_rules.map((r) => r.when_outcome_key));
        const unruled = plan.outcomes.filter((o) => !ruled.has(o.outcome_key)).map((o) => o.outcome_key);
        // Family Declined Tour, Tour Confirmed, Tour Rescheduled.
        expect(unruled).toEqual(expect.arrayContaining(["outcome_3", "outcome_6", "outcome_9"]));
    });

    it("DEFECT (config): recording `Tour Scheduled` as an outcome only fires no_movement — nothing advances", () => {
        const r = resolveOutcome(plan, "outcome_1");
        expect(r.targets).toEqual(["no_movement"]); // the only target — a documented no-op
        expect(r.stagesMovedTo).toEqual([]);
    });
});

describe("Firefly config — WAITLIST stage", () => {
    const plan = loadPlan("waitlist");

    it("Spot offered advances the child to `enrollment` and sets offer_pending", () => {
        const r = resolveOutcome(plan, "spot_offered");
        expect(r.stagesMovedTo).toEqual(["enrollment"]);
        expect(r.targets).toContain("update_child_enrollment_status");
        expect(r.errors).toEqual([]);
    });
});

describe("Firefly config — ENROLLMENT stage", () => {
    const plan = loadPlan("enrollment");

    it("Enrollment complete advances the child to `enrolled`", () => {
        const r = resolveOutcome(plan, "enrollment_complete");
        expect(r.stagesMovedTo).toEqual(["enrolled"]);
        expect(r.targets).toContain("update_child_enrollment_status");
        expect(r.errors).toEqual([]);
    });
});

describe("Firefly config — the tour BOOKING capability vs the tour STAGE outcomes are disconnected", () => {
    it("no tour stage outcome_rule reacts to the {tour_booking, scheduled} domain signal", () => {
        // Booking a tour emits a domain signal; the tour stage's rules are all outcome-keyed.
        const plan = loadPlan("tour");
        const domainRules = plan.outcome_rules.filter((r) => r.when_domain_signal != null);
        expect(domainRules).toEqual([]);
    });
});
