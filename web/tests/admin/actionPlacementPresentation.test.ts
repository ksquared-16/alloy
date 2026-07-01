import { describe, expect, it } from "vitest";
import {
    SETTINGS_SURFACE_OPTIONS,
    settingsSlotsForSurface,
    settingsSurfaceLabel,
    surfaceRequiresSectionKey,
} from "@/lib/admin/actions/actionPlacementPresentation";
import { OPERATOR_EDITABLE_ACTION_SURFACES } from "@/lib/admin/actions/actionPlacementMutation";

describe("actionPlacementPresentation", () => {
    it("includes workspace surfaces in Settings editable list", () => {
        expect(OPERATOR_EDITABLE_ACTION_SURFACES).toContain("right_rail");
        expect(OPERATOR_EDITABLE_ACTION_SURFACES).toContain("queue_row");
        expect(OPERATOR_EDITABLE_ACTION_SURFACES).toContain("workspace");
    });

    it("labels record section and workspace surfaces for operators", () => {
        expect(settingsSurfaceLabel("record_section")).toBe("Record section");
        expect(settingsSurfaceLabel("right_rail")).toContain("Workspace");
        expect(settingsSurfaceLabel("queue_row")).toBe("Workspace queue row");
        expect(settingsSurfaceLabel("workspace")).toBe("Workspace root");
    });

    it("requires section key only for record section", () => {
        expect(surfaceRequiresSectionKey("record_section")).toBe(true);
        expect(surfaceRequiresSectionKey("record_header")).toBe(false);
        expect(surfaceRequiresSectionKey("right_rail")).toBe(false);
    });

    it("orders slot options with surface-appropriate defaults first", () => {
        const queueSlots = settingsSlotsForSurface("queue_row").map((s) => s.value);
        expect(queueSlots[0]).toBe("row_inline");
    });

    it("documents all operator surfaces with descriptions", () => {
        expect(SETTINGS_SURFACE_OPTIONS.length).toBeGreaterThanOrEqual(4);
        for (const o of SETTINGS_SURFACE_OPTIONS) {
            expect(o.description.length).toBeGreaterThan(10);
        }
    });
});
