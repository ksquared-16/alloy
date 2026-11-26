import { describe, expect, it } from "vitest";
import {
    SURFACE_OBJECTS,
    WORKSPACE_HEADER_SURFACE_OBJECT,
} from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";
import { WORKSPACE_HEADER_LAYOUT_KEY } from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";

describe("Workspace Header — surfaces navigation", () => {
    it("Workspace Header is a fixed Workspaces entry with its own editor", () => {
        expect(WORKSPACE_HEADER_SURFACE_OBJECT.id).toBe("workspace-header");
        expect(WORKSPACE_HEADER_SURFACE_OBJECT.editor).toBe("workspace-header");
        expect(WORKSPACE_HEADER_SURFACE_OBJECT.liveHref).toBe("/workspace");
    });

    it("does not live under Work Units (Work Unit Header stays separate)", () => {
        const wu = SURFACE_OBJECTS["work-units"].find((o) => o.id === "work-unit-header");
        expect(wu?.editor).toBe("work-unit-header");
        expect(SURFACE_OBJECTS["work-units"].some((o) => o.id === "workspace-header")).toBe(false);
    });

    it("persists under the workspace surface layout key", () => {
        expect(WORKSPACE_HEADER_LAYOUT_KEY).toBe("workspace_header");
    });
});
