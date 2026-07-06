import { describe, expect, it } from "vitest";

import {
    SURFACE_CONFIG_SECTIONS,
    SURFACE_OBJECTS,
} from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";
import { sectionLabel } from "@/lib/adminV2/settings/surfaces/surfacesNavigationModel";

describe("Surfaces — navigation model", () => {
    it("exposes the five top-level Settings categories (no Surface Library section)", () => {
        expect(SURFACE_CONFIG_SECTIONS.map((s) => s.key)).toEqual([
            "focus-panels",
            "queue-rows",
            "workspaces",
            "work-units",
            "operational-intelligence",
        ]);
        expect(SURFACE_CONFIG_SECTIONS.map((s) => s.label)).toContain("Operational Intelligence");
    });

    it("does not hardcode workspace process surfaces in the navigation model", () => {
        const src = sectionLabel("workspaces");
        expect(src).toBe("Workspaces");
        expect(SURFACE_OBJECTS.workspaces).toBeUndefined();
    });

    it("exposes Workspace Header as a Workspaces entry via the fixed surface object", async () => {
        const { WORKSPACE_HEADER_SURFACE_OBJECT } = await import(
            "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings"
        );
        expect(WORKSPACE_HEADER_SURFACE_OBJECT.editor).toBe("workspace-header");
        expect(WORKSPACE_HEADER_SURFACE_OBJECT.title).toBe("Workspace Header");
    });

    it("exposes Work Unit Header under Work Units with full builder editor", async () => {
        const { WORK_UNIT_HEADER_SURFACE_OBJECT } = await import(
            "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings"
        );
        expect(WORK_UNIT_HEADER_SURFACE_OBJECT.editor).toBe("work-unit-header");
        expect(WORK_UNIT_HEADER_SURFACE_OBJECT.title).toBe("Work Unit Header");
        expect(SURFACE_OBJECTS["work-units"][0]?.id).toBe("work-unit-header");
    });

    it("catalogs Operational Intelligence with a live editor", () => {
        const oi = SURFACE_OBJECTS["operational-intelligence"].find((o) => o.id === "operational-intelligence");
        expect(oi?.editor).toBe("operational-intelligence");
    });
});
