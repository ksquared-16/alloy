import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInquiryChildPersonOpenSeed } from "@/lib/admin/drawer/inquiryChildPersonOpen";
import { openPersonDrawerFromHousehold } from "@/lib/admin/drawer/openPersonDrawerFromHousehold";
import {
    buildPersonDrawerSeedRecord,
    personDrawerSeedFromInquiryChildRow,
    resolvePersonDrawerTransitionSnapshot,
} from "@/lib/admin/drawer/personDrawerOpenSeed";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import {
    __clearDrawerEntitySnapshotCacheForTests,
    peekDrawerEntitySnapshot,
    putDrawerEntitySnapshot,
} from "@/lib/admin/drawerEntitySnapshotCache";

const root = process.cwd();

function read(rel: string): string {
    return readFileSync(join(root, rel), "utf8");
}

const PARENT_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";

describe("person drawer hardening phase 3", () => {

    it("inquiry child open seed carries OCM placement hints for header pills", () => {
        const seed = buildInquiryChildPersonOpenSeed(
            { id: "opp-1", name: "Chen lead" },
            {
                person_id: CHILD_ID,
                desired_program_label: "Toddler",
                location_label: "North Campus",
                outcome_status_label: "Waitlisted",
            },
            CHILD_ID
        );
        expect(seed.presentation_emphasis).toBe(PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS);
        expect(seed.program_label).toBe("Toddler");
        expect(seed.location_label).toBe("North Campus");
        expect(seed.opportunity_id).toBe("opp-1");

        const record = buildPersonDrawerSeedRecord(seed);
        const mirror = record._enrollment_mirror as { program_label?: string; location_label?: string }[];
        expect(mirror?.[0]?.program_label).toBe("Toddler");
        expect(mirror?.[0]?.location_label).toBe("North Campus");
    });

    it("child to parent household open stamps parent seed before drawer swap", () => {
        __clearDrawerEntitySnapshotCacheForTests();
        const opened: unknown[] = [];
        openPersonDrawerFromHousehold({
            openDrawer: (params) => opened.push(params),
            personId: PARENT_ID,
            fromRecord: {
                id: CHILD_ID,
                _household_adult_links: [
                    {
                        person_id: PARENT_ID,
                        display_name: "Jordan Chen",
                        email: "j@example.com",
                    },
                ],
            },
        });
        expect(opened[0]).toMatchObject({
            type: "persons",
            id: PARENT_ID,
            personDrawerOpenSeed: {
                presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS,
            },
        });
        expect(peekDrawerEntitySnapshot("persons", PARENT_ID)?._drawer_presentation_emphasis).toBe(
            PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS
        );
    });

    it("person to person transition resolver prefers typed parent seed over stale child cache", () => {
        __clearDrawerEntitySnapshotCacheForTests();
        putDrawerEntitySnapshot("persons", PARENT_ID, {
            id: PARENT_ID,
            first_name: "Jordan",
            _drawer_presentation_emphasis: PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS,
        });

        const transitioned = resolvePersonDrawerTransitionSnapshot({
            personId: PARENT_ID,
            openSeed: {
                personId: PARENT_ID,
                first_name: "Jordan",
                presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS,
            },
            fromPersonRecord: {
                id: CHILD_ID,
                _household_adult_links: [{ person_id: PARENT_ID, display_name: "Jordan Chen" }],
            },
        });

        expect(transitioned?._drawer_presentation_emphasis).toBe(
            PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS
        );
    });

    it("compact employee status renders checkbox and id inline", () => {
        const placement = read("components/admin/entity/PersonEmployeePlacementSection.tsx");
        expect(placement).toContain("flex flex-wrap items-end gap-3");
        expect(placement).toContain("deferSave");
    });

    it("personDrawerSeedFromInquiryChildRow maps inquiry placement labels", () => {
        const seed = personDrawerSeedFromInquiryChildRow(
            {
                desired_program_label: "Infant",
                location_label: "West",
                outcome_status_label: "Active",
            },
            CHILD_ID
        );
        expect(seed.program_label).toBe("Infant");
        expect(seed.location_label).toBe("West");
        expect(seed.placement_status_label).toBe("Active");
    });
});
