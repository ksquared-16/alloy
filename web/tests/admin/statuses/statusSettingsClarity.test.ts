import { describe, expect, it } from "vitest";
import {
    buildDrawerStatusSettingsHref,
    buildStatusSettingsHref,
    filterPersonStatusRowsForSettingsProfile,
    personStatusDrawerPreviewNotes,
    personStatusMissingApplicabilityMetadata,
    STATUS_SETTINGS_SECTION_DESCRIPTIONS,
    statusDrawerSourceTagsForEntityType,
    statusDrawerSourceTagsForPersonRow,
} from "@/lib/admin/statusSettingsClarity";
import {
    PERSON_STATUS_PROFILE_CHILD_LIFECYCLE,
    PERSON_STATUS_PROFILE_GENERIC,
} from "@/lib/admin/person/personStatusApplicability";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("statusSettingsClarity", () => {
    it("defines section descriptions for drawer-critical entity types", () => {
        expect(STATUS_SETTINGS_SECTION_DESCRIPTIONS.opportunities).toContain("Lead/Opportunity drawer");
        expect(STATUS_SETTINGS_SECTION_DESCRIPTIONS.persons).toContain("Person and Child drawer");
        expect(STATUS_SETTINGS_SECTION_DESCRIPTIONS.opportunity_customer_members).toContain(
            "enrollment"
        );
        expect(STATUS_SETTINGS_SECTION_DESCRIPTIONS.customer_members).toContain(
            "not the same as the Child drawer"
        );
    });

    it("maps entity types to drawer source tags", () => {
        expect(statusDrawerSourceTagsForEntityType("opportunities")).toContain("lead_drawer");
        expect(statusDrawerSourceTagsForEntityType("persons")).toEqual([
            "person_drawer",
            "child_drawer",
        ]);
        expect(statusDrawerSourceTagsForEntityType("opportunity_customer_members")).toContain(
            "enrollment_pipeline"
        );
        expect(statusDrawerSourceTagsForOcmNotPersonDrawer()).toBe(true);
    });

    it("filters People rows for person_generic and child_lifecycle profiles", () => {
        const rows = [
            {
                status_key: "active",
                metadata: { applies_to_profiles: ["person_generic", "child_lifecycle"] },
                is_active: true,
            },
            {
                status_key: "withdrawn",
                metadata: { applies_to_profiles: ["child_lifecycle"] },
                is_active: true,
            },
            {
                status_key: "legacy_parent",
                metadata: { applies_to_profiles: ["person_generic"] },
                is_active: true,
            },
        ];
        const generic = filterPersonStatusRowsForSettingsProfile(rows, PERSON_STATUS_PROFILE_GENERIC);
        expect(generic.map((r) => r.status_key).sort()).toEqual(["active", "legacy_parent"]);
        const child = filterPersonStatusRowsForSettingsProfile(rows, PERSON_STATUS_PROFILE_CHILD_LIFECYCLE);
        expect(child.map((r) => r.status_key).sort()).toEqual(["active", "withdrawn"]);
    });

    it("person drawer preview notes distinguish person vs child vs hidden", () => {
        expect(
            personStatusDrawerPreviewNotes({
                status_key: "active",
                metadata: { applies_to_profiles: [PERSON_STATUS_PROFILE_GENERIC] },
                is_active: true,
            })
        ).toEqual(["Shown in Person drawer"]);
        expect(
            personStatusDrawerPreviewNotes({
                status_key: "withdrawn",
                metadata: { applies_to_profiles: [PERSON_STATUS_PROFILE_CHILD_LIFECYCLE] },
                is_active: true,
            })
        ).toEqual(["Shown in Child drawer"]);
        expect(
            personStatusDrawerPreviewNotes({
                status_key: "inactive",
                is_active: false,
            })
        ).toEqual(["Hidden from drawer dropdowns"]);
    });

    it("builds drawer configure links with profile query params", () => {
        expect(buildStatusSettingsHref({ entityType: "opportunities" })).toBe(
            "/admin/settings/statuses?entity_type=opportunities"
        );
        expect(
            buildDrawerStatusSettingsHref({
                entityKind: "persons",
                statusProfile: PERSON_STATUS_PROFILE_CHILD_LIFECYCLE,
            })
        ).toContain("entity_type=persons");
        expect(
            buildDrawerStatusSettingsHref({
                entityKind: "persons",
                statusProfile: PERSON_STATUS_PROFILE_CHILD_LIFECYCLE,
            })
        ).toContain("profile=child_lifecycle");
    });

    it("detects missing applies_to_profiles metadata", () => {
        expect(personStatusMissingApplicabilityMetadata(null)).toBe(true);
        expect(personStatusMissingApplicabilityMetadata({})).toBe(true);
        expect(
            personStatusMissingApplicabilityMetadata({
                applies_to_profiles: [PERSON_STATUS_PROFILE_GENERIC],
            })
        ).toBe(false);
    });

    it("StatusesClient renders section descriptions and profile chips", () => {
        const src = readFileSync(
            join(process.cwd(), "app/legacy-admin/system/statuses/StatusesClient.tsx"),
            "utf8"
        );
        expect(src).toContain("STATUS_SETTINGS_SECTION_DESCRIPTIONS");
        expect(src).toContain("data-status-settings-section-description");
        expect(src).toContain("data-status-settings-person-profile-chips");
        expect(src).toContain("StatusSettingsInventoryPanel");
        expect(src).toContain("personStatusDrawerPreviewNotes");
    });

    it("Opportunity Sub Statuses are not tagged as child drawer header statuses", () => {
        const tags = statusDrawerSourceTagsForPersonRow({
            status_key: "tour_scheduled",
            metadata: { applies_to_profiles: [PERSON_STATUS_PROFILE_CHILD_LIFECYCLE] },
            is_active: true,
        });
        expect(tags).not.toContain("enrollment_pipeline");
        expect(statusDrawerSourceTagsForEntityType("opportunity_customer_members")).not.toContain(
            "child_drawer"
        );
    });

    it("drawer status menu uses Alloy presentation (not native select)", () => {
        const select = readFileSync(
            join(process.cwd(), "components/admin/vmDrawer/VmDrawerHeaderStatusSelect.tsx"),
            "utf8"
        );
        expect(select).toContain('role="menu"');
        expect(select).toContain("rounded-xl");
        expect(select).not.toContain("<select");
        expect(select).not.toContain("data-drawer-status-settings-link");
        expect(select).not.toContain("Configure statuses");
    });
});

function statusDrawerSourceTagsForOcmNotPersonDrawer(): boolean {
    const ocm = statusDrawerSourceTagsForEntityType("opportunity_customer_members");
    return !ocm.includes("person_drawer") && !ocm.includes("child_drawer");
}
