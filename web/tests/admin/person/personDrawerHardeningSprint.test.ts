import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectLinkedPersonIdsFromPersonRecord } from "@/lib/admin/drawer/collectLinkedPersonIdsFromPersonRecord";
import { openPersonDrawerFromHousehold } from "@/lib/admin/drawer/openPersonDrawerFromHousehold";
import { personDrawerOpenSeedFromPersonRecord } from "@/lib/admin/drawer/personDrawerOpenSeedFromPersonRecord";
import { prefetchLinkedPersonsFromPersonRecord } from "@/lib/admin/drawer/prefetchLinkedPersonsFromPersonRecord";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import { personDrawerChildChromeActive } from "@/lib/admin/person/personDrawerChildChrome";
import { personDrawerParentChromeActive } from "@/lib/admin/person/personDrawerParentChrome";
import { resolvePersonDrawerChildPlacementFromRecord } from "@/lib/admin/person/personDrawerChildPlacementContext";
import {
    __clearDrawerEntitySnapshotCacheForTests,
    peekDrawerEntitySnapshot,
} from "@/lib/admin/drawerEntitySnapshotCache";
import {
    __clearPersonDrawerPrefetchInflightForTests,
    prefetchPersonDrawerSnapshot,
} from "@/lib/admin/prefetchPersonDrawerSnapshot";

const root = process.cwd();

function read(rel: string): string {
    return readFileSync(join(root, rel), "utf8");
}

const PARENT_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";

describe("person drawer hardening — linked prefetch and household open", () => {
    afterEach(() => {
        __clearPersonDrawerPrefetchInflightForTests();
        __clearDrawerEntitySnapshotCacheForTests();
        vi.unstubAllGlobals();
    });

    it("collects household-linked person ids from a hydrated parent record", () => {
        const ids = collectLinkedPersonIdsFromPersonRecord({
            id: PARENT_ID,
            _household_child_links: [{ person_id: CHILD_ID, customer_id: "c1" }],
            _household_adult_links: [{ person_id: PARENT_ID, customer_id: "c1" }],
        });
        expect(ids).toEqual([CHILD_ID]);
    });

    it("builds child and parent open seeds from household links", () => {
        const record = {
            id: PARENT_ID,
            _household_child_links: [
                {
                    person_id: CHILD_ID,
                    display_name: "Mia Chen",
                    date_of_birth: "2021-01-02",
                },
            ],
            _household_adult_links: [
                {
                    person_id: PARENT_ID,
                    display_name: "Jordan Chen",
                    email: "j@example.com",
                },
            ],
        };
        expect(personDrawerOpenSeedFromPersonRecord(record, CHILD_ID)?.presentation_emphasis).toBe(
            PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS
        );
        expect(personDrawerOpenSeedFromPersonRecord(record, PARENT_ID)?.presentation_emphasis).toBe(
            PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS
        );
    });

    it("openPersonDrawerFromHousehold stamps child seed for cold cache", () => {
        const opened: unknown[] = [];
        openPersonDrawerFromHousehold({
            openDrawer: (params) => opened.push(params),
            personId: CHILD_ID,
            fromRecord: {
                id: PARENT_ID,
                _household_child_links: [{ person_id: CHILD_ID, display_name: "Mia Chen" }],
            },
        });
        expect(opened[0]).toMatchObject({
            type: "persons",
            id: CHILD_ID,
            source: "person_household_child",
        });
        const cached = peekDrawerEntitySnapshot("persons", CHILD_ID);
        expect(cached?._drawer_presentation_emphasis).toBe(PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS);
    });

    it("prefetchLinkedPersonsFromPersonRecord stamps child open seed before network", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: CHILD_ID, first_name: "Mia" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        prefetchLinkedPersonsFromPersonRecord({
            id: PARENT_ID,
            _household_child_links: [{ person_id: CHILD_ID, display_name: "Mia Chen" }],
        });
        await new Promise((r) => setTimeout(r, 0));

        expect(fetchMock).not.toHaveBeenCalled();
        const cached = peekDrawerEntitySnapshot("persons", CHILD_ID);
        expect(cached?._drawer_presentation_emphasis).toBe(PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS);
        expect(cached?._person_name).toBe("Mia Chen");
    });

    it("prefetchPersonDrawerSnapshot stamps parent emphasis on warm cache", async () => {
        const { putDrawerEntitySnapshot: putSnap } = await import("@/lib/admin/drawerEntitySnapshotCache");
        putSnap("persons", PARENT_ID, { id: PARENT_ID, first_name: "Jordan" });
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: PARENT_ID, first_name: "Jordan" }),
        });
        vi.stubGlobal("fetch", fetchMock);
        prefetchPersonDrawerSnapshot(PARENT_ID, {
            source: "person_drawer_idle",
            openSeed: {
                personId: PARENT_ID,
                first_name: "Jordan",
                presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS,
            },
        });
        await new Promise((r) => setTimeout(r, 0));
        expect(fetchMock).not.toHaveBeenCalled();
        expect(peekDrawerEntitySnapshot("persons", PARENT_ID)?._drawer_presentation_emphasis).toBe(
            PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS
        );
    });
});

describe("person drawer hardening — shell and placement wiring", () => {

    it("child chrome activates from household child open source before hydrate", () => {
        expect(
            personDrawerChildChromeActive(null, {
                open_source: "person_household_child",
            })
        ).toBe(true);
        expect(
            personDrawerParentChromeActive(null, {
                presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS,
            })
        ).toBe(true);
    });

    it("child placement resolves from enrollment mirror only", () => {
        const placement = resolvePersonDrawerChildPlacementFromRecord({
            id: CHILD_ID,
            _enrollment_mirror: [
                {
                    id: "ocm-1",
                    program_label: "Toddler",
                    location_label: "South Campus",
                },
            ],
        });
        expect(placement.program_label).toBe("Toddler");
        expect(placement.location_label).toBe("South Campus");
        expect(placement.source).toBe("enrollment_mirror");
    });

});
