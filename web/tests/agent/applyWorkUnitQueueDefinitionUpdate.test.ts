import { describe, expect, it } from "vitest";
import {
    applyWorkUnitQueueDefinitionUpdate,
    prepareQueueDefinitionPatch,
} from "@/lib/agent/v0/applyWorkUnitQueueDefinitionUpdate";

const validV1 = {
    version: 1,
    entity_type: "job" as const,
    sort: { by: "updated_at" as const, direction: "desc" as const },
    limit: 10,
};

describe("prepareQueueDefinitionPatch", () => {
    it("returns 409 when expected version does not match stored", () => {
        const r = prepareQueueDefinitionPatch({}, validV1, 1);
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.status).toBe(409);
            expect(r.code).toBe("STALE_VERSION");
        }
    });

    it("accepts upgrade from empty {} with expected 0", () => {
        const r = prepareQueueDefinitionPatch({}, validV1, 0);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.nextQueueDefinition.version).toBe(1);
    });

    it("rejects invalid v1 payload", () => {
        const r = prepareQueueDefinitionPatch({}, { version: 1, entity_type: "job", sort: { by: "bad", direction: "desc" }, limit: 10 }, 0);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.status).toBe(400);
    });

    it("clears to {} when incoming is null", () => {
        const r = prepareQueueDefinitionPatch(validV1, null, 1);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.nextQueueDefinition).toEqual({});
    });
});

describe("applyWorkUnitQueueDefinitionUpdate", () => {
    it("updates work unit when mock supabase succeeds", async () => {
        const wuRow = { id: "wu1", org_id: "o1", queue_definition: {} };
        const updatedRow = {
            id: "wu1",
            queue_definition: {
                version: 1,
                entity_type: "job",
                sort: { by: "updated_at", direction: "desc" },
                limit: 10,
            },
            updated_at: "2026-01-01T00:00:00.000Z",
        };

        const supabase = {
            from: () => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({ data: wuRow, error: null }),
                        }),
                    }),
                }),
                update: () => ({
                    eq: () => ({
                        eq: () => ({
                            select: () => ({
                                single: async () => ({ data: updatedRow, error: null }),
                            }),
                        }),
                    }),
                }),
            }),
        };

        const result = await applyWorkUnitQueueDefinitionUpdate(
            supabase as never,
            "o1",
            "wu1",
            {
                queue_definition: validV1,
                expected_queue_definition_version: 0,
            }
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.row.queue_definition).toEqual(updatedRow.queue_definition);
        }
    });

    it("returns 404 when work unit missing", async () => {
        const supabase = {
            from: () => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({ data: null, error: null }),
                        }),
                    }),
                }),
            }),
        };

        const result = await applyWorkUnitQueueDefinitionUpdate(
            supabase as never,
            "o1",
            "wu1",
            {
                queue_definition: validV1,
                expected_queue_definition_version: 0,
            }
        );

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(404);
    });
});
