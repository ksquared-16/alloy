import { describe, expect, it } from "vitest";
import { inlineRequirementCellMode } from "@/lib/fields/fieldRequiredInlineUi";
import { buildFieldPolicySettingsView } from "@/lib/fields/fieldPolicySettingsUi";

describe("fieldRequiredInlineUi", () => {
    it("locks inline Required for opportunity — behavior is on Record layouts", () => {
        const view = buildFieldPolicySettingsView("opportunity", {
            field_key: "campus_pref",
            is_system: false,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        expect(inlineRequirementCellMode("opportunity", true, view)).toBe("locked");
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
