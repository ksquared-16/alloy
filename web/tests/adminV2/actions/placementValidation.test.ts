import { describe, expect, it } from "vitest";
import {
    assertConfiguredPlacement,
    validateConfiguredPlacement,
} from "@/lib/adminV2/actions/configValidation";

describe("configured placement validation", () => {
    it("accepts a known action on a recognized logical placement", () => {
        const result = validateConfiguredPlacement("update_status", "focus_panel_manage");
        expect(result.ok).toBe(true);
    });

    it("rejects an unknown placement for a known action", () => {
        const result = validateConfiguredPlacement("update_status", "legacy_drawer");
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/placement/i);
    });

    it("rejects an unknown action key", () => {
        const result = validateConfiguredPlacement("totally_made_up", "work_unit_actions");
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/action key/i);
    });

    it("throws in dev/test when a placement is invalid", () => {
        expect(() => assertConfiguredPlacement("update_status", "legacy_drawer")).toThrow();
    });

    it("does not throw for a valid placement", () => {
        expect(() => assertConfiguredPlacement("update_status", "queue_row_menu")).not.toThrow();
    });
});
