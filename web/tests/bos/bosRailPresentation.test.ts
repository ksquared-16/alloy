import { describe, expect, it } from "vitest";

import { parseBosRailContextChips } from "@/lib/bos/bosRailContextChips";
import { resolveCommandSurfaceRailStarterSuggestions } from "@/lib/adminV2/aiCommandSurface/commandSurfaceShellLayout";

describe("bosRailPresentation", () => {
    it("parses context display line into chips", () => {
        expect(parseBosRailContextChips("Lead — Jimmy Patter")).toEqual([
            { label: "Lead" },
            { label: "Jimmy Patter" },
        ]);
    });

    it("uses queue summarize title on work unit scope without opportunity context", () => {
        const suggestions = resolveCommandSurfaceRailStarterSuggestions({
            hasWorkUnitScope: true,
            hasOpportunityContext: false,
            opportunitySingular: "Inquiry",
        });
        expect(suggestions[0]?.title).toBe("Summarize this queue");
    });

    it("uses lead summarize title when opportunity context is active", () => {
        const suggestions = resolveCommandSurfaceRailStarterSuggestions({
            hasWorkUnitScope: true,
            hasOpportunityContext: true,
            opportunitySingular: "Inquiry",
        });
        expect(suggestions[0]?.title).toBe("Summarize this lead");
    });
});
