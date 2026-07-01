import { describe, expect, it } from "vitest";
import {
    buildFieldPolicySettingsView,
    buildSimpleRequirementPolicy,
    isAdvancedRequirementPolicyForSettings,
    requirementPresetFromPolicy,
} from "@/lib/fields/fieldPolicySettingsUi";

describe("fieldPolicySettingsUi", () => {
    it("marks enforceable custom field as policy editable", () => {
        const view = buildFieldPolicySettingsView("opportunity", {
            field_key: "campus_pref",
            is_system: false,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        expect(view?.policyEditable).toBe(true);
        expect(view?.displayCategory).toBe("optional");
    });

    it("marks status_key as not enforceable", () => {
        const view = buildFieldPolicySettingsView("opportunity", {
            field_key: "status_key",
            is_system: true,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        expect(view?.policyEditable).toBe(false);
        expect(view?.displayCategory).toBe("not_enforceable");
    });

    it("detects advanced requirement policy", () => {
        const policy = {
            version: 1 as const,
            mode: "required_before_status_change" as const,
            validation_scope: "status_change" as const,
            validation_message: null,
            required_by_role: null,
            required_by_status: null,
            status_keys: ["enrolled"],
            action_keys: null,
            condition: null,
        };
        expect(isAdvancedRequirementPolicyForSettings(policy)).toBe(true);
        expect(requirementPresetFromPolicy(policy)).toBeNull();
    });

    it("maps required_on_save preset", () => {
        const policy = buildSimpleRequirementPolicy("required_on_save");
        expect(requirementPresetFromPolicy(policy)).toBe("required_on_save");
    });

    it("separates enforceable custom fields from deferred tour fields in Settings view", () => {
        const enforceable = buildFieldPolicySettingsView("opportunity", {
            field_key: "campus_pref",
            is_system: false,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        const deferred = buildFieldPolicySettingsView("opportunity", {
            field_key: "tour_date",
            is_system: true,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        expect(enforceable?.policyEditable).toBe(true);
        expect(deferred?.policyEditable).toBe(false);
        expect(deferred?.displayCategory).not.toBe("optional");
    });
});
