import { describe, expect, it } from "vitest";

import {
    buildOpportunityFirstViewportPlan,
    opportunityFirstPaintDependencySatisfiedFromRecord,
    OPPORTUNITY_DRAWER_WORKFLOW_V1_FIRST_PAINT_DEPENDENCIES,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerFirstViewportContract";
import {
    applyStageWorkSliceToVm,
    markStageWorkErrorOnVm,
    stageWorkStateFromSlice,
} from "@/lib/adminV2/viewModel/drawer/opportunity/applyStageWorkSliceToVm";
import { minimalSettledOpportunityDrawerViewModel } from "./fixtures/minimalSettledOpportunityDrawerViewModel";

/**
 * Focus Panel first-paint request-graph guards. The Focus Panel's first useful commit must not
 * depend on full person VMs, per-child VM fan-out, activity, the related-record graph, or
 * communications. The workflow_v1 first-viewport contract is a CLOSED dependency set; these tests
 * lock it so a future edit that adds a heavy first-paint dependency fails deterministically here
 * (the deployed numbers still await browser certification, but the request graph is deterministic).
 */

/** Concepts that must never be a first-paint dependency — deferred / interaction-triggered only. */
const FORBIDDEN_FIRST_PAINT_CONCEPTS = [
    "person_vm",
    "person_view_model",
    "child_vm",
    "child_view_model",
    "activity",
    "activity_timeline",
    "related",
    "related_graph",
    "related_records",
    "communication",
    "communications",
    "messages",
    "threads",
    "recipients",
    "evidence",
];

function mentionsForbidden(key: string): string | null {
    const k = key.toLowerCase();
    return FORBIDDEN_FIRST_PAINT_CONCEPTS.find((c) => k.includes(c)) ?? null;
}

describe("Focus Panel first-paint dependency contract", () => {
    it("the frozen first-paint dependency list contains no person/child/activity/related/comms dependency", () => {
        for (const dep of OPPORTUNITY_DRAWER_WORKFLOW_V1_FIRST_PAINT_DEPENDENCIES) {
            const hit = mentionsForbidden(dep);
            expect(hit, `forbidden first-paint dependency: ${dep} (matched ${hit})`).toBeNull();
        }
    });

    it("children are ONE batched dependency — there is no per-child dependency key (no N-request fan-out)", () => {
        const childDeps = OPPORTUNITY_DRAWER_WORKFLOW_V1_FIRST_PAINT_DEPENDENCIES.filter((d) =>
            d.includes("child"),
        );
        // Exactly the single `inquiry_children` batch — never `child_1`, `child_vm`, per-child, etc.
        expect(childDeps).toEqual(["inquiry_children"]);
    });

    it("inquiry children are satisfied from the already-loaded record (no first-paint per-child fetch)", () => {
        const withChildren = { _inquiry_children: [{ id: "c1" }, { id: "c2" }, { id: "c3" }] };
        expect(opportunityFirstPaintDependencySatisfiedFromRecord("inquiry_children", withChildren)).toBe(true);
        // record_visible is always satisfied from the record itself (no extra fetch).
        expect(opportunityFirstPaintDependencySatisfiedFromRecord("record_visible", {})).toBe(true);
    });

    it("buildOpportunityFirstViewportPlan never emits a forbidden dependency under any flag combination", () => {
        const shell = minimalSettledOpportunityDrawerViewModel().layout.shell;
        for (const task_assist_enabled of [false, true]) {
            for (const queue_definition_present of [false, true]) {
                const plan = buildOpportunityFirstViewportPlan({
                    shell,
                    task_assist_enabled,
                    queue_definition_present,
                });
                for (const dep of plan.dependencies) {
                    const hit = mentionsForbidden(dep);
                    expect(
                        hit,
                        `plan(task_assist=${task_assist_enabled}, queue_def=${queue_definition_present}) emitted forbidden dep ${dep}`,
                    ).toBeNull();
                }
                // No first-paint dependency is ever a per-child fan-out.
                expect(plan.dependencies.filter((d) => d.includes("child"))).toEqual(
                    plan.dependencies.includes("inquiry_children") ? ["inquiry_children"] : [],
                );
            }
        }
    });
});

describe("Focus Panel Current Work — pending is distinct from empty, geometry is stable", () => {
    it("stage-work load states are three distinct values (pending ≠ empty ≠ ready)", () => {
        // The Tier-1 deferred compose ships { status: "pending" }; the Tier-2 slice resolves to ready
        // (runtime present) or empty (runtime absent) — a pending projection must never read as empty.
        expect(stageWorkStateFromSlice({
            stage_work_runtime: null,
            published_stage_inputs: null,
            work_intent_runtime: null,
        })).toEqual({ status: "empty" });

        const ready = stageWorkStateFromSlice({
            stage_work_runtime: { anything: true } as never,
            published_stage_inputs: null,
            work_intent_runtime: null,
        });
        expect(ready.status).toBe("ready");
    });

    it("applying the deferred stage-work slice touches ONLY the Current Work region — geometry unchanged", () => {
        const vm = minimalSettledOpportunityDrawerViewModel();
        // Simulate the Tier-1 deferred state, then resolve the Tier-2 slice as empty.
        const pendingVm = { ...vm, workspace: { ...vm.workspace, stage_work: { status: "pending" as const } } };
        const resolved = applyStageWorkSliceToVm(pendingVm, {
            stage_work_runtime: null,
            published_stage_inputs: null,
            work_intent_runtime: null,
        });

        // Current Work region transitioned pending → empty (distinct states, no false-empty flash pre-resolve).
        expect(pendingVm.workspace.stage_work?.status).toBe("pending");
        expect(resolved.workspace.stage_work?.status).toBe("empty");

        // Card order + geometry do NOT depend on deferred data: every above-fold region except the
        // record payload is reference-identical, and the frozen layout/shell is untouched.
        expect(resolved.layout).toBe(pendingVm.layout);
        for (const key of Object.keys(pendingVm.above_fold) as Array<keyof typeof pendingVm.above_fold>) {
            if (key === "record") continue;
            expect(resolved.above_fold[key], `above_fold.${String(key)} must be untouched`).toBe(
                pendingVm.above_fold[key],
            );
        }
    });

    it("a stage-work error retains any prior runtime — Current Work is never blanked on failure", () => {
        const vm = minimalSettledOpportunityDrawerViewModel();
        const withRuntime = {
            ...vm,
            workspace: { ...vm.workspace, stage_work_runtime: { keep: true } as never },
        };
        const errored = markStageWorkErrorOnVm(withRuntime);
        expect(errored.workspace.stage_work?.status).toBe("error");
        expect((errored.workspace.stage_work as { retained?: unknown } | undefined)?.retained).toEqual({ keep: true });
    });
});
