import { describe, expect, it } from "vitest";
import { mergeLifecycleFieldPaletteForStage } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { customFieldRuleId } from "@/lib/lifecycle/lifecycleFieldRuleBindings";

describe("lifecycleFieldPaletteMerge", () => {
    it("includes catalog fields for lead stage", () => {
        const palette = mergeLifecycleFieldPaletteForStage("lead");
        expect(palette.some((f) => f.rule_id === "person:first_name")).toBe(true);
    });

    it("merges org custom fields not in catalog", () => {
        const palette = mergeLifecycleFieldPaletteForStage("lead", {
            person: [
                {
                    field_key: "preferred_language",
                    label: "Preferred Language",
                    entity_type: "person",
                    is_system: false,
                    is_active: true,
                },
            ],
        });
        expect(palette.some((f) => f.rule_id === customFieldRuleId("person", "preferred_language"))).toBe(true);
        const custom = palette.find((f) => f.rule_id === customFieldRuleId("person", "preferred_language"));
        expect(custom?.field_label).toBe("Preferred Language");
        expect(custom?.config_only).toBe(true);
        expect(custom?.field_source).toBe("custom");
    });

    it("overlays org labels onto catalog field keys", () => {
        const palette = mergeLifecycleFieldPaletteForStage("lead", {
            person: [
                {
                    field_key: "first_name",
                    label: "Guardian First Name",
                    entity_type: "person",
                    is_system: true,
                    is_active: true,
                },
            ],
        });
        const first = palette.find((f) => f.rule_id === "person:first_name");
        expect(first?.field_label).toBe("Guardian First Name");
    });
});
