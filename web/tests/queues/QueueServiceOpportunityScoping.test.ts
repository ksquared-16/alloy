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

        /** Terminal `await` on Postgrest builders (count head, status_definitions list, etc.). */
        function makeGenericQueryable(resolve: () => Record<string, unknown>) {
            const c: any = {};
            let mode: "default" | "count_head" = "default";
            c.select = (_cols?: unknown, opts?: unknown) => {
                if (opts && typeof opts === "object" && "head" in opts && (opts as { head?: boolean }).head) {
                    mode = "count_head";
                }
                return c;
            };
            c.eq = (col: string, val: unknown) => {
                eqCalls.push({ col, val });
                return c;
            };
            c.in = () => c;
            c.is = () => c;
            c.gt = () => c;
            c.gte = () => c;
            c.lt = () => c;
            c.or = () => c;
            c.order = () => c;
            c.range = async () => ({ data: [], error: null });
            c.maybeSingle = async () => ({ data: null, error: null });
            c.single = async () => ({ data: null, error: null });
            c.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
                const payload = mode === "count_head" ? { count: 0, error: null } : resolve();
                mode = "default";
                return Promise.resolve(payload).then(onFulfilled as any, onRejected as any);
            };
            return c;
        }

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
                if (table === "orgs") {
                    return {
                        select: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: { industry_id: null }, error: null }),
                            }),
                        }),
                    };
                }
                if (table === "industries") {
                    return {
                        select: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: null, error: null }),
                            }),
                        }),
                    };
                }
                if (table === "status_definitions") {
                    const c: any = {
                        select: () => c,
                        eq: () => c,
                        in: () => c,
                        is: () => c,
                        order: () => c,
                    };
                    c.then = (fn: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(fn as any);
                    return c;
                }
                if (table === "opportunities") return makeGenericQueryable(() => ({ data: [], error: null }));
                return makeGenericQueryable(() => ({ data: [], error: null }));
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
                if (table === "org_settings") {
                    return {
                        select: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: { metadata: null },
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
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

