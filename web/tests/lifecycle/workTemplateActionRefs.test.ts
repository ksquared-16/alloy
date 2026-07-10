import { describe, expect, it } from "vitest";

import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    addWorkTemplateHelpfulAction,
    markWorkTemplateHelpfulActionsEmpty,
    reorderWorkTemplateHelpfulActions,
    setWorkTemplateAlternatePathDraftRefs,
    setWorkTemplateHelpfulActionRefs,
    setWorkTemplateOutcomeRefs,
    setWorkTemplatePrimaryActionRef,
    workTemplateAlternatePathDraftRefs,
    workTemplateHelpfulActionRefs,
    workTemplateOutcomeRefs,
} from "@/lib/lifecycle/stageWorkTemplateActionRefs";
import {
    stageOperatingPlanDraftDirty,
    stageOperatingPlanDraftFromSaved,
    stageOperatingPlanDraftToPersisted,
} from "@/lib/lifecycle/stageOperatingPlanEditorModel";

describe("workTemplateActionRefs", () => {
    const baseWork = {
        template_key: "contact_family",
        label: "Contact Family",
        required: true,
        due_policy: { kind: "same_day" as const },
        owner_strategy: "record_owner" as const,
    };

    it("persists and reloads action refs on work templates", () => {
        let work = setWorkTemplatePrimaryActionRef(baseWork, "quick_message");
        work = addWorkTemplateHelpfulAction(work, "schedule_tour");
        work = setWorkTemplateAlternatePathDraftRefs(work, [
            { kind: "action", ref: "close_lead" },
            { kind: "transition", ref: "move_to_stage:waitlist" },
        ]);
        work = setWorkTemplateOutcomeRefs(work, ["left_message", "reached_qualified"]);

        const plan = stageOperatingPlanDraftToPersisted(
            {
                purpose: "",
                journey_segment: "family",
                work_templates: [work],
                outcomes: [
                    { outcome_key: "left_message", label: "Left Message", work_template_key: "contact_family" },
                    { outcome_key: "reached_qualified", label: "Reached / Qualified", work_template_key: "contact_family", successful: true },
                ],
                outcome_rules: [],
                attention_rules: [],
            },
            "lead",
        )!;

        const reloaded = parseStageOperatingPlanV1(plan)!;
        const tpl = reloaded.work_templates[0]!;
        expect(tpl.primary_action?.action_ref).toBe("quick_message");
        expect(tpl.helpful_actions?.map((row) => row.action_ref)).toEqual(["schedule_tour"]);
        expect(workTemplateAlternatePathDraftRefs(tpl)).toEqual([
            { kind: "action", ref: "close_lead" },
            { kind: "transition", ref: "move_to_stage:waitlist" },
        ]);
        expect(workTemplateOutcomeRefs(tpl)).toEqual(["left_message", "reached_qualified"]);
    });

    it("preserves helpful action order", () => {
        let work = setWorkTemplateHelpfulActionRefs(baseWork, ["schedule_tour", "add_child", "send_form"]);
        work = reorderWorkTemplateHelpfulActions(work, ["send_form", "schedule_tour", "add_child"]);
        expect(workTemplateHelpfulActionRefs(work)).toEqual(["send_form", "schedule_tour", "add_child"]);
    });

    it("persists explicit empty helpful actions as empty array", () => {
        const work = markWorkTemplateHelpfulActionsEmpty(baseWork);
        const plan = stageOperatingPlanDraftToPersisted(
            {
                purpose: "",
                journey_segment: "family",
                work_templates: [work],
                outcomes: [],
                outcome_rules: [],
                attention_rules: [],
            },
            "lead",
            undefined,
            { validate: false },
        )!;
        expect(plan.work_templates[0]?.helpful_actions).toEqual([]);
    });

    it("dirty-state comparison does not throw while refs are temporarily invalid", () => {
        const saved = stageOperatingPlanDraftFromSaved(null, "lead");
        const draft = {
            ...saved,
            work_templates: [
                setWorkTemplateHelpfulActionRefs(baseWork, ["unknown_action_ref"]),
            ],
        };
        expect(() => stageOperatingPlanDraftDirty(null, draft, "lead")).not.toThrow();
    });
});
