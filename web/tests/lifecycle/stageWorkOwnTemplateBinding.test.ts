import { describe, expect, it } from "vitest";
import { taskMatchesStageWorkTemplate } from "@/lib/lifecycle/projectStageWorkRuntime";

/**
 * Two templates on one stage can share a work definition — "First outreach within 24 hours" and its
 * "Follow up with family" are both `contact_family` work. A task names its own template, and the
 * projection must bind it there only: otherwise the open follow-up paints as first outreach (wrong
 * label, wrong action) and the follow-up template looks open before any follow-up exists.
 */
const task = (templateKey: string, status = "open") =>
    ({
        id: `task-${templateKey}`,
        title: templateKey,
        status,
        due_at: null,
        updated_at: null,
        metadata: {
            work_definition_key: "contact_family",
            operating_plan_template_key: templateKey,
            work_intent_key: templateKey,
            lifecycle_stage_key: "lead",
            lifecycle_provenance: "lifecycle_template",
        },
    }) as never;

const firstOutreach = { template_key: "contact_family", work_definition_key: "contact_family" };
const followUp = { template_key: "follow_up_family", work_definition_key: "contact_family" };
const stageTemplateKeys = new Set(["contact_family", "follow_up_family"]);

describe("stage work binds a task to its own template", () => {
    it("the open follow-up is follow-up work, not first outreach", () => {
        expect(taskMatchesStageWorkTemplate(task("follow_up_family"), "lead", followUp, stageTemplateKeys)).toBe(true);
        expect(taskMatchesStageWorkTemplate(task("follow_up_family"), "lead", firstOutreach, stageTemplateKeys)).toBe(
            false,
        );
    });

    it("first outreach does not make the follow-up template look open", () => {
        expect(taskMatchesStageWorkTemplate(task("contact_family"), "lead", firstOutreach, stageTemplateKeys)).toBe(true);
        expect(taskMatchesStageWorkTemplate(task("contact_family"), "lead", followUp, stageTemplateKeys)).toBe(false);
    });

    it("a task naming no template on this stage still binds by its work definition", () => {
        expect(taskMatchesStageWorkTemplate(task("legacy_contact"), "lead", firstOutreach, stageTemplateKeys)).toBe(true);
    });

    it("without the stage's template keys the definition fallback is unchanged (orphan reconciler)", () => {
        expect(taskMatchesStageWorkTemplate(task("follow_up_family"), "lead", firstOutreach)).toBe(true);
    });
});
