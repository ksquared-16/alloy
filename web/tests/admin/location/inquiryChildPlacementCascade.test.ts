import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    applyInquiryChildPlacementFieldChange,
    inquiryChildPlacementRoleForFieldKey,
} from "@/lib/admin/location/inquiryChildPlacementFieldKeys";
import {
    resolveDefaultInquiryChildSiteId,
    resolveProgramsOfferedForSite,
    resolveRoomsForSiteAndProgram,
    type InquiryChildPlacementHierarchyRow,
    type InquiryChildProgramOptionSetItem,
} from "@/lib/admin/location/inquiryChildPlacementOptions";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import { isInquiryChildPlacementProgramFieldDisabled } from "@/lib/admin/drawer/inquiryChildPlacementScope";

const LOCATION_CATEGORIES: LocationProgramCategoryRow[] = [
    {
        id: "cat-infant",
        org_id: "org-1",
        location_id: "site-north",
        key: "infant",
        label: "Infant",
        sort_order: 1,
        is_active: true,
    },
    {
        id: "cat-preschool",
        org_id: "org-1",
        location_id: "site-north",
        key: "preschool",
        label: "Preschool",
        sort_order: 2,
        is_active: true,
    },
];

const PROGRAM_ITEMS: InquiryChildProgramOptionSetItem[] = [
    { item_key: "infant", label: "Infant", sort_order: 1, is_active: true },
    { item_key: "preschool", label: "Preschool", sort_order: 2, is_active: true },
    { item_key: "legacy_program", label: "Legacy", sort_order: 3, is_active: false },
    { item_key: "unknown_key", label: "Unknown", sort_order: 4, is_active: true },
];

function hierarchy(): InquiryChildPlacementHierarchyRow[] {
    return [
        { id: "site-north", label: "North Campus", location_type: "site", parent_location_id: null, is_active: true },
        {
            id: "room-infant-a",
            label: "Infant A",
            location_type: "unit",
            parent_location_id: "site-north",
            is_active: true,
            metadata: { category: "infant" },
        },
        {
            id: "room-infant-b",
            label: "Infant B",
            location_type: "unit",
            parent_location_id: "site-north",
            is_active: true,
            metadata: { category: "infant" },
        },
        {
            id: "room-preschool-1",
            label: "Preschool 1",
            location_type: "unit",
            parent_location_id: "site-north",
            is_active: true,
            metadata: { category: "preschool" },
        },
        {
            id: "room-inactive",
            label: "Closed Room",
            location_type: "unit",
            parent_location_id: "site-north",
            is_active: false,
            metadata: { category: "preschool" },
        },
        {
            id: "room-invalid-category",
            label: "Mystery Room",
            location_type: "unit",
            parent_location_id: "site-north",
            is_active: true,
            metadata: { category: "not_in_option_set" },
        },
        {
            id: "room-legacy",
            label: "Legacy Room",
            location_type: "unit",
            parent_location_id: "site-north",
            is_active: true,
            metadata: { category: "legacy_program" },
        },
    ];
}

