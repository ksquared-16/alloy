import { afterEach, describe, expect, it, vi } from "vitest";
import { peekDrawerEntitySnapshot, putDrawerEntitySnapshot, __clearDrawerEntitySnapshotCacheForTests } from "@/lib/admin/drawerEntitySnapshotCache";

const { dedupeAdminFetch } = vi.hoisted(() => ({
    dedupeAdminFetch: vi.fn(),
}));

vi.mock("@/lib/workspace/workspaceAdminFetchDedupe", () => ({
    dedupeAdminFetch,
}));

import {
    __clearPersonDrawerPrefetchInflightForTests,
    fetchPersonDrawerEntityCoalesced,
    prefetchPersonDrawerSnapshot,
} from "@/lib/admin/prefetchPersonDrawerSnapshot";

describe("prefetchPersonDrawerSnapshot", () => {
    afterEach(() => {
        __clearPersonDrawerPrefetchInflightForTests();
        __clearDrawerEntitySnapshotCacheForTests();
        dedupeAdminFetch.mockReset();
        vi.unstubAllGlobals();
    });

    it("stores valid persons snapshot with matching id", async () => {
        // Phase 2D contract: entity reads return { ok, data: { entity }, correlation_id }.
        dedupeAdminFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                ok: true,
                data: { entity: { id: "p1", first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" } },
                correlation_id: "cid-1",
            }),
        });

        prefetchPersonDrawerSnapshot("p1", { source: "opportunity_drawer_idle" });
        await new Promise((r) => setTimeout(r, 0));

        expect(dedupeAdminFetch).toHaveBeenCalledWith(
            "/api/admin/entity/persons/p1",
            expect.anything()
        );
        const cached = peekDrawerEntitySnapshot("persons", "p1");
        expect(cached?.first_name).toBe("Ada");
    });

    it("dedupes repeated prefetches for the same person id", async () => {
        dedupeAdminFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, data: { entity: { id: "p1", first_name: "Ada" } }, correlation_id: "cid-1" }),
        });

        prefetchPersonDrawerSnapshot("p1");
        prefetchPersonDrawerSnapshot("p1");
        await new Promise((r) => setTimeout(r, 0));

        expect(dedupeAdminFetch).toHaveBeenCalledTimes(1);
    });

    it("fetchPersonDrawerEntityCoalesced joins in-flight prefetch", async () => {
        dedupeAdminFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, data: { entity: { id: "p1", first_name: "Coalesced" } }, correlation_id: "cid-1" }),
        });

        prefetchPersonDrawerSnapshot("p1");
        const result = await fetchPersonDrawerEntityCoalesced("p1");

        expect(dedupeAdminFetch).toHaveBeenCalledTimes(1);
        expect(result?.first_name).toBe("Coalesced");
    });

    it("skips network when snapshot is already warm", async () => {
        putDrawerEntitySnapshot("persons", "p1", { id: "p1", first_name: "Warm" });

        prefetchPersonDrawerSnapshot("p1", { source: "hover" });
        await new Promise((r) => setTimeout(r, 0));

        expect(dedupeAdminFetch).not.toHaveBeenCalled();
    });

    it("does not cache person snapshot when response id mismatches", async () => {
        dedupeAdminFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, data: { entity: { id: "other", first_name: "Wrong" } }, correlation_id: "cid-1" }),
        });

        prefetchPersonDrawerSnapshot("p1");
        await new Promise((r) => setTimeout(r, 0));

        expect(peekDrawerEntitySnapshot("persons", "p1")).toBeNull();
    });
});
