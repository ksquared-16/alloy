import { describe, expect, it } from "vitest";
import {
    layoutSettingsSupportsAddSection,
    layoutSettingsSupportsSectionOrder,
    normalizeLayoutSettingsEntity,
} from "@/lib/adminV2/layoutsSettingsEntities";

describe("layoutsSettingsEntities", () => {
    it("defaults unknown entity to opportunity", () => {
        expect(normalizeLayoutSettingsEntity("")).toBe("opportunity");
        expect(normalizeLayoutSettingsEntity("job")).toBe("job");
    });

    it("section order only on opportunity", () => {
        expect(layoutSettingsSupportsSectionOrder("opportunity")).toBe(true);
        expect(layoutSettingsSupportsSectionOrder("job")).toBe(false);
    });

    it("add section not supported yet", () => {
        expect(layoutSettingsSupportsAddSection("opportunity")).toBe(false);
    });
});
