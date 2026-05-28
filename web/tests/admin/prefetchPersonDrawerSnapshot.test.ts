import { afterEach, describe, expect, it, vi } from "vitest";
import {
    __clearPersonDrawerPrefetchInflightForTests,
    prefetchPersonDrawerSnapshot,
} from "@/lib/admin/prefetchPersonDrawerSnapshot";
import { peekDrawerEntitySnapshot, __clearDrawerEntitySnapshotCacheForTests } from "@/lib/admin/drawerEntitySnapshotCache";

describe("prefetchPersonDrawerSnapshot", () => {
    afterEach(() => {
        __clearPersonDrawerPrefetchInflightForTests();
        __clearDrawerEntitySnapshotCacheForTests();
        vi.unstubAllGlobals();
    });

    it("stores person payload in drawer snapshot cache", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: "p1", first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        prefetchPersonDrawerSnapshot("p1");
        await new Promise((r) => setTimeout(r, 0));

        expect(fetchMock).toHaveBeenCalledWith("/api/admin/persons/p1");
        const cached = peekDrawerEntitySnapshot("persons", "p1");
        expect(cached?.first_name).toBe("Ada");
    });
});
