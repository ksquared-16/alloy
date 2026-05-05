import { describe, expect, it } from "vitest";
import { getOrgLocalTodayUtcBounds } from "@/lib/admin/orgLocalDayBounds";
import { QueueServiceError, __testing } from "@/lib/queues/QueueService";

describe("QueueService — pure helpers", () => {
    it("queue lookup by key", () => {
        const def = {
            version: 1,
            entity_type: "job" as const,
            queues: [{ key: "all", label: "All", filters: [] }],
        };
        expect(__testing.findQueueByKey(def as any, "all").label).toBe("All");
    });

    it("unknown queue key fails", () => {
        const def = {
            version: 1,
            entity_type: "job" as const,
            queues: [{ key: "all", label: "All", filters: [] }],
        };
        expect(() => __testing.findQueueByKey(def as any, "missing")).toThrowError(QueueServiceError);
    });

    it("unsupported entity type fails clearly", () => {
        const def = {
            version: 1,
            entity_type: "opportunity" as const,
            queues: [{ key: "all", label: "All", filters: [] }],
        };
        // Opportunity is now supported.
        expect(() => __testing.assertSupportedEntityType(def as any)).not.toThrow();
    });

    it("unsupported filter field fails clearly", () => {
        const q = {
            key: "x",
            label: "X",
            filters: [{ type: "field", field_key: "not_allowed", operator: "eq", value: 1 }],
        };
        expect(() => __testing.buildJobPlan(q as any)).toThrowError(QueueServiceError);
    });

    it("valid job status filter builds path", () => {
        const q = {
            key: "x",
            label: "X",
            filters: [{ type: "status", operator: "in", values: ["new", "scheduled"] }],
            sort: [{ field: "created_at", direction: "asc" }],
        };
        const plan = __testing.buildJobPlan(q as any);
        expect(plan.ops).toEqual([{ kind: "in", column: "status_key", values: ["new", "scheduled"] }]);
        expect(plan.sort[0]).toEqual({ column: "created_at", ascending: true });
        expect(plan.calendar_meta).toBeUndefined();
    });

    it("job today filter uses org operational day bounds and returns calendar_meta", () => {
        const refUtc = new Date("2026-05-02T12:00:00.000Z");
        const dayBounds = getOrgLocalTodayUtcBounds("America/New_York", refUtc);
        const ctx = {
            dayBounds,
            calendar_meta: {
                calendar_type: "operational_day" as const,
                timezone_effective: "America/New_York",
                timezone_source: "org_metadata" as const,
                day_start_utc: dayBounds.dayStartUtc.toISOString(),
                day_end_exclusive_utc: dayBounds.dayEndExclusiveUtc.toISOString(),
            },
        };
        const q = {
            key: "x",
            label: "X",
            filters: [{ type: "date" as const, field: "created_at" as const, operator: "today" as const }],
        };
        const plan = __testing.buildJobPlan(q as any, ctx as any);
        expect(plan.ops).toEqual([
            { kind: "gte", column: "created_at", value: dayBounds.dayStartUtc.toISOString() },
            { kind: "range_lt", column: "created_at", value: dayBounds.dayEndExclusiveUtc.toISOString() },
        ]);
        expect(plan.calendar_meta).toEqual(ctx.calendar_meta);
    });

    it("opportunity status filter builds path", () => {
        const q = {
            key: "x",
            label: "X",
            filters: [{ type: "status", operator: "in", values: ["new_inquiry", "contacted"] }],
            sort: [{ field: "updated_at", direction: "desc" }],
        };
        const plan = __testing.buildOpportunityPlan(q as any);
        expect(plan.ops).toEqual([{ kind: "in", column: "status_key", values: ["new_inquiry", "contacted"] }]);
        expect(plan.sort[0]).toEqual({ column: "updated_at", ascending: false });
        expect(plan.calendar_meta).toBeUndefined();
    });

    it("unsupported opportunity field fails clearly", () => {
        const q = {
            key: "x",
            label: "X",
            filters: [{ type: "field", field_key: "customer_id", operator: "eq", value: "c1" }],
        };
        expect(() => __testing.buildOpportunityPlan(q as any)).toThrowError(QueueServiceError);
    });

    it("needs attention OR expr uses per-status and() branches (no status_key.in list)", () => {
        const now = new Date("2026-01-10T12:00:00.000Z");
        const expr = __testing.buildOpportunityNeedsAttentionOrExpr(now);
        expect(expr).toContain("and(status_key.eq.application_in_progress,");
        expect(expr).toContain("and(status_key.eq.ready_to_enroll,");
    });

    it("needs attention candidate OR prefilter is a superset (includes contact/person null lanes)", () => {
        const now = new Date("2026-01-10T12:00:00.000Z");
        const expr = __testing.buildOpportunityNeedsAttentionCandidateOrExpr(now);
        expect(expr).toContain("customer_id.is.null");
        expect(expr).toContain("primary_person_id.is.null");
        expect(expr).toContain("primary_contact_id.is.null");
        expect(expr).toContain("updated_at.lt.");
        expect(expr).toContain("metadata->>next_follow_up_at.lt.");
        expect(expr).toContain("and(status_key.eq.tour_scheduled,metadata->>tour_date.lt.");
    });

    it("opportunity exception queue returns 501 when evaluated", () => {
        const q = {
            key: "needs_attention",
            label: "Needs attention",
            filters: [{ type: "exception", operator: "exists" }],
        };
        const now = new Date("2026-01-10T12:00:00.000Z");
        const plan = __testing.buildOpportunityPlan(q as any, now);
        expect(plan.ops.some((op: any) => op.kind === "or")).toBe(true);
    });

    it("needs attention: mid-funnel stale >7d included", () => {
        const now = new Date("2026-01-10T12:00:00.000Z");
        expect(
            __testing.opportunityNeedsAttention(
                {
                    updated_at: "2025-12-20T11:00:00.000Z",
                    primary_person_id: "p1",
                    primary_contact_id: "pc1",
                    customer_id: "c1",
                    status_key: "contacted",
                    metadata: {},
                },
                now
            )
        ).toBe(true);
    });

    it("needs attention: enrolled and lost never flagged", () => {
        const now = new Date("2026-01-10T12:00:00.000Z");
        const stale = "2025-12-01T11:00:00.000Z";
        expect(
            __testing.opportunityNeedsAttention(
                {
                    updated_at: stale,
                    primary_person_id: "p1",
                    customer_id: "c1",
                    status_key: "enrolled",
                    metadata: { next_follow_up_at: "2020-01-01T00:00:00.000Z" },
                },
                now
            )
        ).toBe(false);
        expect(
            __testing.opportunityNeedsAttention(
                {
                    updated_at: stale,
                    primary_person_id: "p1",
                    customer_id: "c1",
                    status_key: "lost",
                    metadata: {},
                },
                now
            )
        ).toBe(false);
    });

    it("needs attention: overdue next_follow_up_at in metadata", () => {
        const now = new Date("2026-01-10T12:00:00.000Z");
        expect(
            __testing.opportunityNeedsAttention(
                {
                    updated_at: "2026-01-10T11:00:00.000Z",
                    primary_person_id: "p1",
                    customer_id: "c1",
                    status_key: "waitlisted",
                    metadata: { next_follow_up_at: "2026-01-05T15:00:00.000Z" },
                },
                now
            )
        ).toBe(true);
    });

    it("needs attention: tour date passed while still tour_scheduled", () => {
        const now = new Date("2026-01-10T12:00:00.000Z");
        expect(
            __testing.opportunityNeedsAttention(
                {
                    updated_at: "2026-01-10T11:00:00.000Z",
                    primary_person_id: "p1",
                    customer_id: "c1",
                    status_key: "tour_scheduled",
                    metadata: { tour_date: "2026-01-08" },
                },
                now
            )
        ).toBe(true);
    });

    it("needs attention: missing customer/contact included", () => {
        const now = new Date("2026-01-10T12:00:00.000Z");
        expect(
            __testing.opportunityNeedsAttention(
                {
                    updated_at: "2026-01-10T11:00:00.000Z",
                    primary_contact_id: null,
                    customer_id: "c1",
                    status_key: "new",
                },
                now
            )
        ).toBe(true);
        expect(
            __testing.opportunityNeedsAttention(
                {
                    updated_at: "2026-01-10T11:00:00.000Z",
                    primary_contact_id: "pc1",
                    customer_id: null,
                    status_key: "new",
                },
                now
            )
        ).toBe(true);
    });

    it("needs attention: childcare funnel statuses stale >2d included", () => {
        const now = new Date("2026-01-10T12:00:00.000Z");
        const stale2d = "2026-01-08T11:59:59.000Z"; // just over 2 days before `now`
        const row = { updated_at: stale2d, primary_contact_id: "pc1", customer_id: "c1" };
        for (const status_key of ["tour_scheduled", "tour_completed", "application_in_progress", "ready_to_enroll"]) {
            expect(__testing.opportunityNeedsAttention({ ...row, status_key }, now)).toBe(true);
        }
    });

    it("needs attention: non-matching record excluded", () => {
        const now = new Date("2026-01-10T12:00:00.000Z");
        expect(
            __testing.opportunityNeedsAttention(
                {
                    updated_at: "2026-01-10T11:00:00.000Z",
                    primary_contact_id: "pc1",
                    customer_id: "c1",
                    status_key: "contacted",
                },
                now
            )
        ).toBe(false);
    });

    it("needs attention: contacted stale 4d excluded (7d threshold)", () => {
        const now = new Date("2026-01-10T12:00:00.000Z");
        expect(
            __testing.opportunityNeedsAttention(
                {
                    updated_at: "2026-01-06T12:00:00.000Z",
                    primary_person_id: "p1",
                    primary_contact_id: "pc1",
                    customer_id: "c1",
                    status_key: "contacted",
                    metadata: {},
                },
                now
            )
        ).toBe(false);
    });

    it("needs attention: very stale new_inquiry excluded (not actionable as 'stale row' alone)", () => {
        const now = new Date("2026-01-10T12:00:00.000Z");
        expect(
            __testing.opportunityNeedsAttention(
                {
                    updated_at: "2026-01-01T11:00:00.000Z",
                    primary_person_id: "p1",
                    primary_contact_id: null,
                    customer_id: "c1",
                    status_key: "new_inquiry",
                    metadata: {},
                },
                now
            )
        ).toBe(false);
    });
});

