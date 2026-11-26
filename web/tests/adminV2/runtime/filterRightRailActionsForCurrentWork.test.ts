import { describe, expect, it } from "vitest";

import { filterRightRailActionsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/filterRightRailActionsForCurrentWork";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { buildStageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/buildStageWorkOutcomeAutomationPreview";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

function action(key: string, label: string): ResolvedActionForClient {
    return {
        key,
        label,
        description: null,
        action_type: "registry",
        icon: null,
        style: null,
        display_style: "outline",
        payload: {},
        workflow_id: null,
    };
}

function openContactRuntime(): StageWorkRuntimeProjection {
    const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
    const contactTemplate = plan.work_templates.find((t) => t.template_key === "contact_family")!;
    return {
        stage_key: "lead",
        stage_label: "Lead",
        purpose: plan.purpose ?? "",
        journey_segment: "family",
        template_keys: ["contact_family"],
        primary: {
            template_key: "contact_family",
            label: contactTemplate.label,
            role: "primary",
            state: "open",
            requires_outcome_picker: true,
            work_id: "work-1",
            due_at: null,
            due_urgency: "none",
            attempt_count: 0,
            last_outcome: null,
            completed_at: null,
            outcomes: plan.outcomes.filter((o) => o.work_template_key === "contact_family"),
            completion_policy_summary: null,
            completion_policy_min_attempts: null,
            completion_policy_max_attempts: null,
            outcome_automation_preview: buildStageWorkOutcomeAutomationPreview({
                plan,
                templateKey: "contact_family",
            }),
        },
        additional: [],
        execution: {
            department_id: "dept-1",
            subject: { journey_segment: "family", opportunity_id: "opp-1" },
            requires_outcome_picker: true,
        },
    };
}

describe("filterRightRailActionsForCurrentWork", () => {
    it("demotes quick_message when Current Work owns completion", () => {
        const rail = [
            action("quick_message", "Message"),
            action("schedule_tour", "Schedule Tour"),
            action("add_child", "Add Child"),
        ];
        const filtered = filterRightRailActionsForCurrentWork(rail, {
            stageWorkRuntime: openContactRuntime(),
            canMutate: true,
        });
        expect(filtered.map((a) => a.key)).toEqual(["schedule_tour", "add_child"]);
    });

    it("passes through all actions when no open completion work", () => {
        const rail = [action("quick_message", "Message")];
        const filtered = filterRightRailActionsForCurrentWork(rail, {
            stageWorkRuntime: null,
            canMutate: true,
        });
        expect(filtered).toEqual(rail);
    });
});
