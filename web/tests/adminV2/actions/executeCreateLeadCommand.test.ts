import { afterEach, describe, expect, it, vi } from "vitest";
import { executeCreateLeadCommand } from "@/lib/platform/commands/createLead/executeCreateLeadCommand";
import { CREATE_LEAD_ACTION_ENTITY_ID } from "@/lib/admin/actions/createLeadActionConstants";

/**
 * Command Surface V3, Phase 1 — shared Create Lead execution adapter.
 *
 * Guards that every entry point that uses this adapter executes through the single canonical
 * `POST /api/admin/actions/execute` registered `create_lead` path (no forked mutation), and
 * that the HTTP envelope is normalized into the platform ActionResult contract.
 */

function mockFetchOnce(init: { ok: boolean; status?: number; json: unknown }): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async () => ({
        ok: init.ok,
        status: init.status ?? (init.ok ? 200 : 400),
        json: async () => init.json,
    }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("executeCreateLeadCommand — shared adapter", () => {
    it("POSTs the registered create_lead action to the canonical execute route", async () => {
        const fetchMock = mockFetchOnce({
            ok: true,
            json: { ok: true, correlation_id: "corr-1", data: { execution_result: { opportunity_id: "opp-9" } } },
        });

        await executeCreateLeadCommand({
            payload: { first_name: "Ada", last_name: "Lovelace" },
            departmentId: "dept-1",
            workUnitId: "wu-1",
            surface: "work_unit",
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/admin/actions/execute");
        expect(options.method).toBe("POST");
        const body = JSON.parse(String(options.body));
        expect(body.action_key).toBe("create_lead");
        expect(body.entity_type).toBe("opportunity");
        expect(body.entity_id).toBe(CREATE_LEAD_ACTION_ENTITY_ID);
        expect(body.context).toMatchObject({ surface: "work_unit", department_id: "dept-1", work_unit_id: "wu-1" });
        expect(body.payload).toEqual({ first_name: "Ada", last_name: "Lovelace" });
    });

    it("normalizes a success envelope into ActionResultOk with the created id", async () => {
        mockFetchOnce({
            ok: true,
            json: { ok: true, correlation_id: "corr-2", data: { affected_id: "opp-123", execution_result: { kind: "create_lead" } } },
        });

        const result = await executeCreateLeadCommand({ payload: { first_name: "Ada" } });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.correlationId).toBe("corr-2");
        expect(result.result.actionKey).toBe("create_lead");
        expect(result.result.affectedId).toBe("opp-123");
        expect(result.result.entityId).toBe("opp-123");
    });

    it("prefers affected_id but falls back to execution_result.opportunity_id", async () => {
        mockFetchOnce({
            ok: true,
            json: { ok: true, data: { execution_result: { opportunity_id: "opp-fallback" } } },
        });
        const result = await executeCreateLeadCommand({ payload: {} });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.result.affectedId).toBe("opp-fallback");
    });

    it("returns an ActionResultError with operator copy on a failure envelope", async () => {
        mockFetchOnce({
            ok: false,
            status: 422,
            json: { ok: false, correlation_id: "corr-err", error: { message: "Last name is required." } },
        });
        const result = await executeCreateLeadCommand({ payload: {} });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.status).toBe(422);
        expect(result.correlationId).toBe("corr-err");
        expect(result.error).toBe("Last name is required.");
    });

    it("returns an operator-safe error (no stack trace) when the request cannot reach the server", async () => {
        const fetchMock = vi.fn(async () => {
            throw new Error("network down");
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await executeCreateLeadCommand({ payload: {} });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.status).toBe(0);
        expect(result.error).toMatch(/couldn’t reach the server/i);
        expect(result.error).not.toMatch(/network down/);
    });
});
