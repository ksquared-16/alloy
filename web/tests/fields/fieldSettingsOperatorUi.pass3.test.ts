import { describe, expect, it } from "vitest";
import {
    operatorRequirementLockedReason,
    operatorRequirementPresetLabel,
} from "@/lib/fields/fieldSettingsOperatorUi";
import { buildFieldPolicySettingsView } from "@/lib/fields/fieldPolicySettingsUi";

describe("fieldSettingsOperatorUi pass3 copy", () => {
    it("labels required when saving preset for operators", () => {
        expect(operatorRequirementPresetLabel("required_on_save")).toBe("Required when saving");
    });

    it("explains locked requirement for status fields", () => {
        const view = buildFieldPolicySettingsView("opportunity", {
            field_key: "status_key",
            is_system: true,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        expect(operatorRequirementLockedReason("opportunity", "status_key", view)).toContain("status");
    });
});
