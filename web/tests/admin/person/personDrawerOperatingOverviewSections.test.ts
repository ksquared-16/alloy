import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    isPersonDrawerChildSuppressedOverviewSection,
    isPersonDrawerParentSuppressedOverviewSection,
    personDrawerChildOperatingOverviewSections,
    personDrawerParentOperatingOverviewSections,
} from "@/lib/admin/person/personDrawerOperatingOverviewSections";

describe("personDrawerOperatingOverviewSections", () => {
    it("suppresses parent Profile, Contact, Record Info, and Basic by key and title", () => {
        const sections = [
            { key: "basic_info", title: "Profile", fields: [{ key: "first_name", label: "first_name" }] },
            { key: "contact_info", title: "Contact", fields: [{ key: "email", label: "email" }] },
            { key: "record_info", title: "Record Info", fields: [{ key: "created_at", label: "created_at" }] },
            { key: "custom_xyz", title: "Basic", fields: [{ key: "notes", label: "notes" }] },
            { key: "preferred_name", title: "Preferred Name", fields: [{ key: "preferred_name", label: "preferred_name" }] },
            { key: "medical", title: "Medical", fields: [{ key: "allergies", label: "allergies" }] },
        ];
        for (const section of sections.slice(0, 5)) {
            expect(isPersonDrawerParentSuppressedOverviewSection(section)).toBe(true);
        }
        expect(isPersonDrawerParentSuppressedOverviewSection(sections[5]!)).toBe(true);
        expect(personDrawerParentOperatingOverviewSections(sections).map((s) => s.key)).toEqual([]);
    });

    it("suppresses child Child Profile, Basic, Profile, Contact, and Record Info", () => {
        const sections = [
            { key: "child_profile", title: "Child Profile", fields: [{ key: "allergies", label: "allergies" }] },
            { key: "basic_info", title: "Basic", fields: [{ key: "first_name", label: "first_name" }] },
            { key: "profile", title: "Profile", fields: [{ key: "nickname", label: "nickname" }] },
            { key: "contact_info", title: "Contact", fields: [{ key: "email", label: "email" }] },
            { key: "record_info", title: "Record Info", fields: [{ key: "id", label: "id" }] },
            { key: "medical", title: "Medical", fields: [{ key: "medical_notes", label: "medical_notes" }] },
        ];
        for (const section of sections.slice(0, 5)) {
            expect(isPersonDrawerChildSuppressedOverviewSection(section)).toBe(true);
        }
        expect(personDrawerChildOperatingOverviewSections(sections).map((s) => s.key)).toEqual(["medical"]);
    });
});

describe("person drawer IA blockers (drawer source)", () => {
    const drawerPath = join(process.cwd(), "components/admin/AdminEntityDrawer.tsx");
    const drawer = () => readFileSync(drawerPath, "utf8");

    it("imports PersonEmployeePlacementSection for non-operating person paths", () => {
        const src = drawer();
        expect(src).toContain('import PersonEmployeePlacementSection from "@/components/admin/entity/PersonEmployeePlacementSection"');
        expect(src).toContain("<PersonEmployeePlacementSection");
    });

    it("does not render employee_placement custom content on parent or child operating chrome", () => {
        const src = drawer();
        expect(src).toContain("!personChildLifecycleChrome &&");
        expect(src).toContain("personDrawerShouldShowEmployeePlacement(profile)");
        const personsBlock = src.slice(src.indexOf('if (drawer.type === "persons" && data && !(data as { _create?: boolean })._create)'));
        const employeePlacementIdx = personsBlock.indexOf("employee_placement:");
        expect(employeePlacementIdx).toBeGreaterThan(-1);
        const guard = personsBlock.slice(
            Math.max(0, employeePlacementIdx - 400),
            employeePlacementIdx
        );
        expect(guard).toContain("!personParentGuardianChrome");
        expect(guard).toContain("!personChildLifecycleChrome");
    });

    it("does not fall back to entityPresentation overview sections for parent/child chrome", () => {
        const src = drawer();
        expect(src).toContain("personDrawerOverviewSectionsOverride");
        expect(src).toContain(
            "if (personParentGuardianChrome || personChildLifecycleChrome) {\n            return configDrivenOverviewSections;"
        );
    });

    it("skips canonical personPres fallback when parent or child operating chrome is active", () => {
        const src = drawer();
        expect(src).toMatch(
            /fromDefs\.length === 0[\s\S]*!personParentGuardianChrome[\s\S]*!personChildLifecycleChrome[\s\S]*sectionBlocks = \[\.\.\.personPres\]/
        );
    });

    it("removes duplicate parent/child module chip row below tabs", () => {
        const src = drawer();
        expect(src).not.toMatch(
            /drawerPostTabStrip[\s\S]*personDrawerChildLifecycleRail/
        );
        expect(src).not.toMatch(
            /drawerPostTabStrip[\s\S]*personDrawerParentLifecycleRail/
        );
    });

    it("household child rows open persons drawer only when openable", () => {
        const household = readFileSync(
            join(process.cwd(), "components/admin/entity/PersonDrawerHouseholdSection.tsx"),
            "utf8"
        );
        expect(household).toContain('row.link_state === "openable" && row.person_id');
        expect(household).toContain('onOpenChild(row.person_id!)');
        expect(household).toContain("data-person-drawer-household-child-unlinked");
        expect(household).not.toContain('onOpenDrawer("customer_members"');
    });
});
