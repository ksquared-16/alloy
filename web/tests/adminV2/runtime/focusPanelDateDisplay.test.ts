import { describe, expect, it } from "vitest";

import {
    formatFocusPanelDate,
    formatFocusPanelDobAgeLine,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelDateDisplay";

describe("Focus Panel date display doctrine", () => {
    it("formats ISO dates as human-readable month day year", () => {
        expect(formatFocusPanelDate("2020-03-03")).toBe("Mar 3, 2020");
        expect(formatFocusPanelDate("2025-08-26")).toBe("Aug 26, 2025");
    });

    it("does not leave raw ISO on operator display when parseable", () => {
        const formatted = formatFocusPanelDate("2019-12-01");
        expect(formatted).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(formatted).not.toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
    });

    it("returns null for empty values", () => {
        expect(formatFocusPanelDate(null)).toBeNull();
        expect(formatFocusPanelDate("")).toBeNull();
        expect(formatFocusPanelDobAgeLine(null)).toBeNull();
    });

    it("pairs DOB with derived years+months age", () => {
        const asOf = new Date(2026, 6, 8); // Jul 8, 2026 local
        expect(formatFocusPanelDobAgeLine("2020-03-03", "stale", asOf)).toBe("3/3/2020 (6y4m)");
        expect(formatFocusPanelDobAgeLine("2026-01-01", null, asOf)).toBe("1/1/2026 (6m)");
        expect(formatFocusPanelDobAgeLine("2020-01-01", null, asOf)).toBe("1/1/2020 (6y6m)");
    });

    it("falls back to compact age string when DOB missing", () => {
        expect(formatFocusPanelDobAgeLine(null, "4y")).toBe("4y");
        expect(formatFocusPanelDobAgeLine(null, "2y 3m")).toBe("2y3m");
    });
});
