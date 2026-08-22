/**
 * FEDERATED WORK ITEMS COUNTS — one label, one denominator.
 *
 * The Work Items queue is federated: `operational_tasks` (manual/BP) plus two virtual projections,
 * Processing and Communications. `due_at` is NOT the same fact across them — one is an operator
 * commitment, two are derived — so a due metric that sums all three counts something nobody promised.
 *
 * Measured on Firefly: unified **Overdue 9** (1 real + 8 processing cases older than a day) beside a
 * KPI strip reading **Overdue 1**. Communications was already excluded from due metrics; Processing
 * was not, and that asymmetry was the entire disagreement.
 */
import { describe, expect, it } from "vitest";

import {
    hasAuthoritativeDueCommitment,
    filterTasksByView,
} from "@/lib/workItems/workItemQueueScope";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";

const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();

const manual = (over: Partial<MyTasksTaskRow> = {}): MyTasksTaskRow => ({
    id: "task-1", title: "Conduct Tour", description: "", due_at: yesterday, status: "open",
    source: "manual", entity_id: null, entity_type: null, assigned_to_user_id: null,
    created_at: yesterday, ...over,
} as MyTasksTaskRow);

const processing = (): MyTasksTaskRow => ({
    ...manual(), id: "processing:case-1", source: "processing",
    processing_case_id: "case-1", is_processing_projection: true,
} as MyTasksTaskRow);

const communications = (): MyTasksTaskRow => ({
    ...manual(), id: "communications:thread-1", source: "communications",
    communication_thread_id: "thread-1", is_communications_projection: true,
} as MyTasksTaskRow);

describe("due metrics count only sources that own a due commitment", () => {
    it("a manual task owns its due date", () => {
        expect(hasAuthoritativeDueCommitment(manual())).toBe(true);
    });

    it("a Processing projection does NOT — its due is statusChangedAt + 1 day", () => {
        expect(hasAuthoritativeDueCommitment(processing())).toBe(false);
    });

    it("a Communications projection does NOT — its due is the last activity time", () => {
        expect(hasAuthoritativeDueCommitment(communications())).toBe(false);
    });

    it("Overdue counts the commitment, not the derivations — the Firefly shape", () => {
        // 1 real overdue task + 8 processing + 2 communications, all with past due_at.
        const tasks = [
            manual(),
            ...Array.from({ length: 8 }, (_, i) => ({ ...processing(), id: `processing:case-${i}` })),
            ...Array.from({ length: 2 }, (_, i) => ({ ...communications(), id: `communications:t-${i}` })),
        ];
        expect(tasks.length).toBe(11);
        const overdue = filterTasksByView(tasks, "overdue", null);
        expect(overdue).toHaveLength(1);
        expect(overdue[0]!.source).toBe("manual");
    });

    it("excluded rows are still real work — they stay in the unfiltered queue", () => {
        const tasks = [manual(), processing(), communications()];
        expect(filterTasksByView(tasks, "all", null)).toHaveLength(3);
    });

    it("Mine and Unassigned remain assignment metrics, unaffected by the due rule", () => {
        const mine = manual({ id: "t-mine", assigned_to_user_id: "user-1" });
        const tasks = [mine, manual({ id: "t-un" }), processing()];
        expect(filterTasksByView(tasks, "mine", "user-1").map((t) => t.id)).toEqual(["t-mine"]);
        // Processing carries no assignment model at all, so it is unassigned by construction.
        expect(filterTasksByView(tasks, "unassigned", "user-1").map((t) => t.id)).toEqual(["t-un", "processing:case-1"]);
    });
});
