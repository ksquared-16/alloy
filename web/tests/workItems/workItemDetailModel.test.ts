import { describe, expect, it } from "vitest";

import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import {
    buildWorkItemDetailModel,
    resolveWorkItemCompletionAuthority,
    resolveWorkItemDetailState,
    resolveWorkItemSourceKind,
} from "@/lib/workItems/workItemDetailModel";

const NOW = Date.parse("2026-09-10T12:00:00.000Z");

function row(overrides: Partial<MyTasksTaskRow> = {}): MyTasksTaskRow {
    return {
        id: "t1",
        title: "Call the family",
        description: null,
        due_at: "2026-09-11T12:00:00.000Z",
        status: "open",
        source: "manual",
        entity_id: null,
        entity_type: null,
        created_at: "2026-09-01T00:00:00.000Z",
        ...overrides,
    };
}

const bpRow = row({
    source: "lifecycle_stage_work",
    entity_id: "opp-1",
    entity_type: "opportunities",
    entity_label: "Rivera Family",
    department_id: "dept-enrollment",
    lifecycle_stage_key: "tour_scheduled",
    work_definition_key: "schedule_tour",
    lifecycle_provenance: "lifecycle_template",
});

describe("work item source kind", () => {
    it("classifies each source", () => {
        expect(resolveWorkItemSourceKind(row())).toBe("manual");
        expect(resolveWorkItemSourceKind(bpRow)).toBe("business_process");
        expect(
            resolveWorkItemSourceKind(row({ is_communications_projection: true, communication_thread_id: "c1" })),
        ).toBe("communications");
        expect(
            resolveWorkItemSourceKind(row({ is_processing_projection: true, processing_case_id: "p1" })),
        ).toBe("processing");
    });
});

describe("completion authority", () => {
    /**
     * The whole point of the convergence: Work Items may only close work it actually owns. Every
     * projected source keeps its completion on the domain runtime that owns the truth.
     */
    it("leaves every projected source with its domain", () => {
        expect(resolveWorkItemCompletionAuthority("manual")).toBe("work_items");
        expect(resolveWorkItemCompletionAuthority("business_process")).toBe("current_work");
        expect(resolveWorkItemCompletionAuthority("communications")).toBe("communications");
        expect(resolveWorkItemCompletionAuthority("processing")).toBe("processing");
    });

    it("never hands Work Items authority over business process work", () => {
        const model = buildWorkItemDetailModel(bpRow, undefined, NOW);
        expect(model.completionAuthority).toBe("current_work");
        expect(model.completionAuthority).not.toBe("work_items");
    });
});

describe("due state is derived once", () => {
    it("separates overdue, due today and later", () => {
        expect(resolveWorkItemDetailState(row({ due_at: "2026-09-09T12:00:00.000Z" }), NOW)).toBe("overdue");
        expect(resolveWorkItemDetailState(row({ due_at: "2026-09-10T23:00:00.000Z" }), NOW)).toBe("due_today");
        expect(resolveWorkItemDetailState(row({ due_at: "2026-09-20T12:00:00.000Z" }), NOW)).toBe("open");
    });

    it("completed and canceled both read as completed regardless of due date", () => {
        expect(resolveWorkItemDetailState(row({ status: "completed", due_at: "2026-01-01T00:00:00.000Z" }), NOW))
            .toBe("completed");
        expect(resolveWorkItemDetailState(row({ status: "canceled", due_at: "2026-01-01T00:00:00.000Z" }), NOW))
            .toBe("completed");
    });
});

describe("why this exists", () => {
    it("explains business process work in operator language, not runtime keys", () => {
        const model = buildWorkItemDetailModel(bpRow, undefined, NOW);
        expect(model.reason).toContain("business process");
        expect(model.originPath).toBeTruthy();
        // No operating-plan or projection machinery leaks into operator copy.
        for (const text of [model.reason, model.originPath ?? ""]) {
            expect(text).not.toContain("operating_plan");
            expect(text).not.toContain("lifecycle_template");
            expect(text).not.toContain("work_definition_key");
            expect(text).not.toContain("Not projected yet");
        }
    });

    it("names the subject the work is about", () => {
        expect(buildWorkItemDetailModel(bpRow, undefined, NOW).subjectLabel).toBe("Rivera Family");
    });

    it("says manual work was created manually", () => {
        expect(buildWorkItemDetailModel(row(), undefined, NOW).reason).toBe("Created manually.");
    });
});
