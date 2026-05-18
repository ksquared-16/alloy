import { describe, expect, it } from "vitest";
import {
    buildFieldEditModalCapabilities,
    buildFieldEditModalContext,
    operatorFieldEditModalSections,
    operatorModalSectionIsVisible,
} from "@/lib/fields/fieldEditModalOperatorUi";
import { buildFieldPolicySettingsView } from "@/lib/fields/fieldPolicySettingsUi";

describe("fieldEditModalCapabilities", () => {
    it("shows staff editability for policy-editable opportunity field", () => {
        const view = buildFieldPolicySettingsView("opportunity", {
            field_key: "name",
            is_system: true,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        const cap = buildFieldEditModalCapabilities({
            entityType: "opportunity",
            fieldKey: "name",
            policySettingsSupported: true,
            policyView: view,
        });
        expect(cap.showStaffEditabilitySelect).toBe(true);
        expect(cap.showLegacyRequiredCheckbox).toBe(false);
        expect(cap.requirementSetInTableNote).toBe(true);
    });

    it("shows locked note for status field on opportunity", () => {
        const view = buildFieldPolicySettingsView("opportunity", {
            field_key: "status_key",
            is_system: true,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        const cap = buildFieldEditModalCapabilities({
            entityType: "opportunity",
            fieldKey: "status_key",
            policySettingsSupported: true,
            policyView: view,
        });
        expect(cap.showStaffEditabilitySelect).toBe(false);
        expect(cap.showStaffEditabilityLockedNote).toBe(true);
        expect(cap.staffEditabilityLockedNote.length).toBeGreaterThan(0);
    });

    it("shows legacy required checkbox for customer entity", () => {
        const cap = buildFieldEditModalCapabilities({
            entityType: "customer",
            fieldKey: "custom_note",
            policySettingsSupported: false,
            policyView: null,
        });
        expect(cap.showLegacyRequiredCheckbox).toBe(true);
        expect(cap.showStaffEditabilitySelect).toBe(false);
    });

    it("modal sections match capability matrix", () => {
        const view = buildFieldPolicySettingsView("opportunity", {
            field_key: "status_key",
            is_system: true,
            is_required: false,
            requirement_policy: null,
            interaction_policy: null,
        });
        const ctx = buildFieldEditModalContext({ policySettingsSupported: true, policyView: view });
        expect(operatorModalSectionIsVisible("display_label", ctx)).toBe(true);
        expect(operatorModalSectionIsVisible("staff_editability", ctx)).toBe(false);
        expect(operatorModalSectionIsVisible("staff_editability_locked_note", ctx)).toBe(true);
        expect(operatorModalSectionIsVisible("developer_details", ctx)).toBe(false);
    });

    it("includes developer details only when expanded", () => {
        const ctx = buildFieldEditModalContext({
            policySettingsSupported: false,
            policyView: null,
        });
        expect(operatorFieldEditModalSections({ ...ctx, developerDetailsOpen: true })).toContain("developer_details");
    });
});
