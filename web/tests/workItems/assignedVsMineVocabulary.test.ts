/**
 * R14 — the Work Items assignment vocabulary.
 *
 * `Assigned` (KPI band) and `Mine` (view rail) render together on the Queue section of the Tasks
 * modal, with nothing saying which is broader. They are not comparable: the band counts
 * `operational_tasks` only and is always org-wide, while the rail merges three sources and honours
 * the selected site. The copy now names each population — but the SCOPES must not move, so these
 * guards pin the behaviour to exactly what it was and only the words to what they became.
 */
import { describe, expect, it } from "vitest";
import {
    WORK_ITEM_VIEW_DEFS,
    countTasksForView,
    filterTasksByView,
    resolveServerFilterForView,
    type WorkItemViewKey,
} from "@/lib/workItems/workItemQueueScope";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";

const ME = "user-me";
const OTHER = "user-other";

function task(id: string, assignee: string | null, status = "open"): MyTasksTaskRow {
    return {
        id,
        title: id,
        description: null,
        due_at: "2026-08-24T12:00:00.000Z",
        status,
        source: "manual",
        entity_id: null,
        entity_type: null,
        created_at: "2026-08-01T00:00:00.000Z",
        assigned_to_user_id: assignee,
    } as unknown as MyTasksTaskRow;
}

const CORPUS = [
    task("mine-1", ME),
    task("mine-2", ME),
    task("theirs-1", OTHER),
    task("unassigned-1", null),
    task("unassigned-2", null),
    task("mine-done", ME, "completed"),
];

const labelOf = (key: WorkItemViewKey) => WORK_ITEM_VIEW_DEFS.find((d) => d.key === key)?.label;

describe("R14 — visible vocabulary", () => {
    it("2 + 15: the current-operator view reads `Assigned to me`, and the ambiguous `Mine` is gone", () => {
        expect(labelOf("mine")).toBe("Assigned to me");
        expect(WORK_ITEM_VIEW_DEFS.map((d) => d.label)).not.toContain("Mine");
        expect(WORK_ITEM_VIEW_DEFS.map((d) => d.label)).not.toContain("My work");
    });

    it("the sibling view labels are untouched", () => {
        expect(WORK_ITEM_VIEW_DEFS.filter((d) => d.key !== "mine").map((d) => d.label)).toEqual([
            "Unassigned",
            "Waiting",
            "Due Today",
            "Due Soon",
            "Overdue",
            "Completed",
        ]);
    });

    it("13: internal keys are the stable contract and did not move with the copy", () => {
        expect(WORK_ITEM_VIEW_DEFS.map((d) => d.key)).toEqual([
            "mine",
            "unassigned",
            "waiting",
            "due_today",
            "due_soon",
            "overdue",
            "completed",
        ]);
    });
});

describe("R14 — scope behaviour is unchanged by the rename", () => {
    it("8: the current-operator view still resolves to the direct assignment server filter", () => {
        expect(resolveServerFilterForView("mine")).toBe("assigned_to_me");
        expect(resolveServerFilterForView("unassigned")).toBe("unassigned");
    });

    it("4 + 5: counts and result ids are the ones the old `Mine` view produced", () => {
        expect(countTasksForView(CORPUS, "mine", ME)).toBe(2);
        expect(filterTasksByView(CORPUS, "mine", ME).map((t) => t.id).sort()).toEqual([
            "mine-1",
            "mine-2",
            "mine-done",
        ]);
    });

    it("9: the view is per-operator — neither operator ever sees the other's work", () => {
        const mine = filterTasksByView(CORPUS, "mine", ME).map((t) => t.id);
        expect(mine).not.toContain("theirs-1");
        // The same corpus viewed as the other operator returns only THEIR task, never ours.
        const theirs = filterTasksByView(CORPUS, "mine", OTHER).map((t) => t.id);
        expect(theirs).toEqual(["theirs-1"]);
        expect(theirs).not.toContain("mine-1");
    });

    it("10: unassigned work stays out of the current-operator view and in its own", () => {
        expect(filterTasksByView(CORPUS, "mine", ME).map((t) => t.id)).not.toContain("unassigned-1");
        expect(countTasksForView(CORPUS, "unassigned", ME)).toBe(2);
    });

    it("a null current operator yields no current-operator work", () => {
        expect(countTasksForView(CORPUS, "mine", null)).toBe(0);
    });

    it("14: no assertion ties the two metrics together — they count different populations", () => {
        // The rail's current-operator count is deliberately NOT compared to the KPI band's count.
        // This test exists to state that: a future equality assertion would encode a false contract.
        const railMine = countTasksForView(CORPUS, "mine", ME);
        const kpiStyleAssignedAnyone = CORPUS.filter(
            (t) => t.status === "open" && (t.assigned_to_user_id ?? "").trim(),
        ).length;
        expect(railMine).toBe(2);
        expect(kpiStyleAssignedAnyone).toBe(3); // includes the other operator's task
        expect(railMine).not.toBe(kpiStyleAssignedAnyone);
    });
});
