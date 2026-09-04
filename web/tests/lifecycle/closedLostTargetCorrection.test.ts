/**
 * "Lost" was never a position, so the repair must not create one.
 *
 * Three family stages declare a "Close as Lost" exit to `closed_lost`, and the payload's stage list
 * has no such stage. Publication reports it twice — the destination is unknown, and a stage that
 * does not exist declares no grain, so the movement cannot be grain-checked either.
 *
 * The family status vocabulary has exactly two values, `open` and `closed`. The product already
 * records WHY a case closed as a durable close reason: `mark_lost` maps to
 * `{ status_key: "closed", close_reason_key: "lost" }`, and that same mapping notes there is
 * deliberately no "won" status either, because enrolment success is child-grain.
 *
 * So the destination moves to the family terminal the process actually has, and the reason has to
 * survive the move — otherwise a case lost to a competitor becomes indistinguishable from one closed
 * because the child enrolled.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseLifecycleBuilderV1, serializeLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { validateParsedBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import { correctInvalidClosedLostTargets } from "@/lib/businessProcesses/configuration/correctInvalidClosedLostTargets";
import { correctEnrollmentStageGrainDrift } from "@/lib/businessProcesses/configuration/correctEnrollmentStageGrainDrift";
import { mapOpportunityRecordActionToPatch } from "@/lib/recordChrome/opportunityRecordActionMap";

const deployed = () =>
    parseLifecycleBuilderV1(
        (JSON.parse(readFileSync(new URL("../runtime/fixtures/new-leads-entry.json", import.meta.url), "utf8")) as {
            metadata: { lifecycle_builder_v1: Record<string, unknown> };
        }).metadata.lifecycle_builder_v1,
    )!;

const stageOf = (b: ReturnType<typeof deployed>, key: string) =>
    b.processes[0]!.stages.find((s) => s.key === key);
const errs = (b: ReturnType<typeof deployed>) =>
    new Set(
        validateParsedBusinessProcessForPublish(b, serializeLifecycleBuilderV1(b)).errors.map(
            (e) => `${e.code} :: ${e.message}`,
        ),
    );

describe("the deployed shape closes onto a stage it does not have", () => {
    it("three family stages exit to an absent closed_lost", () => {
        const b = deployed();
        const present = new Set(b.processes[0]!.stages.map((s) => s.key));
        expect(present.has("closed_lost")).toBe(false);
        const offenders = b.processes[0]!.stages.filter((s) =>
            (s.stage_operating_plan_v1?.outgoing_transitions ?? []).some(
                (t) => t.target_stage_key === "closed_lost",
            ),
        );
        expect(offenders.map((s) => s.key)).toEqual(["lead", "tour", "decision"]);
    });
});

describe("the repair moves the position and keeps the reason", () => {
    const corrected = correctInvalidClosedLostTargets(deployed());

    it("makes no refusals on this shape, and reports each change", () => {
        expect(corrected.refusals).toEqual([]);
        expect(corrected.corrections).toHaveLength(3);
        expect(corrected.corrections.map((c) => c.change).join()).toContain("closed_lost");
    });

    it("does NOT create a closed_lost stage", () => {
        // The whole point of Director decision A.
        expect(corrected.builder.processes[0]!.stages.some((s) => s.key === "closed_lost")).toBe(false);
    });

    it("retargets the exits at the family terminal the process actually has", () => {
        for (const key of ["lead", "tour", "decision"]) {
            const exits = stageOf(corrected.builder, key)!.stage_operating_plan_v1!.outgoing_transitions ?? [];
            const closeExit = exits.find((t) => t.label === "Close as Lost")!;
            expect(closeExit.target_stage_key).toBe("closed");
        }
    });

    it("preserves the lost distinction as a durable close reason, from the canonical mapping", () => {
        /*
         * StageOutgoingTransitionV1 carries `status_key` and `closes_record` but NO
         * `close_reason_key` — only `update_family_case_status` accepts one. Repointing without
         * this would silently close every lost case as an ordinary closure.
         */
        const canonical = mapOpportunityRecordActionToPatch("mark_lost")!;
        for (const key of ["lead", "tour", "decision"]) {
            const rules = stageOf(corrected.builder, key)!.stage_operating_plan_v1!.outcome_rules ?? [];
            const closing = rules.find((r) =>
                (r.targets ?? []).some((t) => t.kind === "move_to_stage" && String(t.transition_ref ?? "").includes("closed_lost")),
            )!;
            const reason = closing.targets.find((t) => t.kind === "update_family_case_status")!;
            expect(reason.status_key).toBe(canonical.status_key);
            expect(reason.close_reason_key).toBe(canonical.close_reason_key);
        }
    });

    it("records the reason BEFORE the movement", () => {
        // So the case carries why it closed even if the move itself is refused downstream.
        const rules = stageOf(corrected.builder, "decision")!.stage_operating_plan_v1!.outcome_rules ?? [];
        const closing = rules.find((r) => (r.targets ?? []).some((t) => t.kind === "update_family_case_status"))!;
        expect(closing.targets[0]!.kind).toBe("update_family_case_status");
    });

    it("is idempotent and does not stack a second reason target", () => {
        const again = correctInvalidClosedLostTargets(corrected.builder);
        expect(again.alreadyCorrect).toBe(true);
        const rules = stageOf(again.builder, "decision")!.stage_operating_plan_v1!.outcome_rules ?? [];
        const reasons = rules.flatMap((r) => (r.targets ?? []).filter((t) => t.kind === "update_family_case_status"));
        expect(reasons).toHaveLength(1);
    });

    it("fails closed when no family terminal stage can be resolved", () => {
        /*
         * Inventing a destination would be the same class of error as inventing the stage. With every
         * family stage removed but the broken exits left in place, the repair must decline.
         */
        const b = deployed();
        const proc = b.processes[0]!;
        const stripped = {
            ...b,
            processes: [{
                ...proc,
                stages: proc.stages.filter((s) => !["closed"].includes(s.key) && s.key !== "waitlist"),
            }],
        };
        const result = correctInvalidClosedLostTargets(stripped);
        expect(result.corrections).toEqual([]);
        expect(result.refusals.length).toBeGreaterThan(0);
        expect(result.refusals[0]!.change).toContain("no family terminal stage");
    });
});

