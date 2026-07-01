import { describe, it, expect, vi, afterEach } from "vitest";

import { createAlloyApiClient, AlloyApiError } from "@/lib/api/alloyApiClient";
import type { CustomerPersonRoleType } from "@/app/api/admin/customer-person-role-types/route";

/**
 * Phase 3C — first app-consumer migration proof.
 *
 * `CustomerPersonRolesClient.tsx` was migrated from hand-written fetch/unwrap to the generated
 * internal client (`createAlloyApiClient().referenceData.customerPersonRoleTypes`). These tests
 * exercise the exact client path the consumer uses — a no-arg client over the global `fetch`
 * (which is what the component constructs) — and assert the data + error behavior the UI relies
 * on stays stable.
 *
 * @see docs/api/internal-typescript-client.md
 */

type StubResponse = {
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };
    json(): Promise<unknown>;
};

function response(body: unknown, status: number, correlationId: string): StubResponse {
    return {
        ok: status >= 200 && status < 400,
        status,
        headers: { get: (n: string) => (n.toLowerCase() === "x-correlation-id" ? correlationId : null) },
        json: async () => body,
    };
}

function stubGlobalFetch(handler: (url: string, init?: RequestInit) => StubResponse) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return handler(url, init);
    });
    vi.stubGlobal("fetch", fn);
    return { fn, calls };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("CustomerPersonRolesClient migration — list (GET)", () => {
    it("unwraps data.items into typed rows and honors the showAll flag", async () => {
        const row: CustomerPersonRoleType = {
            id: "r1",
            org_id: "org1",
            key: "primary_contact",
            label: "Primary Contact",
            description: null,
            sort_order: 100,
            is_system: true,
            is_active: true,
            metadata: null,
            industry_id: null,
            vertical_id: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: null,
        };
        const { calls } = stubGlobalFetch(() =>
            response({ ok: true, data: { items: [row] }, correlation_id: "cid-list" }, 200, "cid-list")
        );

        const api = createAlloyApiClient();
        // The consumer passes `{ all: "true" }` only when "Show all" is checked.
        const items = await api.referenceData.customerPersonRoleTypes.list<CustomerPersonRoleType>({ all: "true" });

        // Compile-time protection: the generic return type is CustomerPersonRoleType[].
        const first: CustomerPersonRoleType = items[0];
        expect(first.key).toBe("primary_contact");
        expect(first.is_system).toBe(true);
        expect(calls[0].url).toBe("/api/admin/customer-person-role-types?all=true");
    });

    it("omits the all param when showAll is off", async () => {
        const { calls } = stubGlobalFetch(() =>
            response({ ok: true, data: { items: [] }, correlation_id: "cid" }, 200, "cid")
        );
        const api = createAlloyApiClient();
        await api.referenceData.customerPersonRoleTypes.list<CustomerPersonRoleType>(undefined);
        expect(calls[0].url).toBe("/api/admin/customer-person-role-types");
    });

    it("throws AlloyApiError on failure, preserving the UI-facing message and correlation id", async () => {
        stubGlobalFetch(() =>
            response(
                { ok: false, error: { code: "INTERNAL", message: "Boom from server" }, correlation_id: "cid-500" },
                500,
                "cid-500"
            )
        );
        const api = createAlloyApiClient();
        try {
            await api.referenceData.customerPersonRoleTypes.list<CustomerPersonRoleType>();
            expect.unreachable("should have thrown");
        } catch (e) {
            expect(e).toBeInstanceOf(AlloyApiError);
            const err = e as AlloyApiError;
            // The consumer surfaces `e.message` into `setError(...)` — assert it's the server message.
            expect(err.message).toBe("Boom from server");
            expect(err.status).toBe(500);
            expect(err.correlationId).toBe("cid-500");
        }
    });
});

describe("CustomerPersonRolesClient migration — create (POST)", () => {
    it("maps a 409 conflict to the inline field error the modal shows", async () => {
        stubGlobalFetch(() =>
            response(
                {
                    ok: false,
                    error: { code: "CONFLICT", message: "A role type with this key already exists for this org" },
                    correlation_id: "cid-409",
                },
                409,
                "cid-409"
            )
        );
        const api = createAlloyApiClient();

        // Mirror the consumer's catch mapping for the conflict path.
        let modalError: string | null = null;
        try {
            await api.referenceData.customerPersonRoleTypes.create({
                key: "primary_contact",
                label: "Primary Contact",
                sort_order: 100,
                is_active: true,
            });
        } catch (e) {
            if (e instanceof AlloyApiError && e.status === 409) {
                modalError = e.message || "Key already exists.";
            }
        }
        expect(modalError).toBe("A role type with this key already exists for this org");
    });

    it("falls back to the stable conflict copy when the server omits a message", async () => {
        stubGlobalFetch(() =>
            response({ ok: false, error: { code: "CONFLICT", message: "" }, correlation_id: "c" }, 409, "c")
        );
        const api = createAlloyApiClient();
        let modalError: string | null = null;
        try {
            await api.referenceData.customerPersonRoleTypes.create({ key: "k", label: "L" });
        } catch (e) {
            if (e instanceof AlloyApiError && e.status === 409) modalError = e.message || "Key already exists.";
        }
        expect(modalError).toBe("Key already exists.");
    });

    it("rejects an invalid create payload at compile time", async () => {
        const { calls } = stubGlobalFetch(() =>
            response({ ok: true, data: { item: {} }, correlation_id: "c" }, 200, "c")
        );
        const api = createAlloyApiClient();
        await api.referenceData.customerPersonRoleTypes.create({
            // @ts-expect-error — `key` (required string) cannot be a number; proves the typed payload guard.
            key: 123,
            label: "L",
        });
        expect(calls).toHaveLength(1);
    });
});
