import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectLinkedPersonIdsFromOpportunityRecord } from "@/lib/admin/drawer/collectLinkedPersonIdsFromOpportunityRecord";
import {
    applyPersonDrawerOpenSeed,
    personDrawerSeedFromOpportunityRecord,
} from "@/lib/admin/drawer/personDrawerOpenSeed";
import { openViewPersonFromOpportunity } from "@/lib/admin/drawer/openViewPersonFromOpportunity";
import { isPersonDrawerSnapshotWarm } from "@/lib/admin/prefetchPersonDrawerSnapshot";
import {
    putDrawerEntitySnapshot,
    __clearDrawerEntitySnapshotCacheForTests,
} from "@/lib/admin/drawerEntitySnapshotCache";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { primaryHouseholdLabel, resolveChildLifecycleSlotStates } from "@/lib/admin/person/personDrawerChildLifecycleSlots";
import { applyPersonDrawerPresentationProfile } from "@/lib/admin/person/personDrawerPresentationProfile";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";
import type { PersonDrawerProfileResult } from "@/lib/admin/person/personDrawerVisibilityTypes";
import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";

const CHILD_ID = "22222222-2222-4222-8222-222222222222";
const OPP_ID = "33333333-3333-4333-8333-333333333333";

const childProfile: PersonDrawerProfileResult = {
    profiles: ["child"],
    display: "child",
    badgeLabels: ["Child"],
};

const childRecord = {
    id: CHILD_ID,
    first_name: "Sophia",
    last_name: "Chen",
    date_of_birth: "2021-03-15",
    gender: "Female",
    _household_context: [{ customer_name: "Chen Family" }],
    _enrollment_mirror: [
        {
            id: "ocm-1",
            opportunity_id: OPP_ID,
            opportunity_name: "Family inquiry — Chen",
            opportunity_status_label: "Family inquiry",
            program_label: "Preschool",
            location_label: "North Campus",
        },
    ],
    _enrollment_opportunities: [],
};

describe("opportunity-linked child preload", () => {
    it("collects inquiry child person ids for background prefetch", () => {
        const ids = collectLinkedPersonIdsFromOpportunityRecord({
            primary_person_id: "parent-1",
            _inquiry_children: [{ person_id: CHILD_ID, first_name: "Sophia", last_name: "Chen" }],
        });
        expect(ids).toContain(CHILD_ID);
    });

    it("openViewPersonFromOpportunity uses cached payload when warm", () => {
        __clearDrawerEntitySnapshotCacheForTests();
        putDrawerEntitySnapshot("persons", CHILD_ID, { ...childRecord });

        const opened: unknown[] = [];
        openViewPersonFromOpportunity({
            openDrawer: (params) => opened.push(params),
            personId: CHILD_ID,
            opportunityId: OPP_ID,
            source: "opportunity_inquiry_child",
        });

        expect(isPersonDrawerSnapshotWarm(CHILD_ID)).toBe(true);
        expect(opened[0]).toMatchObject({
            type: "persons",
            id: CHILD_ID,
            source: "opportunity_inquiry_child",
        });
    });

    it("seeds child lifecycle emphasis from inquiry child row when cache cold", () => {
        __clearDrawerEntitySnapshotCacheForTests();
        const seed = personDrawerSeedFromOpportunityRecord(
            {
                _inquiry_children: [
                    {
                        person_id: CHILD_ID,
                        first_name: "Sophia",
                        last_name: "Chen",
                        dob: "2021-03-15",
                    },
                ],
            },
            CHILD_ID
        );
        expect(seed?.presentation_emphasis).toBe(PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS);
        expect(seed?.date_of_birth).toBe("2021-03-15");

        const record = applyPersonDrawerOpenSeed(CHILD_ID, seed);
        expect(record?._drawer_presentation_emphasis).toBe(PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS);
    });
});

describe("child drawer chrome — no generic person sections", () => {
    it("hides Profile, Basic, Contact, and Employee sections for child profile", () => {
        const sections: EntityDrawerSectionConfig[] = [
            { key: "profile", title: "Profile", fields: [{ key: "notes", label: "Notes", span: 1 }] },
            { key: "basic", title: "Basic", fields: [{ key: "preferred_name", label: "Preferred name", span: 1 }] },
            { key: "basic_info", title: "Child details", fields: [{ key: "allergies", label: "Allergies", span: 1 }] },
            { key: "contact_info", title: "Contact", fields: [{ key: "email", label: "Email", span: 1 }] },
            { key: "employee_placement", title: "Employee", fields: [] },
            { key: "relationships", title: "Relationships", fields: [] },
        ];
        const out = applyPersonDrawerPresentationProfile(sections, childProfile);
        expect(out.map((s) => s.key)).toEqual(["basic_info", "relationships"]);
    });

});

describe("child header and summary model", () => {
    it("includes status, age, DOB context, gender, program, and location when present", () => {
        const summary = resolvePersonDrawerChildSummaryModel(childRecord);
        expect(summary.display_name).toBe("Sophia Chen");
        expect(summary.age_label).toBeTruthy();
        expect(summary.dob_label).toBeTruthy();
        expect(summary.gender_label).toBe("Female");
        expect(summary.program_label).toBe("Preschool");
        expect(summary.location_label).toBe("North Campus");
        expect(summary.status_label).toBe("Family Lead");
    });

    it("child title row shows name with Child and age pills inline", () => {
        const src = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerChildTitleRow.tsx"),
            "utf8"
        );
        expect(src).toContain("data-person-drawer-child-title-row");
        expect(src).toContain("Child");
        expect(src).toContain("personDrawerChildAgeLabel");
    });

    it("gender field migration seeds configurable person select", () => {
        const src = readFileSync(
            join(process.cwd(), "../supabase/migrations/20260529220000_person_gender_field_definition.sql"),
            "utf8"
        );
        expect(src).toContain("'gender'");
        expect(src).toContain("person_gender");
        expect(src).toContain("'child_profile'");
    });
});

describe("family consolidation", () => {
    it("resolves household label for family section", () => {
        expect(primaryHouseholdLabel(childRecord)).toBe("Chen Family");
    });

});

describe("child module nav — below tabs, no enrollment pipeline", () => {
    it("labels history slot as Activity in slot registry", () => {
        const slots = resolveChildLifecycleSlotStates(childRecord);
        expect(slots.find((s) => s.key === "history")?.label).toBe("Activity");
    });

});
