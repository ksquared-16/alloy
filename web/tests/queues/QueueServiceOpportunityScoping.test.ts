import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getWorkUnitQueueItems } from "@/lib/queues/QueueService";
import { getWorkUnitQueueSummaries, QueueServiceError } from "@/lib/queues/QueueService";

describe("QueueService opportunity scoping", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("constrains opportunity queries by work_unit_id", async () => {
        const eqCalls: Array<{ col: string; val: unknown }> = [];

        const chain: any = {
            select: () => chain,
            eq: (col: string, val: unknown) => {
                eqCalls.push({ col, val });
                return chain;
            },
            in: () => chain,
            is: () => chain,
            gt: () => chain,
            gte: () => chain,
            lt: () => chain,
            or: () => chain,
            order: () => chain,
            range: async () => ({ data: [], error: null }),
        };

        const mockFrom = vi.fn((_table: string) => chain);

        // loadWorkUnitQueueDefinition call
        const mockWuSelect = vi.fn(() => ({
            eq: () => ({
                eq: () => ({
                    maybeSingle: async () => ({
                        data: {
                            id: "wu1",
                            org_id: "org1",
                            queue_definition: {
                                version: 1,
                                entity_type: "opportunity",
                                queues: [{ key: "all", label: "All", filters: [] }],
                            },
                        },
                        error: null,
                    }),
                }),
            }),
        }));

        const supabase: any = {
            from: (table: string) => {
                if (table === "work_units") return { select: mockWuSelect };
                return mockFrom(table);
            },
        };

        vi.mocked(createAdminClient).mockReturnValue(supabase);

        await getWorkUnitQueueItems({
            orgId: "org1",
            workUnitId: "wu1",
            queueKey: "all",
            limit: 10,
            offset: 0,
        });

        const workUnitEq = eqCalls.find((c) => c.col === "work_unit_id");
        expect(workUnitEq?.val).toBe("wu1");
    });

    it("returns INVALID_QUEUE_DEFINITION for legacy queue_definition shape", async () => {
        const mockWuSelect = vi.fn(() => ({
            eq: () => ({
                eq: () => ({
                    maybeSingle: async () => ({
                        data: {
                            id: "wu1",
                            org_id: "org1",
                            queue_definition: {
                                version: 1,
                                entity_type: "opportunity",
                                sort: { by: "updated_at", direction: "desc" },
                                limit: 50,
                            },
                        },
                        error: null,
                    }),
                }),
            }),
        }));

        const supabase: any = {
            from: (table: string) => {
                if (table === "work_units") return { select: mockWuSelect };
                // Should not be reached; validation should fail before querying items.
                return {
                    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
                };
            },
        };
        vi.mocked(createAdminClient).mockReturnValue(supabase);

        let err: unknown = null;
        try {
            await getWorkUnitQueueSummaries({ orgId: "org1", workUnitId: "wu1", limit: 3 });
        } catch (e) {
            err = e;
        }
        expect(err).toBeInstanceOf(QueueServiceError);
        expect((err as QueueServiceError).status).toBe(400);
        expect((err as QueueServiceError).code).toBe("INVALID_QUEUE_DEFINITION");
        expect((err as QueueServiceError).message).toBe("Work unit queue_definition is not QueueDefinitionV1");
    });
});

