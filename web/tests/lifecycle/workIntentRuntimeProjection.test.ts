import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { InquirySummaryTaskPreviewPayload } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { filterResidualOperationalTasks } from "@/lib/lifecycle/filterResidualOperationalTasks";
import { isOperatingPlanWorkIntentTask } from "@/lib/lifecycle/isOperatingPlanWorkIntentTask";
import type { WorkIntentRuntimeProjection } from "@/lib/lifecycle/workIntentRuntimeTypes";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

function baseProjection(overrides: Partial<WorkIntentRuntimeProjection> = {}): WorkIntentRuntimeProjection {
    return {
        state: "open",
        stage_key: "lead",
        work_intent_key: "make_contact",
        label: "Make Contact",
        journey_segment: "family",
        work_id: "work-1",
        due_at: new Date().toISOString(),
        due_urgency: "due_today",
        attempt_count: 0,
        last_outcome: null,
        completed_at: null,
        outcomes: [{ outcome_key: "reached", label: "Reached family" }],
        execution: {
            department_id: "dept-1",
            requires_outcome_picker: true,
            subject: { journey_segment: "family", opportunity_id: "opp-1" },
        },
        ...overrides,
    };
}

describe("isOperatingPlanWorkIntentTask", () => {
    it("classifies lifecycle work by work_intent_key", () => {
        expect(
            isOperatingPlanWorkIntentTask(
                {
                    id: "1",
                    title: "Make Contact",
                    due_at: "",
                    status: "open",
                    source: "manual",
                    work_intent_key: "make_contact",
                },
                "lead",
                ["make_contact"],
            ),
        ).toBe(true);
    });

    it("classifies lifecycle_template provenance as work intent", () => {
        expect(
            isOperatingPlanWorkIntentTask(
                {
                    id: "2",
                    title: "Follow up",
                    due_at: "",
                    status: "open",
                    source: "manual",
                    lifecycle_provenance: "lifecycle_template",
                    lifecycle_stage_key: "lead",
                },
                "lead",
                ["make_contact"],
            ),
        ).toBe(true);
    });

    it("keeps ad hoc manual tasks as residual", () => {
        expect(
            isOperatingPlanWorkIntentTask(
                {
                    id: "3",
                    title: "Call back",
                    due_at: "",
                    status: "open",
                    source: "task_assist",
                },
                "lead",
                ["make_contact"],
            ),
        ).toBe(false);
    });
});

describe("filterResidualOperationalTasks", () => {
    it("removes primary lifecycle work from task preview", () => {
        const preview: InquirySummaryTaskPreviewPayload = {
            state: "loaded",
            open_count: 2,
            open_tasks: [
                {
                    id: "work-1",
                    title: "Make Contact",
                    due_at: "",
                    status: "open",
                    source: "manual",
                    work_intent_key: "make_contact",
                },
                {
                    id: "adhoc-1",
                    title: "Send brochure",
                    due_at: "",
                    status: "open",
                    source: "task_assist",
                },
            ],
        };

        const filtered = filterResidualOperationalTasks(preview, baseProjection());
        expect(filtered.open_tasks.map((t) => t.id)).toEqual(["adhoc-1"]);
        expect(filtered.open_count).toBe(1);
    });
});

describe("Work Intent Runtime Phase A integration contracts", () => {
    it("compose wires stage work runtime and keeps stage-work tasks for Activity Work Items", () => {
        const compose = read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts");
        const deferred = read("lib/adminV2/viewModel/drawer/opportunity/deferredDetailResource.ts");
        // Stage-work projection ownership moved into the thin shared slice (runs
        // projectStageWorkRuntime internally); compose keeps inquiry tasks unfiltered
        // so Focus Panel Activity → Work Items includes Contact Family.
        expect(deferred).toContain("resolveOpportunityStageWorkSlice");
        expect(compose).toContain("tasks_raw");
        expect(compose).not.toContain("filterResidualOperationalTasks");
        expect(compose).toContain("stage_work_runtime");
        const slice = read("lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityStageWorkSlice.ts");
        expect(slice).toContain("projectStageWorkRuntime");
    });

    it("OpportunityDrawerOverviewBody uses layout runtime for current work", () => {
        const body = read("components/admin/vmDrawer/OpportunityDrawerOverviewBody.tsx");
        expect(body).not.toContain("WorkIntentRuntimeCard");
        expect(body).toContain("DrawerLayoutRuntimeOverviewBody");
    });

    it("drawer VM types declare work_intent_runtime on workspace", () => {
        const types = read("lib/adminV2/viewModel/drawer/types.ts");
        expect(types).toContain("work_intent_runtime:");
        expect(types).toContain("WorkIntentRuntimeProjection");
    });

    it("WorkIntentRuntimeCard reuses StageWorkOutcomePicker and completion client", () => {
        const card = read("components/workIntent/WorkIntentRuntimeCard.tsx");
        expect(card).toContain("StageWorkOutcomePicker");
        const hook = read("components/workIntent/useWorkIntentOutcomeCompletion.ts");
        expect(hook).toContain("completeStageWorkWithSelectedOutcome");
        expect(hook).toContain("reloadOpportunityDisplayVm");
    });
});
