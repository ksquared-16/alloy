/**
 * Pure presentation helpers for read-only operational/financial configuration
 * surfaces (Operational Configuration V1, Batch 0).
 */
import { describe, expect, it } from "vitest";
import {
    classifyEffectiveStatus,
    describeScope,
    formatCurrencyCents,
    formatEffectiveRange,
    isScopeOverride,
    sortByEffectiveStatus,
} from "@/lib/adminV2/operationalConfig/configReadPresentation";
import type {
    ConfigRuleEffectiveColumns,
    ConfigRuleScopeColumns,
} from "@/lib/childcareOperational/config/configRuleTypes";

function eff(start: string, end: string | null): ConfigRuleEffectiveColumns {
    return { effective_start: start, effective_end: end };
}

describe("configReadPresentation", () => {
    const today = "2026-06-28";

    describe("classifyEffectiveStatus", () => {
        it("marks a future effective_start as scheduled", () => {
            expect(classifyEffectiveStatus(eff("2026-08-01", null), today)).toBe("scheduled");
        });

        it("marks an ended row as historical", () => {
            expect(classifyEffectiveStatus(eff("2025-01-01", "2026-01-01"), today)).toBe("historical");
        });

        it("marks an active open-ended row as current", () => {
            expect(classifyEffectiveStatus(eff("2026-01-01", null), today)).toBe("current");
        });

        it("treats the boundary dates inclusively", () => {
            expect(classifyEffectiveStatus(eff(today, today), today)).toBe("current");
        });
    });

    describe("describeScope / isScopeOverride", () => {
        const scope = (t: ConfigRuleScopeColumns["scope_type"]): ConfigRuleScopeColumns => ({
            scope_type: t,
            site_location_id: null,
            program_category_id: null,
            room_location_id: null,
        });

        it("uses generic, vertical-agnostic scope labels", () => {
            expect(describeScope(scope("org"))).toBe("Org default");
            expect(describeScope(scope("site"))).toBe("Location override");
            expect(describeScope(scope("program"))).toBe("Program override");
            expect(describeScope(scope("room"))).toBe("Room override");
        });

        it("only non-org scopes are overrides", () => {
            expect(isScopeOverride(scope("org"))).toBe(false);
            expect(isScopeOverride(scope("site"))).toBe(true);
            expect(isScopeOverride(scope("room"))).toBe(true);
        });
    });

    describe("formatCurrencyCents", () => {
        it("formats integer cents to currency", () => {
            expect(formatCurrencyCents(120000, "USD")).toBe("$1,200.00");
        });
        it("never throws on an unknown currency", () => {
            expect(() => formatCurrencyCents(100, "ZZZ")).not.toThrow();
        });
    });

    describe("formatEffectiveRange", () => {
        it("renders an open-ended range as ongoing", () => {
            expect(formatEffectiveRange(eff("2026-08-01", null))).toContain("ongoing");
        });
    });

    describe("sortByEffectiveStatus", () => {
        it("orders current, then scheduled (soonest), then historical (most recent)", () => {
            const rows = [
                { effective_start: "2026-08-01", effective_end: null }, // scheduled
                { effective_start: "2024-01-01", effective_end: "2024-12-31" }, // historical (older)
                { effective_start: "2026-01-01", effective_end: null }, // current
                { effective_start: "2025-01-01", effective_end: "2025-12-31" }, // historical (newer)
            ];
            const sorted = sortByEffectiveStatus(rows, today);
            expect(sorted.map((r) => r.effective_start)).toEqual([
                "2026-01-01",
                "2026-08-01",
                "2025-01-01",
                "2024-01-01",
            ]);
        });
    });
});
