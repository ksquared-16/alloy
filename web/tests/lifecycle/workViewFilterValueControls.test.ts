import { describe, expect, it } from "vitest";
import {
    createDefaultWorkViewFilterRow,
    datePresetSelectValue,
    defaultFilterValueForField,
    formatWorkViewFilterValueLabel,
    patchWorkViewFilterRow,
    resolveWorkViewFilterValueControlKind,
} from "@/lib/lifecycle/workViewFilterValueControls";
import { evaluateWorkViewFiltersForRow } from "@/lib/lifecycle/evaluateWorkViewFiltersV1";

describe("workViewFilterValueControls", () => {
    it("uses date presets for tour_date equals", () => {
        expect(resolveWorkViewFilterValueControlKind("tour_date", "equals")).toBe("date_preset");
        expect(defaultFilterValueForField("tour_date", "equals")).toBe("today");
    });

    it("uses status select for status equals", () => {
        expect(resolveWorkViewFilterValueControlKind("status", "equals")).toBe("status_select");
    });

    it("uses location select with current site default", () => {
        expect(resolveWorkViewFilterValueControlKind("location", "equals")).toBe("location_select");
        expect(defaultFilterValueForField("location", "equals")).toBe("current_site");
    });

    it("uses boolean control for needs_follow_up", () => {
        expect(resolveWorkViewFilterValueControlKind("needs_follow_up", "equals")).toBe("boolean");
    });

    it("hides value control for is_empty", () => {
        expect(resolveWorkViewFilterValueControlKind("status", "is_empty")).toBe("none");
        expect(patchWorkViewFilterRow(
            { field_key: "status", operator: "is_empty", value: "scheduled" },
            { operator: "is_empty" },
        ).value).toBeNull();
    });

    it("coerces field changes to typed defaults", () => {
        const row = patchWorkViewFilterRow(
            { field_key: "status", operator: "equals", value: "open" },
            { field_key: "tour_date" },
        );
        expect(row.field_key).toBe("tour_date");
        expect(row.value).toBe("today");
    });

    it("formats date preset labels for display", () => {
        expect(formatWorkViewFilterValueLabel("tour_date", "equals", "today")).toBe("Today");
        expect(formatWorkViewFilterValueLabel("location", "equals", "current_site")).toBe("Current site");
    });

    it("detects custom ISO dates", () => {
        expect(datePresetSelectValue("2026-06-25")).toBe("__custom__");
        expect(createDefaultWorkViewFilterRow().value).toBe("today");
    });
});

describe("evaluateWorkViewFiltersV1 date presets", () => {
    it("matches today preset for tour_date equals", () => {
        const today = new Date().toISOString().slice(0, 10);
        const result = evaluateWorkViewFiltersForRow(
            { metadata: { tour_date: today } },
            [{ field_key: "tour_date", operator: "equals", value: "today" }],
        );
        expect(result.pass).toBe(true);
    });

    it("matches tomorrow preset", () => {
        const tomorrow = new Date();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        const iso = tomorrow.toISOString().slice(0, 10);
        const result = evaluateWorkViewFiltersForRow(
            { metadata: { tour_date: iso } },
            [{ field_key: "tour_date", operator: "equals", value: "tomorrow" }],
        );
        expect(result.pass).toBe(true);
    });
});
