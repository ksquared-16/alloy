import { describe, expect, it } from "vitest";

import {
    SURFACE_CONFIG_SECTIONS,
    SURFACE_OBJECTS,
} from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";

describe("Surfaces — Dashboard / Analytics category", () => {
    it("exposes Dashboards as a real Surface category", () => {
        const dashboards = SURFACE_CONFIG_SECTIONS.find((s) => s.key === "dashboards");
        expect(dashboards).toBeDefined();
        expect(dashboards?.label).toContain("Dashboards");
    });

    it("catalogs real Dashboard surfaces instead of an empty stub", () => {
        const objects = SURFACE_OBJECTS.dashboards;
        expect(objects.length).toBeGreaterThanOrEqual(4);
        const ids = objects.map((o) => o.id);
        expect(ids).toContain("executive-performance");
        expect(ids).toContain("operational-intelligence");
        expect(ids).toContain("enrollment-intelligence");
        expect(ids).toContain("financial-performance");
    });

    it("links each Dashboard surface to the Analytics composition preview", () => {
        for (const object of SURFACE_OBJECTS.dashboards) {
            expect(object.previewHref).toBe("/dev/analytics-surface-mocks");
            // Catalogued only — no live editor wired in this slice.
            expect(object.editor).toBeUndefined();
        }
    });
});
