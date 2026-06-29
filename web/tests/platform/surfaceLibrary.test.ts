import { describe, expect, it } from "vitest";

import {
    listSurfaceLibrary,
    authorableSurfaces,
    surfaceLibraryByCategory,
    SURFACE_LIBRARY_CATEGORY_ORDER,
} from "@/lib/platform/surfaceBuilder/surfaceLibrary";

describe("Surface Library — the command center registry", () => {
    it("lists every surface; Operational Intelligence is just one entry", () => {
        const all = listSurfaceLibrary();
        expect(all.length).toBeGreaterThanOrEqual(8);
        const oi = all.find((s) => s.id === "operational-intelligence");
        expect(oi).toBeDefined();
        expect(oi?.status).toBe("published");
        expect(oi?.editor).toBe("operational-intelligence");
        expect(oi?.category).toBe("Dashboards & analytics");
    });

    it("authorable surfaces are exactly those with a builder editor (Focus Panel + Operational Intelligence)", () => {
        const editors = authorableSurfaces().map((s) => s.editor).sort();
        expect(editors).toEqual(["focus-panel-summary", "operational-intelligence"]);
    });

    it("planned surfaces carry no editor (appear in the library, open later)", () => {
        for (const s of listSurfaceLibrary()) {
            if (s.status === "planned") expect(s.editor).toBeUndefined();
        }
    });

    it("groups by category in display order, omitting empty groups", () => {
        const groups = surfaceLibraryByCategory();
        expect(groups.length).toBeGreaterThan(0);
        const order = groups.map((g) => g.category);
        // categories appear in the declared display order
        expect(order).toEqual([...SURFACE_LIBRARY_CATEGORY_ORDER].filter((c) => order.includes(c)));
        expect(groups[0].category).toBe("Dashboards & analytics");
    });
});
