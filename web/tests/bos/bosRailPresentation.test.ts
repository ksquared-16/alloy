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

    it("uses Configuration-native starters on Configuration routes", () => {
        const suggestions = resolveCommandSurfaceRailStarterSuggestions({
            hasWorkUnitScope: false,
            hasOpportunityContext: false,
            opportunitySingular: "Inquiry",
            isConfigurationContext: true,
            pathname: "/organization/locations",
        });
        expect(suggestions.map((suggestion) => suggestion.title)).toEqual([
            "Explain this configuration",
            "Review configuration attention",
            "Review unpublished changes",
        ]);
        expect(suggestions.map((suggestion) => suggestion.title).join(" ")).not.toContain("queue");
    });

    it("uses Programs-native starters without unpublished-changes copy", () => {
        const suggestions = resolveCommandSurfaceRailStarterSuggestions({
            hasWorkUnitScope: false,
            hasOpportunityContext: false,
            opportunitySingular: "Inquiry",
            isConfigurationContext: true,
            pathname: "/organization/programs",
        });
        expect(suggestions.map((suggestion) => suggestion.title)).toEqual([
            "Summarize this Program",
            "Which Locations offer this Program?",
            "What changed recently?",
        ]);
        expect(suggestions.map((suggestion) => suggestion.title).join(" ")).not.toMatch(/unpublished/i);
    });
});
