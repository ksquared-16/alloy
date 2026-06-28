import { describe, it, expect, vi } from "vitest";

import { createAlloyApiClient, AlloyApiError, type FetchLike } from "@/lib/api/alloyApiClient";
import type {
    ActionExecuteResponse,
    MetricDefinition,
    EntityRecord,
    ReferenceDataItem,
} from "@/lib/api/generated/alloyApiTypes";

/**
 * Contract tests for the generated internal API client (Phase 3B).
 *
 * Proves: types compile (the typed assignments below), success unwrap, typed failure throw,
 * correlation id on errors, and one representative operation per route family — all against a
 * mocked fetch (no network / no DB).
 *
 * @see docs/api/internal-typescript-client.md
 */

type MockResponse = Awaited<ReturnType<FetchLike>>;

function ok(body: unknown, correlationId = "cid-success", status = 200): MockResponse {
    return {
        ok: status >= 200 && status < 400,
        status,
        headers: { get: (n: string) => (n.toLowerCase() === "x-correlation-id" ? correlationId : null) },
        json: async () => body,
    };
}

function envelopeOk(data: unknown, correlationId = "cid-success") {
    return ok({ ok: true, data, correlation_id: correlationId }, correlationId);
}

function envelopeFail(
    error: { code: string; message: string; details?: unknown },
    status: number,
    correlationId = "cid-fail"
) {
    return ok({ ok: false, error, correlation_id: correlationId }, correlationId, status);
}

/** A fetch stub that records calls and returns a queued response. */
function stubFetch(response: MockResponse) {
    const calls: Array<{ url: string; init?: Parameters<FetchLike>[1] }> = [];
    const fn = vi.fn(async (url: string, init?: Parameters<FetchLike>[1]) => {
        calls.push({ url, init });
        return response;
    }) as unknown as FetchLike;
    return { fn, calls };
}

describe("createAlloyApiClient — success unwrap (per family)", () => {
    it("actions.execute unwraps data (ActionExecuteResponse)", async () => {
        const { fn, calls } = stubFetch(envelopeOk({ execution_result: { kind: "noop" }, affected_id: "opp-1" }));
        const api = createAlloyApiClient({ fetch: fn });
        const result: ActionExecuteResponse = await api.actions.execute({
            action_key: "noop_action",
            entity_type: "opportunity",
            entity_id: "opp-1",
        });
        expect(result.execution_result).toEqual({ kind: "noop" });
        expect(result.affected_id).toBe("opp-1");
        // POST to the right path with a JSON body
        expect(calls[0].url).toBe("/api/admin/actions/execute");
        expect(calls[0].init?.method).toBe("POST");
        expect(JSON.parse(calls[0].init?.body as string).action_key).toBe("noop_action");
    });

    it("actions.inventory unwraps data.items", async () => {
        const { fn } = stubFetch(envelopeOk({ items: [{ definition: {}, placement: {} }] }));
        const api = createAlloyApiClient({ fetch: fn });
        const items = await api.actions.inventory();
        expect(Array.isArray(items)).toBe(true);
        expect(items).toHaveLength(1);
    });

    it("metrics.get unwraps data.item (MetricDefinition)", async () => {
        const { fn, calls } = stubFetch(envelopeOk({ item: { id: "m1", key: "tours", label: "Tours" } }));
        const api = createAlloyApiClient({ fetch: fn });
        const metric: MetricDefinition = await api.metrics.get("m1");
        expect(metric.id).toBe("m1");
        expect(calls[0].url).toBe("/api/admin/analytics/metrics/m1");
        expect(calls[0].init?.method).toBe("GET");
    });

    it("entity.get unwraps data.entity (EntityRecord)", async () => {
        const { fn, calls } = stubFetch(envelopeOk({ entity: { id: "p1", _status_display: "Active" } }));
        const api = createAlloyApiClient({ fetch: fn });
        const entity: EntityRecord = await api.entity.get("persons", "p1");
        expect(entity.id).toBe("p1");
        expect(calls[0].url).toBe("/api/admin/entity/persons/p1");
    });

    it("referenceData list unwraps data.items (ReferenceDataItem[])", async () => {
        const { fn, calls } = stubFetch(envelopeOk({ items: [{ id: "r1", key: "primary_contact" }] }));
        const api = createAlloyApiClient({ fetch: fn });
        const items: ReferenceDataItem[] = await api.referenceData.customerPersonRoleTypes.list();
        expect(items[0].key).toBe("primary_contact");
        expect(calls[0].url).toBe("/api/admin/customer-person-role-types");
    });
});

describe("createAlloyApiClient — typed failures", () => {
    it("throws AlloyApiError on a normalized failure envelope and preserves code/status/correlation", async () => {
        const { fn } = stubFetch(envelopeFail({ code: "NOT_FOUND", message: "Not found" }, 404, "cid-404"));
        const api = createAlloyApiClient({ fetch: fn });
        await expect(api.metrics.get("missing")).rejects.toBeInstanceOf(AlloyApiError);
        try {
            await api.metrics.get("missing");
            expect.unreachable("should have thrown");
        } catch (e) {
            const err = e as AlloyApiError;
            expect(err.code).toBe("NOT_FOUND");
            expect(err.status).toBe(404);
            expect(err.correlationId).toBe("cid-404");
        }
    });

    it("surfaces ACTION_BLOCKED details from execute failures", async () => {
        const { fn } = stubFetch(
            envelopeFail(
                { code: "ACTION_BLOCKED", message: "Add a classroom first.", details: { blockers: ["needs_room"] } },
                422,
                "cid-blocked"
            )
        );
        const api = createAlloyApiClient({ fetch: fn });
        try {
            await api.actions.execute({ action_key: "approve", entity_type: "opportunity", entity_id: "opp-1" });
            expect.unreachable("should have thrown");
        } catch (e) {
            const err = e as AlloyApiError;
            expect(err.code).toBe("ACTION_BLOCKED");
            expect(err.status).toBe(422);
            expect((err.details as { blockers: string[] }).blockers).toContain("needs_room");
            expect(err.correlationId).toBe("cid-blocked");
        }
    });

    it("throws on a non-2xx response even without an error envelope", async () => {
        const { fn } = stubFetch(ok("upstream boom", "cid-500", 500));
        const api = createAlloyApiClient({ fetch: fn });
        await expect(api.actions.inventory()).rejects.toMatchObject({ status: 500 });
    });

    it("throws NETWORK_ERROR when fetch rejects", async () => {
        const fn = vi.fn(async () => {
            throw new Error("connection refused");
        }) as unknown as FetchLike;
        const api = createAlloyApiClient({ fetch: fn });
        try {
            await api.metrics.list();
            expect.unreachable("should have thrown");
        } catch (e) {
            const err = e as AlloyApiError;
            expect(err.code).toBe("NETWORK_ERROR");
            expect(err.status).toBe(0);
        }
    });
});

describe("createAlloyApiClient — request shaping", () => {
    it("sends a client correlation id header when configured", async () => {
        const { fn, calls } = stubFetch(envelopeOk({ items: [], adapters: [] }));
        const api = createAlloyApiClient({ fetch: fn, correlationId: "trace-123" });
        await api.metrics.list();
        expect(calls[0].init?.headers?.["x-correlation-id"]).toBe("trace-123");
    });

    it("serializes optional query params and skips empties", async () => {
        const { fn, calls } = stubFetch(envelopeOk({ items: [] }));
        const api = createAlloyApiClient({ fetch: fn });
        await api.actions.inventory({ surface: "drawer", entity_type: undefined });
        expect(calls[0].url).toBe("/api/admin/actions/inventory?surface=drawer");
    });
});
