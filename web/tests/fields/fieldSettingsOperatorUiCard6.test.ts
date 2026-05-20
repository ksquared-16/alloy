import { describe, expect, it } from "vitest";
import {
    fieldBehaviorConfiguredOnRecordLayouts,
    fieldsTableShowsPolicyColumns,
    FIELDS_HUB_LAYOUT_BEHAVIOR_NOTE,
    recordLayoutsSettingsHref,
} from "@/lib/fields/fieldSettingsOperatorUi";

describe("fieldSettingsOperatorUi Card 6", () => {
    it("routes opportunity/job behavior to record layouts", () => {
        expect(fieldBehaviorConfiguredOnRecordLayouts("opportunity")).toBe(true);
        expect(fieldBehaviorConfiguredOnRecordLayouts("job")).toBe(true);
        expect(fieldBehaviorConfiguredOnRecordLayouts("customer")).toBe(false);
    });

    it("hides policy columns on Fields table for layout-managed entities", () => {
        expect(fieldsTableShowsPolicyColumns("opportunity")).toBe(false);
        expect(fieldsTableShowsPolicyColumns("vendor")).toBe(false);
    });

    it("provides layout settings deep link per entity", () => {
        expect(recordLayoutsSettingsHref("opportunity")).toContain("entity=opportunity");
        expect(FIELDS_HUB_LAYOUT_BEHAVIOR_NOTE).toContain("Record layouts");
    });
});
