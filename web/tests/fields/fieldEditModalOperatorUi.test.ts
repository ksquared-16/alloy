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
            policySettingsSupported: true,
            hasPolicyView: true,
            policyEditable: true,
            inlineRequirementEditable: true,
            developerDetailsOpen: false,
        };
        expect(operatorModalSectionIsVisible("developer_details", ctx)).toBe(false);
        expect(operatorModalSectionIsVisible("display_label", ctx)).toBe(true);
        expect(operatorModalSectionIsVisible("where_it appears", ctx)).toBe(true);
    });

    it("includes developer details only when expanded", () => {
        const ctx = {
            policySettingsSupported: true,
            hasPolicyView: true,
            policyEditable: true,
            inlineRequirementEditable: true,
            developerDetailsOpen: true,
        };
        expect(operatorFieldEditModalSections(ctx)).toContain("developer_details");
    });
});
