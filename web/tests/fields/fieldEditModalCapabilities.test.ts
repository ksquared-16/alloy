import { describe, expect, it } from "vitest";
import {
    buildFieldEditModalCapabilities,
    buildFieldEditModalContext,
    operatorFieldEditModalSections,
    operatorModalSectionIsVisible,
} from "@/lib/fields/fieldEditModalOperatorUi";
import { buildFieldPolicySettingsView } from "@/lib/fields/fieldPolicySettingsUi";

describe("fieldEditModalCapabilities", () => {
    it("hides policy controls for opportunity — layout behavior note instead", () => {
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
        expect(cap.showStaffEditabilitySelect).toBe(false);
        expect(cap.showLegacyRequiredCheckbox).toBe(false);
        expect(cap.showLayoutBehaviorNote).toBe(true);
        expect(cap.layoutBehaviorNote).toContain("Record layouts");
    });

    it("uses layout behavior note for deferred status field on opportunity", () => {
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
        expect(cap.showLayoutBehaviorNote).toBe(true);
        expect(cap.showStaffEditabilityLockedNote).toBe(false);
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
        const ctx = buildFieldEditModalContext({
            entityType: "opportunity",
            policySettingsSupported: true,
            policyView: view,
        });
        expect(operatorModalSectionIsVisible("display_label", ctx)).toBe(true);
        expect(operatorModalSectionIsVisible("layout_behavior_note", ctx)).toBe(true);
        expect(operatorModalSectionIsVisible("staff_editability", ctx)).toBe(false);
        expect(operatorModalSectionIsVisible("staff_editability_locked_note", ctx)).toBe(false);
        expect(operatorModalSectionIsVisible("developer_details", ctx)).toBe(false);
    });

    it("includes developer details only when expanded", () => {
        const ctx = buildFieldEditModalContext({
            entityType: "customer",
            policySettingsSupported: false,
            policyView: null,
        });
        expect(operatorFieldEditModalSections({ ...ctx, developerDetailsOpen: true })).toContain("developer_details");
    });
});
