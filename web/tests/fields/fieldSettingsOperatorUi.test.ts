import { describe, expect, it } from "vitest";
import {
    isOperatorHiddenField,
    operatorFieldDisplayLabel,
    operatorPolicyColumnLabel,
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

    it("maps policy column to operator language", () => {
        const enforceable = buildFieldPolicySettingsView("opportunity", {
            field_key: "campus_pref",
            is_system: false,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        expect(operatorPolicyColumnLabel(enforceable, false)).toBe("Optional");

        const status = buildFieldPolicySettingsView("opportunity", {
            field_key: "status_key",
            is_system: true,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        expect(operatorPolicyColumnLabel(status, false)).toBe("Configured elsewhere");
    });
});
