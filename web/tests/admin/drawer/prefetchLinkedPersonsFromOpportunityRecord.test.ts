import { afterEach, describe, expect, it, vi } from "vitest";
import { prefetchLinkedPersonsFromOpportunityRecord } from "@/lib/admin/drawer/prefetchLinkedPersonsFromOpportunityRecord";
import {
    __clearPersonDrawerPrefetchInflightForTests,
    __getPersonDrawerPrefetchInflightForTests,
} from "@/lib/admin/prefetchPersonDrawerSnapshot";
import { peekDrawerEntitySnapshot, __clearDrawerEntitySnapshotCacheForTests } from "@/lib/admin/drawerEntitySnapshotCache";

const PRIMARY = "11111111-1111-4111-8111-111111111111";
const LINKED = "22222222-2222-4222-8222-222222222222";

describe("prefetchLinkedPersonsFromOpportunityRecord", () => {
    afterEach(() => {
        __clearPersonDrawerPrefetchInflightForTests();
        __clearDrawerEntitySnapshotCacheForTests();
        vi.unstubAllGlobals();
    });

    it("prefetches each linked person entity id", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) =>
            Promise.resolve({
                ok: true,
                json: async () => {
                    const id = url.split("/").pop();
                    return { id, first_name: "Test" };
                },
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const ids = prefetchLinkedPersonsFromOpportunityRecord(
            {
                primary_person_id: PRIMARY,
                _opportunity_persons: [{ id: "r1", person_id: LINKED }],
            },
            { source: "opportunity_drawer_idle" }
        );

        expect(ids.sort()).toEqual([LINKED, PRIMARY].sort());
        await Promise.all([...__getPersonDrawerPrefetchInflightForTests().values()]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(peekDrawerEntitySnapshot("persons", PRIMARY)?.first_name).toBe("Test");
        expect(peekDrawerEntitySnapshot("persons", LINKED)?.first_name).toBe("Test");
    });

    it("prefetches inquiry child person ids", async () => {
        const CHILD = "33333333-3333-4333-8333-333333333333";
        const fetchMock = vi.fn().mockImplementation((url: string) =>
            Promise.resolve({
                ok: true,
                json: async () => {
                    const id = url.split("/").pop();
                    return { id, first_name: "Sophia" };
                },
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const ids = prefetchLinkedPersonsFromOpportunityRecord(
            {
                _inquiry_children: [{ person_id: CHILD, first_name: "Sophia" }],
            },
            { source: "opportunity_drawer_idle" }
        );

        expect(ids).toEqual([CHILD]);
        await Promise.all([...__getPersonDrawerPrefetchInflightForTests().values()]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(peekDrawerEntitySnapshot("persons", CHILD)?.first_name).toBe("Sophia");
    });
});