describe("the repair resolves real publication errors and introduces none", () => {
    const before = errs(deployed());
    const after = errs(correctInvalidClosedLostTargets(correctEnrollmentStageGrainDrift(deployed()).builder).builder);

    it("adds no publication error the deployed payload did not already have", () => {
        expect([...after].filter((e) => !before.has(e))).toEqual([]);
    });

    it("clears every closed_lost diagnosis", () => {
        expect([...after].join("\n")).not.toContain("closed_lost");
        expect([...after].join("\n")).not.toContain("Closed Lost");
    });

    it("leaves the waitlist cross-grain debt visible rather than masking it", () => {
        // Not this repair's job, and a Director decision is still open on it.
        expect([...after].join("\n")).toContain('moves a family to "Waitlist"');
    });
});

describe("a reason the tenant already recorded is never overwritten", () => {
    /*
     * A tenant may close a case for a reason of its own — `not_a_fit`, `not_moving_forward` — while
     * the exit is still broken. Stamping "lost" over that would be the repair rewriting a business
     * fact it was asked only to preserve. The exit is still repointed; the reason is left alone.
     *
     * This is the partial-repair path: broken exit, reason already present. It is not reachable by
     * running the correction twice, because the second run finds no broken exits and returns early.
     */
    function withExistingReason(reasonKey: string) {
        const b = deployed();
        const proc = b.processes[0]!;
        const stages = proc.stages.map((stage) => {
            if (stage.key !== "decision") return stage;
            const plan = stage.stage_operating_plan_v1!;
            return {
                ...stage,
                stage_operating_plan_v1: {
                    ...plan,
                    outcome_rules: (plan.outcome_rules ?? []).map((rule) =>
                        rule.when_outcome_key === "declined"
                            ? {
                                  ...rule,
                                  targets: [
                                      { kind: "update_family_case_status", status_key: "closed", close_reason_key: reasonKey },
                                      ...rule.targets,
                                  ],
                              }
                            : rule,
                    ),
                },
            };
        });
        return { ...b, processes: [{ ...proc, stages }] };
    }

    it("keeps the tenant's own close reason and adds no second one", () => {
        const result = correctInvalidClosedLostTargets(withExistingReason("not_a_fit") as ReturnType<typeof deployed>);
        const rules = stageOf(result.builder, "decision")!.stage_operating_plan_v1!.outcome_rules ?? [];
        const declined = rules.find((r) => r.when_outcome_key === "declined")!;
        const reasons = declined.targets.filter((t) => t.kind === "update_family_case_status");
        expect(reasons).toHaveLength(1);
        expect(reasons[0]!.close_reason_key).toBe("not_a_fit");
    });

    it("still repoints that stage's broken exit", () => {
        // Preserving the reason must not mean skipping the repair.
        const result = correctInvalidClosedLostTargets(withExistingReason("not_a_fit") as ReturnType<typeof deployed>);
        const exits = stageOf(result.builder, "decision")!.stage_operating_plan_v1!.outgoing_transitions ?? [];
        expect(exits.find((t) => t.label === "Close as Lost")!.target_stage_key).toBe("closed");
    });
});
