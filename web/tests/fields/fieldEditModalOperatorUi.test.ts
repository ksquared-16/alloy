import { describe, expect, it } from "vitest";
import {
    operatorFieldEditModalSections,
    operatorModalShowsDeveloperDetailsByDefault,
    operatorModalSectionIsVisible,
} from "@/lib/fields/fieldEditModalOperatorUi";

describe("fieldEditModalOperatorUi", () => {
    it("does not show developer details by default", () => {
        expect(operatorModalShowsDeveloperDetailsByDefault()).toBe(false);
        const ctx = {
            entityType: "customer",
            policySettingsSupported: true,
            hasPolicyView: true,
            policyEditable: true,
            layoutBehaviorOnRecordLayouts: false,
            inlineRequirementEditable: true,
            developerDetailsOpen: false,
        };
        expect(operatorModalSectionIsVisible("developer_details", ctx)).toBe(false);
        expect(operatorModalSectionIsVisible("display_label", ctx)).toBe(true);
        expect(operatorModalSectionIsVisible("where_it_appears", ctx)).toBe(true);
    });

    it("includes developer details only when expanded", () => {
        const ctx = {
            entityType: "customer",
            policySettingsSupported: true,
            hasPolicyView: true,
            policyEditable: true,
            layoutBehaviorOnRecordLayouts: false,
            inlineRequirementEditable: true,
            developerDetailsOpen: true,
        };
        expect(operatorFieldEditModalSections(ctx)).toContain("developer_details");
    });

    it("shows legacy required for non-policy entities", () => {
        const ctx = {
            entityType: "vendor",
            policySettingsSupported: false,
            hasPolicyView: false,
            policyEditable: false,
            layoutBehaviorOnRecordLayouts: false,
            inlineRequirementEditable: false,
            developerDetailsOpen: false,
        };
        expect(operatorModalSectionIsVisible("legacy_required_checkbox", ctx)).toBe(true);
        expect(operatorModalSectionIsVisible("staff_editability", ctx)).toBe(false);
    });
});
