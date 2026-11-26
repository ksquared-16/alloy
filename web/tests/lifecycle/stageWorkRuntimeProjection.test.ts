import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { InquirySummaryTaskPreviewPayload } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { buildStageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/buildStageWorkOutcomeAutomationPreview";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { filterResidualOperationalTasks } from "@/lib/lifecycle/filterResidualOperationalTasks";
import { isOperatingPlanWorkIntentTask } from "@/lib/lifecycle/isOperatingPlanWorkIntentTask";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import {
    buildQueueCurrentWorkSummary,
    formatQueueCurrentWorkLine,
} from "@/lib/workUnits/buildQueueCurrentWorkSummary";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(relPath: string): string {
    return readFileSync(join(webRoot, relPath), "utf8");
}

function stageRuntime(overrides: Partial<StageWorkRuntimeProjection> = {}): StageWorkRuntimeProjection {
    return {
        stage_key: "lead",
        stage_label: "Lead",
        purpose: "Review inbound lead and reach the family.",
        journey_segment: "family",
        template_keys: ["review_lead", "contact_family"],
        primary: {
            template_key: "review_lead",
            label: "Review Lead",
            role: "primary",
            state: "open",
            requires_outcome_picker: true,
            work_id: "work-primary",
            due_at: new Date().toISOString(),
            due_urgency: "due_today",
            attempt_count: 0,
            last_outcome: null,
            completed_at: null,
            outcomes: [{ outcome_key: "qualified", label: "Qualified", successful: true }],
            completion_policy_summary: null,
            completion_policy_min_attempts: null,
            completion_policy_max_attempts: null,
            outcome_automation_preview: [],
        },
        additional: [
            {
                template_key: "contact_family",
                label: "Contact Family",
                role: "secondary",
                state: "open",
                requires_outcome_picker: true,
                work_id: "work-secondary",
                due_at: new Date().toISOString(),
                due_urgency: "upcoming",
                attempt_count: 2,
                last_outcome: null,
                completed_at: null,
                outcomes: [],
                completion_policy_summary: "Requires 3 attempts within 7 days",
                completion_policy_min_attempts: 3,
                completion_policy_max_attempts: 3,
                outcome_automation_preview: [],
            },
        ],
        execution: {
            department_id: "dept-1",
            requires_outcome_picker: true,
            subject: { journey_segment: "family", opportunity_id: "opp-1" },
        },
        ...overrides,
    };
}

describe("isOperatingPlanWorkIntentTask", () => {
    it("classifies lifecycle work by template keys", () => {
        expect(
            isOperatingPlanWorkIntentTask(
                {
                    id: "1",
                    title: "Review Lead",
                    due_at: "",
                    status: "open",
                    source: "manual",
                    work_intent_key: "review_lead",
                },
                "lead",
                ["review_lead", "contact_family"],
            ),
        ).toBe(true);
    });

    it("keeps ad hoc manual tasks as residual follow-ups", () => {
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
                ["review_lead", "contact_family"],
            ),
        ).toBe(false);
    });

    it("classifies BP work by operating_plan_template_key", () => {
        expect(
            isOperatingPlanWorkIntentTask(
                {
                    id: "4",
                    title: "Record tour outcome",
                    due_at: "",
                    status: "open",
                    source: "manual",
                    work_intent_key: "complete_tour_process",
                    operating_plan_template_key: "record_tour_outcome_work",
                    lifecycle_stage_key: "tour",
                    lifecycle_provenance: "lifecycle_template",
                },
                "tour",
                ["confirm_tour_date", "record_tour_outcome_work"],
            ),
        ).toBe(true);
    });
});

