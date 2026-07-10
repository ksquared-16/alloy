import { describe, expect, it } from "vitest";

import {
    newWorkTemplateDraft,
    stageOperatingPlanDraftDirty,
    stageOperatingPlanDraftFromSaved,
    stageOperatingPlanDraftToPersisted,
} from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import { validateStageOperatingPlanWorkDefinitions } from "@/lib/lifecycle/validateStageOperatingPlanWorkDefinitions";

describe("stage operating plan — new work item editor crash regression", () => {
    it("newWorkTemplateDraft resolves to a platform work definition", () => {
        const work = newWorkTemplateDraft(0);
        const result = validateStageOperatingPlanWorkDefinitions(
            { stage_key: "lead", work_templates: [work] },
            { stageKey: "lead" },
        );
        expect(result.ok).toBe(true);
        expect(work.work_definition_key).toBeTruthy();
    });

    it("stageOperatingPlanDraftDirty does not throw for in-progress drafts", () => {
        const saved = stageOperatingPlanDraftFromSaved(null, "lead");
        const draft = {
            ...saved,
            work_templates: [
                {
                    template_key: "orphan_template",
                    label: "In progress",
                    required: false,
                    due_policy: { kind: "same_day" as const },
                    owner_strategy: "record_owner" as const,
                },
            ],
        };

        expect(() => stageOperatingPlanDraftDirty(null, draft, "lead")).not.toThrow();
        expect(stageOperatingPlanDraftDirty(null, draft, "lead")).toBe(true);
    });

    it("simulates Add work item: dirty check succeeds after append", () => {
        const saved = stageOperatingPlanDraftFromSaved(null, "lead");
        const draft = {
            ...saved,
            work_templates: [...saved.work_templates, newWorkTemplateDraft(saved.work_templates.length)],
        };

        expect(() => stageOperatingPlanDraftDirty(null, draft, "lead")).not.toThrow();
        expect(stageOperatingPlanDraftDirty(null, draft, "lead")).toBe(true);

        const persisted = stageOperatingPlanDraftToPersisted(draft, "lead");
        expect(persisted?.work_templates).toHaveLength(1);
        expect(persisted?.work_templates[0]?.work_definition_key).toBeTruthy();
    });

    it("save path still rejects unresolved work definitions when validate is enabled", () => {
        const draft = stageOperatingPlanDraftFromSaved(null, "lead");
        draft.work_templates = [
            {
                template_key: "orphan_template",
                label: "Orphan",
                required: false,
                due_policy: { kind: "same_day" },
                owner_strategy: "record_owner",
            },
        ];

        expect(() => stageOperatingPlanDraftToPersisted(draft, "lead")).toThrow(
            /does not resolve to a platform work definition/i,
        );
    });
});
