import { describe, expect, it, vi, beforeEach } from "vitest";

import { openViewPersonFromOpportunity } from "@/lib/admin/drawer/openViewPersonFromOpportunity";
import {
    __clearPersonDrawerPrefetchInflightForTests,
} from "@/lib/admin/prefetchPersonDrawerSnapshot";
import { putDrawerEntitySnapshot, __clearDrawerEntitySnapshotCacheForTests } from "@/lib/admin/drawerEntitySnapshotCache";

const PERSON_ID = "11111111-1111-4111-8111-111111111111";
const OPP_ID = "22222222-2222-4222-8222-222222222222";

describe("openViewPersonFromOpportunity", () => {
    beforeEach(() => {
        __clearPersonDrawerPrefetchInflightForTests();
        __clearDrawerEntitySnapshotCacheForTests();
        vi.restoreAllMocks();
    });

    it("opens person drawer with explicit id, source, and parent opportunity", () => {
        const openDrawer = vi.fn();
        const fetchMock = vi.fn().mockRejectedValue(new Error("prefetch failed"));
        vi.stubGlobal("fetch", fetchMock);

        const opened = openViewPersonFromOpportunity({
            openDrawer,
            personId: PERSON_ID,
            opportunityId: OPP_ID,
        });

        expect(opened).toBe(true);
        expect(openDrawer).toHaveBeenCalledTimes(1);
        expect(openDrawer).toHaveBeenCalledWith({
            type: "persons",
            id: PERSON_ID,
            source: "opportunity_primary_contact",
            parent: { type: "opportunities", id: OPP_ID },
            personDrawerOpenSeed: null,
        });
    });

    it("seeds person snapshot from openSeed before drawer open when cache is cold", () => {
        const openDrawer = vi.fn();
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

        openViewPersonFromOpportunity({
            openDrawer,
            personId: PERSON_ID,
            opportunityId: OPP_ID,
            openSeed: {
                personId: PERSON_ID,
                first_name: "Jane",
                last_name: "Doe",
                email: "jane@example.com",
            },
        });

        expect(openDrawer).toHaveBeenCalledWith(
            expect.objectContaining({
                personDrawerOpenSeed: expect.objectContaining({
                    personId: PERSON_ID,
                    first_name: "Jane",
                }),
            })
        );
    });

    it("uses warm cache without click-time prefetch fetch", () => {
        putDrawerEntitySnapshot("persons", PERSON_ID, {
            id: PERSON_ID,
            first_name: "Jordan",
        });
        const openDrawer = vi.fn();
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        openViewPersonFromOpportunity({
            openDrawer,
            personId: PERSON_ID,
            opportunityId: OPP_ID,
        });

        expect(openDrawer).toHaveBeenCalledWith(
            expect.objectContaining({ type: "persons", id: PERSON_ID })
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not block open when prefetch fails", () => {
        const openDrawer = vi.fn();
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

        openViewPersonFromOpportunity({
            openDrawer,
            personId: PERSON_ID,
            opportunityId: OPP_ID,
        });

        expect(openDrawer).toHaveBeenCalledWith(
            expect.objectContaining({ type: "persons", id: PERSON_ID })
        );
    });

    it("returns false when person id is missing", () => {
        const openDrawer = vi.fn();
        expect(
            openViewPersonFromOpportunity({
                openDrawer,
                personId: "",
                opportunityId: OPP_ID,
            })
        ).toBe(false);
        expect(openDrawer).not.toHaveBeenCalled();
    });
});
