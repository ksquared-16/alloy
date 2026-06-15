import { describe, expect, it } from "vitest";
import {
    canOperatorEditRequirementInline,
    isOperatorHiddenField,
    operatorFieldDisplayLabel,
    operatorPolicyColumnLabel,
    operatorRequirementLockedReason,
    operatorRequirementPresetLabel,
} from "@/lib/fields/fieldSettingsOperatorUi";
import { buildFieldPolicySettingsView } from "@/lib/fields/fieldPolicySettingsUi";

describe("fieldSettingsOperatorUi", () => {
    it("hides relationship and id system fields on opportunity", () => {
        expect(
            isOperatorHiddenField("opportunity", {
                field_key: "customer_id",
                is_system: true,
                label: "Customer",
            })
        ).toBe(true);
        expect(
            isOperatorHiddenField("opportunity", {
                field_key: "campus_pref",
                is_system: false,
                label: "Campus preference",
            })
        ).toBe(false);
    });

    it("uses business label for opportunity name", () => {
        expect(
            operatorFieldDisplayLabel("opportunity", {
                field_key: "name",
                is_system: true,
                label: "name",
            })
        ).toBe("Inquiry name");
    });

    it("prefers stored field_definitions label over catalog overrides for location_id", () => {
        expect(
            operatorFieldDisplayLabel("opportunity", {
                field_key: "location_id",
                is_system: true,
                label: "School",
            })
        ).toBe("School");
    });

    it("maps policy column to operator language", () => {
        const enforceable = buildFieldPolicySettingsView("opportunity", {
            field_key: "campus_pref",
            is_system: false,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        expect(operatorPolicyColumnLabel("opportunity", "campus_pref", enforceable, false)).toBe("Optional");

        const status = buildFieldPolicySettingsView("opportunity", {
            field_key: "status_key",
            is_system: true,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        expect(operatorPolicyColumnLabel("opportunity", "status_key", status, false)).toContain("status");
    });

    it("labels required when saving preset for operators", () => {
        expect(operatorRequirementPresetLabel("required_on_save")).toBe("Required when saving");
    });

    it("explains locked requirement for status fields", () => {
        const status = buildFieldPolicySettingsView("opportunity", {
            field_key: "status_key",
            is_system: true,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        expect(canOperatorEditRequirementInline(status)).toBe(false);
        expect(operatorRequirementLockedReason("opportunity", "status_key", status)).toContain("status");
    });
});
