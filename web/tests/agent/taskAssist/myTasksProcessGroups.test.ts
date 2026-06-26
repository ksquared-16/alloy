import { describe, expect, it } from "vitest";

import {
    deriveWorkItemsProcessGroups,
    filterTasksByProcessGroup,
    isStageSelectionKey,
    taskHasBusinessProcessContext,
    WORK_ITEMS_ALL_GROUP_KEY,
    WORK_ITEMS_GENERAL_GROUP_KEY,
    workItemsProcessKeyForTask,
    type WorkItemsProcessGroupTask,
} from "@/lib/agent/taskAssist/myTasksProcessGroups";

const DEPT_A = "11111111-1111-4111-8111-111111111111";
const DEPT_B = "22222222-2222-4222-8222-222222222222";

const bpTask = (overrides: Partial<WorkItemsProcessGroupTask> = {}): WorkItemsProcessGroupTask => ({
    entity_type: "opportunities",
    department_id: DEPT_A,
    lifecycle_stage_key: "tour_scheduled",
    lifecycle_provenance: "lifecycle_template",
    work_definition_key: "follow_up_after_tour",
    ...overrides,
});

const generalTask = (overrides: Partial<WorkItemsProcessGroupTask> = {}): WorkItemsProcessGroupTask => ({
    entity_type: null,
    department_id: null,
    lifecycle_stage_key: null,
    lifecycle_provenance: null,
    work_definition_key: null,
    ...overrides,
});

describe("Work Items process grouping (Business Process → Stage doctrine)", () => {
    it("attributes a task with Business Process metadata to its process and stage", () => {
        expect(workItemsProcessKeyForTask(bpTask())).toBe(DEPT_A);
        expect(taskHasBusinessProcessContext(bpTask())).toBe(true);

        const groups = deriveWorkItemsProcessGroups([bpTask(), bpTask({ lifecycle_stage_key: "waitlisted" })]);
        const process = groups.find((g) => g.key === DEPT_A);
        expect(process).toBeDefined();
        expect(process?.count).toBe(2);
        expect(process?.isGeneral).toBe(false);
        // Stage subgroups derived from lifecycle_stage_key, with humanized fallback labels.
        expect(process?.stages.map((s) => s.stageKey)).toEqual(["tour_scheduled", "waitlisted"]);
        expect(process?.stages.find((s) => s.stageKey === "tour_scheduled")?.label).toBe("Tour Scheduled");
        expect(process?.stages.find((s) => s.stageKey === "tour_scheduled")?.key).toBe(`${DEPT_A}::tour_scheduled`);
    });

    it("places tasks without Business Process metadata in General / Cross-process", () => {
        expect(workItemsProcessKeyForTask(generalTask())).toBe(WORK_ITEMS_GENERAL_GROUP_KEY);
        expect(taskHasBusinessProcessContext(generalTask())).toBe(false);

        const groups = deriveWorkItemsProcessGroups([bpTask(), generalTask(), generalTask()]);
        const general = groups.find((g) => g.key === WORK_ITEMS_GENERAL_GROUP_KEY);
        expect(general).toBeDefined();
        expect(general?.count).toBe(2);
        expect(general?.isGeneral).toBe(true);
        expect(general?.label).toBe("General / Cross-process");
    });

    it("does not fabricate a process group from entity_type alone (no fake enrollment bucket)", () => {
        // A manual task linked to an opportunity but with NO Business Process metadata.
        const oppLinkedManual = generalTask({ entity_type: "opportunities" });
        expect(workItemsProcessKeyForTask(oppLinkedManual)).toBe(WORK_ITEMS_GENERAL_GROUP_KEY);

        const groups = deriveWorkItemsProcessGroups([oppLinkedManual]);
        // Only "all" + "general" — never an inferred "enrollment" / process group.
        expect(groups.map((g) => g.key)).toEqual([WORK_ITEMS_ALL_GROUP_KEY, WORK_ITEMS_GENERAL_GROUP_KEY]);
    });

    it("always includes All work and only includes populated groups", () => {
        const allOnly = deriveWorkItemsProcessGroups([]);
        expect(allOnly.map((g) => g.key)).toEqual([WORK_ITEMS_ALL_GROUP_KEY]);
        expect(allOnly[0].count).toBe(0);

        const groups = deriveWorkItemsProcessGroups([
            bpTask(),
            bpTask({ department_id: DEPT_B, lifecycle_stage_key: "applied" }),
            generalTask(),
        ]);
        expect(groups.map((g) => g.key)).toEqual([
            WORK_ITEMS_ALL_GROUP_KEY,
            DEPT_A,
            DEPT_B,
            WORK_ITEMS_GENERAL_GROUP_KEY,
        ]);
        expect(groups.find((g) => g.key === WORK_ITEMS_ALL_GROUP_KEY)?.count).toBe(3);
    });

    it("applies explicit process and stage labels when provided", () => {
        const groups = deriveWorkItemsProcessGroups([bpTask()], {
            processLabels: { [DEPT_A]: "Enrollment" },
            stageLabels: { tour_scheduled: "Tour scheduled" },
        });
        const process = groups.find((g) => g.key === DEPT_A);
        expect(process?.label).toBe("Enrollment");
        expect(process?.stages[0]?.label).toBe("Tour scheduled");
    });

    it("filters by process, by stage, by general, and passes through for all", () => {
        const tasks = [
            bpTask(),
            bpTask({ lifecycle_stage_key: "waitlisted" }),
            bpTask({ department_id: DEPT_B, lifecycle_stage_key: "applied" }),
            generalTask(),
        ];
        expect(filterTasksByProcessGroup(tasks, WORK_ITEMS_ALL_GROUP_KEY)).toHaveLength(4);
        expect(filterTasksByProcessGroup(tasks, DEPT_A)).toHaveLength(2);
        expect(filterTasksByProcessGroup(tasks, DEPT_B)).toHaveLength(1);
        expect(filterTasksByProcessGroup(tasks, `${DEPT_A}::tour_scheduled`)).toHaveLength(1);
        expect(filterTasksByProcessGroup(tasks, `${DEPT_A}::waitlisted`)).toHaveLength(1);
        expect(filterTasksByProcessGroup(tasks, WORK_ITEMS_GENERAL_GROUP_KEY)).toHaveLength(1);
    });

    it("identifies stage selection keys", () => {
        expect(isStageSelectionKey(`${DEPT_A}::tour_scheduled`)).toBe(true);
        expect(isStageSelectionKey(DEPT_A)).toBe(false);
        expect(isStageSelectionKey(WORK_ITEMS_ALL_GROUP_KEY)).toBe(false);
        expect(isStageSelectionKey(WORK_ITEMS_GENERAL_GROUP_KEY)).toBe(false);
    });
});
