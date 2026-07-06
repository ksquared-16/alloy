/**
 * Surfaces breadcrumb model tests.
 */
import { describe, expect, it } from "vitest";
import {
    buildSurfacesBreadcrumb,
    currentCrumbLabel,
} from "@/lib/adminV2/settings/surfaces/surfacesBreadcrumbModel";

describe("buildSurfacesBreadcrumb — flat surface", () => {
    it("renders Surfaces / Section / Surface with the surface as the current view", () => {
        const crumbs = buildSurfacesBreadcrumb({ sectionLabel: "Queue Rows", surfaceTitle: "Pipeline Queue Row" });
        expect(crumbs.map((c) => c.label)).toEqual(["Surfaces", "Queue Rows", "Pipeline Queue Row"]);
        expect(crumbs[0]!.target).toBe("root");
        expect(crumbs[2]!.target).toBeNull(); // current view, not a link
    });

    it("the section crumb navigates to the library when flat, or back to canvas when nested", () => {
        const flat = buildSurfacesBreadcrumb({ sectionLabel: "Focus Panels", surfaceTitle: "Enrollment Focus Panel" });
        expect(flat[1]!.target).toBe("root");

        const nested = buildSurfacesBreadcrumb({
            sectionLabel: "Focus Panels",
            surfaceTitle: "Enrollment Focus Panel",
            nestedTrail: ["Children card", "Children"],
        });
        expect(nested[1]!.target).toBe("surface");
    });
});

describe("buildSurfacesBreadcrumb — nested surface editing", () => {
    it("renders the full nested trail with the deepest as current", () => {
        const crumbs = buildSurfacesBreadcrumb({
            sectionLabel: "Focus Panel",
            surfaceTitle: "Enrollment Focus Panel",
            nestedTrail: ["Children Card", "Children Surface"],
        });
        expect(crumbs.map((c) => c.label)).toEqual([
            "Surfaces",
            "Focus Panel",
            "Enrollment Focus Panel",
            "Children Card",
            "Children Surface",
        ]);
        expect(currentCrumbLabel(crumbs)).toBe("Children Surface");
    });

    it("the surface crumb becomes clickable (pops the nested trail) when nested", () => {
        const flat = buildSurfacesBreadcrumb({ sectionLabel: "S", surfaceTitle: "Surface" });
        expect(flat[2]!.target).toBeNull();
        const nested = buildSurfacesBreadcrumb({ sectionLabel: "S", surfaceTitle: "Surface", nestedTrail: ["Card", "Deep"] });
        expect(nested[2]!.target).toBe("surface");
    });

    it("intermediate nested crumbs pop to their depth; the last is not a link", () => {
        const crumbs = buildSurfacesBreadcrumb({
            sectionLabel: "S",
            surfaceTitle: "Surface",
            nestedTrail: ["Children Card", "Children Surface"],
        });
        // index 3 = "Children Card" pops to depth 0; index 4 = current (null)
        expect(crumbs[3]!.target).toBe(0);
        expect(crumbs[4]!.target).toBeNull();
    });
});