describe("filterResidualOperationalTasks", () => {
    it("removes all stage template work from follow-ups", () => {
        const preview: InquirySummaryTaskPreviewPayload = {
            state: "loaded",
            open_count: 3,
            open_tasks: [
                {
                    id: "work-primary",
                    title: "Review Lead",
                    due_at: "",
                    status: "open",
                    source: "manual",
                    work_intent_key: "review_lead",
                },
                {
                    id: "work-secondary",
                    title: "Contact Family",
                    due_at: "",
                    status: "open",
                    source: "manual",
                    work_intent_key: "contact_family",
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

        const filtered = filterResidualOperationalTasks(preview, stageRuntime());
        expect(filtered.open_tasks.map((t) => t.id)).toEqual(["adhoc-1"]);
        expect(filtered.open_count).toBe(1);
    });
});

describe("buildStageWorkOutcomeAutomationPreview", () => {
    it("projects outcome automation labels for Contact Family from operating plan", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("lead");
        expect(plan).not.toBeNull();
        const preview = buildStageWorkOutcomeAutomationPreview({
            plan: plan!,
            templateKey: "contact_family",
        });
        expect(preview.some((line) => line.outcome_label === "Reached Family")).toBe(true);
        expect(preview.some((line) => line.outcome_key === "not_interested")).toBe(true);
        expect(preview.some((line) => line.outcome_key === "interested")).toBe(true);
    });
});

describe("buildQueueCurrentWorkSummary", () => {
    it("reads primary work from stage runtime payload", () => {
        const summary = buildQueueCurrentWorkSummary({
            _stage_work_runtime: stageRuntime(),
        });
        expect(summary?.label).toBe("Review Lead");
        expect(summary?.state).toBe("open");
    });

    it("formats queue current work line with progress hint", () => {
        const line = formatQueueCurrentWorkLine({
            label: "Review Lead",
            state: "open",
            due_label: null,
            progress_hint: "1 of 3 complete",
            blocker_hint: null,
        });
        expect(line).toBe("Review Lead · 1 of 3 complete");
    });

    it("formats queue current work line", () => {
        const line = formatQueueCurrentWorkLine({
            label: "Review Lead",
            state: "open",
            due_label: "Due today",
            progress_hint: null,
            blocker_hint: null,
        });
        expect(line).toContain("Review Lead");
        expect(line).toContain("Open");
        expect(line).toContain("Due today");
    });

    it("formats queue current work line with planned state", () => {
        const line = formatQueueCurrentWorkLine({
            label: "Contact Family",
            state: "planned",
            due_label: null,
            progress_hint: null,
            blocker_hint: null,
        });
        expect(line).toContain("Contact Family");
        expect(line).toContain("Planned");
    });

    it("fallback preview requires lifecycle_template provenance", () => {
        const withBpTask = buildQueueCurrentWorkSummary({
            _inquiry_summary_tasks: {
                state: "loaded",
                open_count: 1,
                open_tasks: [
                    {
                        id: "bp-1",
                        title: "Record tour outcome",
                        due_at: new Date().toISOString(),
                        status: "open",
                        source: "manual",
                        work_intent_key: "complete_tour_process",
                        operating_plan_template_key: "record_tour_outcome_work",
                        lifecycle_stage_key: "tour",
                        lifecycle_provenance: "lifecycle_template",
                    },
                ],
            },
        });
        expect(withBpTask?.label).toBe("Record tour outcome");

        const manualOnly = buildQueueCurrentWorkSummary({
            _inquiry_summary_tasks: {
                state: "loaded",
                open_count: 1,
                open_tasks: [
                    {
                        id: "manual-1",
                        title: "Call family",
                        due_at: new Date().toISOString(),
                        status: "open",
                        source: "manual",
                    },
                ],
            },
        });
        expect(manualOnly).toBeNull();
    });
});

describe("Work Runtime Convergence integration contracts", () => {
    it("compose wires stage_work_runtime and keeps stage-work in Activity Work Items", () => {
        const compose = read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts");
        const deferred = read("lib/adminV2/viewModel/drawer/opportunity/deferredDetailResource.ts");
        // Ownership moved: the stage-work projection is resolved through the thin shared slice
        // (which internally runs projectStageWorkRuntime). Activity Work Items uses unfiltered
        // tasks_raw so Contact Family shares identity with global Work Items.
        expect(deferred).toContain("resolveOpportunityStageWorkSlice");
        expect(compose).toContain("stage_work_runtime");
        expect(compose).toContain("tasks_raw");
        expect(compose).not.toContain("filterResidualOperationalTasks");
        const slice = read("lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityStageWorkSlice.ts");
        expect(slice).toContain("projectStageWorkRuntime");
    });

    it("default lead layout uses Current Work widget", () => {
        const layouts = read("lib/layout/defaultLeadLayouts.ts");
        expect(layouts).toContain('"current_work"');
        expect(layouts).toContain("Current Work");
        expect(layouts).not.toMatch(/widgetItem\([^)]*"tasks"/);
    });

    it("layout runtime maps current_work and legacy tasks widgets", () => {
        const planView = read("components/layout/LayoutRuntimePlanView.tsx");
        expect(planView).toContain('widgetKey === "current_work"');
        expect(planView).toContain("LayoutRuntimeCurrentWorkWidget");
        expect(planView).toContain("LayoutRuntimeFollowUpsWidget");
    });

    it("attention guidance resolves stage-plan reasons", () => {
        const guidance = read("lib/layout/runtime/resolveLayoutRuntimeAttentionGuidance.ts");
        expect(guidance).toContain("resolveStagePlanAttentionSummaryLine");
        expect(guidance).toContain("buildStagePlanAttentionGuidanceLines");
    });
});

describe("legacy-safe empty states", () => {
    it("returns null queue summary when no stage work present", () => {
        expect(buildQueueCurrentWorkSummary({})).toBeNull();
    });

    it("legacy tasks widget renders follow-ups safely", () => {
        const planView = read("components/layout/LayoutRuntimePlanView.tsx");
        expect(planView).toContain('widgetKey === "tasks"');
        expect(planView).toContain("Follow-ups");
    });
});
