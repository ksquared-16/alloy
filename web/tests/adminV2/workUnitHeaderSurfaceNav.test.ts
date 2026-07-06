import { describe, expect, it } from "vitest";
import {
    SURFACE_OBJECTS,
    WORK_UNIT_HEADER_SURFACE_OBJECT,
} from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";
import { WORK_UNIT_HEADER_LAYOUT_KEY } from "@/lib/presentation/runtime/workUnitHeaderSurfaceConfig";

describe("Work Unit Header — surfaces navigation", () => {
    it("Work Unit Header is the primary Work Units entry with full builder editor", () => {
        expect(WORK_UNIT_HEADER_SURFACE_OBJECT.id).toBe("work-unit-header");
        expect(WORK_UNIT_HEADER_SURFACE_OBJECT.editor).toBe("work-unit-header");
        expect(WORK_UNIT_HEADER_SURFACE_OBJECT.title).toBe("Work Unit Header");
    });

    it("lives under Work Units, not Workspaces", () => {
        expect(SURFACE_OBJECTS["work-units"][0]?.id).toBe("work-unit-header");
        expect(SURFACE_OBJECTS["work-units"].some((o) => o.id === "workspace-header")).toBe(false);
    });

    it("persists under the work_unit_header layout key on workspace surface", () => {
        expect(WORK_UNIT_HEADER_LAYOUT_KEY).toBe("work_unit_header");
    });
});