describe("inquiryChildPlacementOptions", () => {
    it("location field keys are recognized as placement roles", () => {
        expect(inquiryChildPlacementRoleForFieldKey("location_id")).toBe("location");
        expect(inquiryChildPlacementRoleForFieldKey("child_location_id")).toBe("location");
        expect(inquiryChildPlacementRoleForFieldKey("desired_program_type")).toBe("program");
        expect(inquiryChildPlacementRoleForFieldKey("child_program")).toBe("program");
        expect(inquiryChildPlacementRoleForFieldKey("program_room_cohort_key")).toBe("room");
    });

    it("program is disabled until location is selected", () => {
        expect(isInquiryChildPlacementProgramFieldDisabled(null)).toBe(true);
        expect(isInquiryChildPlacementProgramFieldDisabled("site-north")).toBe(false);
    });

    it("program options derived from active units under selected site", () => {
        const options = resolveProgramsOfferedForSite(hierarchy(), "site-north", PROGRAM_ITEMS);
        expect(options.map((o) => o.value)).toEqual(["infant", "preschool"]);
        expect(options[0]?.label).toBe("Infant");
    });

    it("prefers location_program_categories when provided for site", () => {
        const options = resolveProgramsOfferedForSite(
            hierarchy(),
            "site-north",
            PROGRAM_ITEMS,
            LOCATION_CATEGORIES
        );
        expect(options.map((o) => o.value)).toEqual(["infant", "preschool"]);
        expect(options[0]?.label).toBe("Infant");
    });

    it("duplicate room categories produce one program option", () => {
        const options = resolveProgramsOfferedForSite(hierarchy(), "site-north", PROGRAM_ITEMS);
        const infantCount = options.filter((o) => o.value === "infant").length;
        expect(infantCount).toBe(1);
    });

    it("inactive units excluded from program offerings", () => {
        const options = resolveProgramsOfferedForSite(hierarchy(), "site-north", PROGRAM_ITEMS);
        expect(options.some((o) => o.value === "preschool")).toBe(true);
        expect(options).toHaveLength(2);
    });

    it("invalid program category excluded", () => {
        const options = resolveProgramsOfferedForSite(hierarchy(), "site-north", PROGRAM_ITEMS);
        expect(options.some((o) => o.value === "not_in_option_set")).toBe(false);
        expect(options.some((o) => o.value === "legacy_program")).toBe(false);
    });

    it("room options filtered by selected site", () => {
        const rooms = resolveRoomsForSiteAndProgram(hierarchy(), "site-north");
        expect(rooms.map((o) => o.label)).toEqual([
            "Infant A",
            "Infant B",
            "Legacy Room",
            "Mystery Room",
            "Preschool 1",
        ]);
        expect(rooms.every((o) => o.value.startsWith("room-"))).toBe(true);
        expect(rooms.some((o) => o.label === "Closed Room")).toBe(false);
    });

    it("room options filtered by selected program", () => {
        const infantRooms = resolveRoomsForSiteAndProgram(hierarchy(), "site-north", "infant");
        expect(infantRooms.map((o) => o.label)).toEqual(["Infant A", "Infant B"]);

        const preschoolRooms = resolveRoomsForSiteAndProgram(hierarchy(), "site-north", "preschool");
        expect(preschoolRooms.map((o) => o.label)).toEqual(["Preschool 1"]);
    });

    it("changing location resets program and room", () => {
        const next = applyInquiryChildPlacementFieldChange("location_id", "site-north", {
            location_id: "",
            desired_program_type: "infant",
            program_room_cohort_key: "room-infant-a",
        });
        expect(next.location_id).toBe("site-north");
        expect(next.desired_program_type).toBe("");
        expect(next.program_room_cohort_key).toBe("");
    });

    it("changing program resets room", () => {
        const next = applyInquiryChildPlacementFieldChange("desired_program_type", "preschool", {
            location_id: "site-north",
            desired_program_type: "infant",
            program_room_cohort_key: "room-infant-a",
        });
        expect(next.desired_program_type).toBe("preschool");
        expect(next.program_room_cohort_key).toBe("");
    });

    it("defaults to header site when valid", () => {
        const siteId = resolveDefaultInquiryChildSiteId({
            currentSiteId: "",
            headerSiteId: "site-north",
            siteOptions: [{ value: "site-north", label: "North Campus" }],
        });
        expect(siteId).toBe("site-north");
    });

    it("auto-selects when only one site is available", () => {
        const siteId = resolveDefaultInquiryChildSiteId({
            currentSiteId: "",
            headerSiteId: null,
            siteOptions: [{ value: "site-north", label: "North Campus" }],
        });
        expect(siteId).toBe("site-north");
    });
});

describe("inquiry child placement UI wiring", () => {
    it("ConfiguredCreateFormFields renders placement fields as selects", () => {
        const src = readFileSync(
            resolve(__dirname, "../../../components/admin/opportunity/actions/ConfiguredCreateFormFields.tsx"),
            "utf8",
        );
        expect(src).toContain("inquiryChildPlacementRoleForFieldKey");
        expect(src).toContain("SelectFieldControl");
        expect(src).toContain("Select a school first");
    });

    it("schedule select still uses option set binding", () => {
        const src = readFileSync(
            resolve(__dirname, "../../../components/admin/opportunity/actions/ConfiguredCreateFormFields.tsx"),
            "utf8",
        );
        expect(src).toContain("isConfiguredOptionSetSelectField");
        expect(src).toContain("optionsBySetKey");
    });

    it("create lead gather includes placement cascade fields", () => {
        const src = readFileSync(
            resolve(__dirname, "../../../lib/admin/actions/createLeadPlatformGather.ts"),
            "utf8",
        );
        expect(src).toContain('payload_key: "location_id"');
        expect(src).toContain('placement_select: "site"');
        expect(src).toContain('placement_select: "site_program"');
        expect(src).toContain('option_set_key: "childcare_schedule_type"');
    });

    it("OpportunityInquiryChildrenSection uses site-scoped program cascade", () => {
        const src = readFileSync(
            resolve(__dirname, "../../../components/admin/entity/OpportunityInquiryChildrenSection.tsx"),
            "utf8",
        );
        expect(src).toContain("resolveProgramsOfferedForSite");
        expect(src).toContain("applyInquiryChildPlacementFieldChange");
        expect(src).toContain("applyOcmPlacementCascade");
        expect(src).toContain("rowProgramOptions");
        expect(src).not.toMatch(/rowProgramOptions\.map\([\s\S]*programItems/);
        expect(src).toMatch(/rowProgramOptions\.map\(\(i\) =>/);
        expect(src).toContain("buildInquiryChildRoomOptionsForSite");
        expect(src).toContain("resolveProgramKeyForRoomCascade");
    });
});
