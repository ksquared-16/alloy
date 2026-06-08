import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LAYOUT_SETTINGS_ENTITY_ORDER } from "@/lib/adminV2/layoutsSettingsEntities";
import { buildEffectiveDrawerLayoutPreview } from "@/lib/recordChrome/effectiveDrawerLayoutPreview";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("person drawer control-plane convergence (Card 4)", () => {
    it("includes person in layout settings entity order", () => {
        expect(LAYOUT_SETTINGS_ENTITY_ORDER).toContain("person");
    });

    it("AdminEntityDrawer routes existing persons through config-driven overview", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).not.toContain("usePersonCompactOverview");
        expect(drawer).toContain("useConfigDrivenOverview");
        expect(drawer).toContain("personDrawerExistingReady");
        expect(drawer).toMatch(/personDrawerExistingReady[\s\S]*useConfigDrivenOverview/);
        const configIdx = drawer.indexOf("useConfigDrivenOverview &&");
        const entityOverviewIdx = drawer.indexOf("<EntityDrawerOverview");
        expect(configIdx).toBeGreaterThan(-1);
        expect(entityOverviewIdx).toBeGreaterThan(configIdx);
        expect(drawer).not.toContain("<PersonDrawerCompactOverview");
    });

    it("overviewCustomContent builds relationships and employee sections for persons", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        const block = drawer.slice(
            drawer.indexOf('if (drawer.type === "persons" && data && !(data as { _create?: boolean })._create)'),
            drawer.indexOf('if (drawer.type === "locations" && data && !(data as { _create?: boolean })._create)')
        );
        expect(block).toContain("employee_placement:");
        expect(block).toContain("PersonEmployeePlacementSection");
        expect(block).toContain("PersonDrawerRelationshipsOverview");
        expect(block).toContain("PersonDrawerEnrollmentActivity");
        expect(block).not.toMatch(
            /drawer\.type === "persons"[\s\S]*return \{\};/
        );
    });

    it("config-driven overview merges person presentation sections and field definitions", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain('drawer.type === "persons"');
        expect(drawer).toContain('getEntityPresentation("persons")');
        expect(drawer).toContain('"employee_placement"');
        expect(drawer).toContain('"is_employee", "employee_id", "employee_source"');
    });

    it("effective layout preview supports persons via presentation template", () => {
        const preview = buildEffectiveDrawerLayoutPreview({
            presentationEntityType: "persons",
            config: {},
        });
        expect(preview.fidelity).toBe("presentation_ordered_skeleton");
        expect(preview.sections.some((s) => s.section_key === "contact_info")).toBe(true);
        expect(preview.sections.some((s) => s.section_key === "employee_placement")).toBe(true);
        expect(preview.sections.some((s) => s.section_key === "relationships")).toBe(true);
    });

    it("person loading shell is gated on active fetch loading only", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        const shellBlock = drawer.slice(
            drawer.indexOf("const personDrawerShowLoadingShell"),
            drawer.indexOf("const personDrawerShowLoadingShell") + 420
        );
        expect(shellBlock).toContain("loading");
        expect(shellBlock).not.toContain("drawerGateLoading");
    });

    it("wires Card 5 profile badges and visibility sections", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("PersonDrawerProfileBadges");
        expect(drawer).toContain("PersonDrawerRelationshipsOverview");
        expect(drawer).toContain("PersonDrawerEnrollmentActivity");
        expect(drawer).toContain('key: "enrollment_activity"');
        expect(drawer).not.toContain("No locations linked (person_locations)");
    });
});
