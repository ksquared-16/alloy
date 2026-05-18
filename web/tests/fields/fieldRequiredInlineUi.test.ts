import { describe, expect, it } from "vitest";
import { inlineRequirementCellMode } from "@/lib/fields/fieldRequiredInlineUi";
import { buildFieldPolicySettingsView } from "@/lib/fields/fieldPolicySettingsUi";

describe("fieldRequiredInlineUi", () => {
    it("shows editable mode for policy-editable opportunity field when can mutate", () => {
        const view = buildFieldPolicySettingsView("opportunity", {
            field_key: "campus_pref",
            is_system: false,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        expect(inlineRequirementCellMode("opportunity", true, view)).toBe("editable");
    });

    it("shows locked mode for status fields", () => {
        const view = buildFieldPolicySettingsView("opportunity", {
            field_key: "status_key",
            is_system: true,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        expect(inlineRequirementCellMode("opportunity", true, view)).toBe("locked");
    });
});
