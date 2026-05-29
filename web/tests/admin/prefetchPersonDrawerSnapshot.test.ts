import { afterEach, describe, expect, it, vi } from "vitest";
import {
    __clearPersonDrawerPrefetchInflightForTests,
    prefetchPersonDrawerSnapshot,
} from "@/lib/admin/prefetchPersonDrawerSnapshot";
import { peekDrawerEntitySnapshot, putDrawerEntitySnapshot, __clearDrawerEntitySnapshotCacheForTests } from "@/lib/admin/drawerEntitySnapshotCache";

describe("prefetchPersonDrawerSnapshot", () => {
    afterEach(() => {
        __clearPersonDrawerPrefetchInflightForTests();
        __clearDrawerEntitySnapshotCacheForTests();
        vi.unstubAllGlobals();
    });

    it("stores valid persons snapshot with matching id", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: "p1", first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        prefetchPersonDrawerSnapshot("p1", { source: "opportunity_drawer_idle" });
        await new Promise((r) => setTimeout(r, 0));

        expect(fetchMock).toHaveBeenCalledWith("/api/admin/entity/persons/p1");
        const cached = peekDrawerEntitySnapshot("persons", "p1");
        expect(cached?.first_name).toBe("Ada");
    });

    it("dedupes repeated prefetches for the same person id", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: "p1", first_name: "Ada" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        prefetchPersonDrawerSnapshot("p1");
        prefetchPersonDrawerSnapshot("p1");
        await new Promise((r) => setTimeout(r, 0));

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("skips network when snapshot is already warm", async () => {
        putDrawerEntitySnapshot("persons", "p1", { id: "p1", first_name: "Warm" });
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        prefetchPersonDrawerSnapshot("p1", { source: "hover" });
        await new Promise((r) => setTimeout(r, 0));

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not cache person snapshot when response id mismatches", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: "other", first_name: "Wrong" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        prefetchPersonDrawerSnapshot("p1");
        await new Promise((r) => setTimeout(r, 0));

        expect(peekDrawerEntitySnapshot("persons", "p1")).toBeNull();
    });
});
