import { describe, expect, it } from "vitest";
import { describeScopeWithLabel } from "@/lib/adminV2/operationalConfig/configReadPresentation";
import type { ConfigRuleScopeColumns } from "@/lib/childcareOperational/config/configRuleTypes";

function scope(partial: Partial<ConfigRuleScopeColumns> & { scope_type: ConfigRuleScopeColumns["scope_type"] }): ConfigRuleScopeColumns {
    return {
        scope_type: partial.scope_type,
        site_location_id: partial.site_location_id ?? null,
        program_category_id: partial.program_category_id ?? null,
        room_location_id: partial.room_location_id ?? null,
    };
}

const labels: Record<string, string> = {
    "site-1": "Austin Campus",
    "prog-1": "Toddler",
    "room-1": "Toddler A",
};
const lookup = (id: string) => labels[id];

describe("describeScopeWithLabel — Phase 4 label-aware scope display", () => {
    it("org → Org default", () => {
        expect(describeScopeWithLabel(scope({ scope_type: "org" }), lookup)).toBe("Org default");
    });

    it("site → Location: <label>", () => {
        expect(describeScopeWithLabel(scope({ scope_type: "site", site_location_id: "site-1" }), lookup)).toBe("Location: Austin Campus");
    });

    it("program → Program: <label>", () => {
        expect(describeScopeWithLabel(scope({ scope_type: "program", program_category_id: "prog-1" }), lookup)).toBe("Program: Toddler");
    });

    it("room → Room: <label>", () => {
        expect(describeScopeWithLabel(scope({ scope_type: "room", room_location_id: "room-1" }), lookup)).toBe("Room: Toddler A");
    });

    it("falls back to the generic override label when the id has no known label (never shows a raw UUID)", () => {
        const result = describeScopeWithLabel(scope({ scope_type: "site", site_location_id: "unknown-uuid" }), lookup);
        expect(result).toBe("Location override");
        expect(result).not.toContain("unknown-uuid");
    });
});
