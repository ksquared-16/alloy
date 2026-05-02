import { describe, expect, it } from "vitest";
import { computeOperationsSignalCounts, mergeJobListsById, type JobRowForWorkspaceMetrics } from "@/lib/workspace/deriveDepartmentJobMetrics";

function job(partial: Partial<JobRowForWorkspaceMetrics> & { id: string }): JobRowForWorkspaceMetrics {
    return {
        id: partial.id,
        title: partial.title ?? null,
        status_key: partial.status_key ?? null,
        work_unit_id: partial.work_unit_id ?? null,
        gross_price_cents: partial.gross_price_cents ?? null,
        receivable_outstanding_cents: partial.receivable_outstanding_cents ?? null,
        _next_schedule: partial._next_schedule ?? null,
        _job_label: partial._job_label ?? null,
    };
}

describe("computeOperationsSignalCounts (operational scheduled today)", () => {
    it("uses API operationalDayScheduledCount instead of browser-local calendar", () => {
        const merged = [
            job({
                id: "a",
                _next_schedule: "2026-05-02T12:00:00.000Z",
            }),
        ];
        const now = new Date("2026-05-02T18:00:00.000Z");
        const withoutApi = computeOperationsSignalCounts(merged, now, {});
        expect(withoutApi.scheduledToday).toBe(0);

        const withApi = computeOperationsSignalCounts(merged, now, { operationalDayScheduledCount: 42 });
        expect(withApi.scheduledToday).toBe(42);
    });

    it("needsAttention / highTouch unchanged by operationalDayScheduledCount", () => {
        const merged = [
            job({
                id: "a",
                receivable_outstanding_cents: 100,
                _next_schedule: null,
            }),
        ];
        const now = new Date();
        const a = computeOperationsSignalCounts(merged, now, { operationalDayScheduledCount: 5 });
        expect(a.needsAttention).toBe(1);
        expect(a.scheduledToday).toBe(5);
    });

    it("mergeJobListsById dedupes by id", () => {
        const m = mergeJobListsById([job({ id: "x", title: "A" })], [job({ id: "x", title: "B" })]);
        expect(m).toHaveLength(1);
        expect(m[0]?.title).toBe("B");
    });
});
