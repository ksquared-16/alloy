import { describe, expect, it } from "vitest";
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
        expect(() => __testing.assertSupportedEntityType(def as any)).toThrowError(QueueServiceError);
        try {
            __testing.assertSupportedEntityType(def as any);
        } catch (e) {
            expect((e as QueueServiceError).status).toBe(501);
        }
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
    });
});

