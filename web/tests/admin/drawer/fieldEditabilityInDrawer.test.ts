import { describe, expect, it } from "vitest";
import {
    applyPolicyChromeToOverviewSections,
    buildDrawerFieldPolicyChromeFromEntityData,
} from "@/lib/admin/drawer/fieldEditabilityInDrawer";
import { buildSimpleInteractionPolicy, buildSimpleRequirementPolicy } from "@/lib/fields/fieldPolicySettingsUi";

describe("fieldEditabilityInDrawer", () => {
    it("marks enforceable required field with asterisk", () => {
        const chrome = buildDrawerFieldPolicyChromeFromEntityData(
            {
                _field_definitions: [
                    {
                        field_key: "name",
                        is_system: true,
                        is_required: true,
                        requirement_policy: buildSimpleRequirementPolicy("required"),
                        interaction_policy: buildSimpleInteractionPolicy("editable", "opportunity", "name"),
                    },
                ],
                _field_policy_resolved: {
                    name: {
                        entityType: "opportunity",
                        fieldKey: "name",
                        storage: "column",
                        bodyKey: "name",
                        policyMode: "enforceable",
                        requirementSupported: true,
                        interactionSupported: true,
                        reason: "test",
                    },
                },
            },
            "opportunities"
        );
        expect(chrome.name?.showRequired).toBe(true);
        expect(chrome.name?.readOnly).toBe(false);
    });

    it("marks read-only policy on field config", () => {
        const chrome = buildDrawerFieldPolicyChromeFromEntityData(
            {
                _field_definitions: [
                    {
                        field_key: "name",
                        is_system: true,
                        requirement_policy: buildSimpleRequirementPolicy("optional"),
                        interaction_policy: buildSimpleInteractionPolicy("read_only", "opportunity", "name"),
                    },
                ],
                _field_policy_resolved: {
                    name: {
                        entityType: "opportunity",
                        fieldKey: "name",
                        storage: "column",
                        bodyKey: "name",
                        policyMode: "enforceable",
                        requirementSupported: true,
                        interactionSupported: true,
                        reason: "test",
                    },
                },
            },
            "opportunities"
        );
        const sections = applyPolicyChromeToOverviewSections(
            [{ key: "s", title: "S", fields: [{ key: "name", label: "Name", editable: true }], defaultExpanded: true, collapsible: true, gridCols: 2 }],
            chrome
        );
        expect(sections[0]?.fields[0]?.editable).toBe(false);
    });

    it("placement required_on_save shows asterisk", () => {
        const chrome = buildDrawerFieldPolicyChromeFromEntityData(
            {
                _field_definitions: [
                    {
                        field_key: "custom_notes",
                        is_system: false,
                        is_required: false,
                        requirement_policy: buildSimpleRequirementPolicy("optional"),
                        interaction_policy: buildSimpleInteractionPolicy("editable", "opportunity", "custom_notes"),
                    },
                ],
                _field_policy_resolved: {
                    custom_notes: {
                        entityType: "opportunity",
                        fieldKey: "custom_notes",
                        storage: "field_values",
                        bodyKey: "custom_notes",
                        policyMode: "enforceable",
                        requirementSupported: true,
                        interactionSupported: true,
                        reason: "test",
                        requirement: buildSimpleRequirementPolicy("required_on_save"),
                        requirement_source: "placement",
                        interaction: buildSimpleInteractionPolicy("editable", "opportunity", "custom_notes"),
                        interaction_source: "definition",
                    },
                },
            },
            "opportunities"
        );
        expect(chrome.custom_notes?.showRequired).toBe(true);
    });

    it("placement optional overrides definition required", () => {
        const chrome = buildDrawerFieldPolicyChromeFromEntityData(
            {
                _field_definitions: [
                    {
                        field_key: "custom_notes",
                        is_system: false,
                        is_required: true,
                        requirement_policy: buildSimpleRequirementPolicy("required"),
                    },
                ],
                _field_policy_resolved: {
                    custom_notes: {
                        entityType: "opportunity",
                        fieldKey: "custom_notes",
                        storage: "field_values",
                        bodyKey: "custom_notes",
                        policyMode: "enforceable",
                        requirementSupported: true,
                        interactionSupported: true,
                        reason: "test",
                        requirement: buildSimpleRequirementPolicy("optional"),
                        requirement_source: "placement",
                    },
                },
            },
            "opportunities"
        );
        expect(chrome.custom_notes?.showRequired).toBe(false);
    });

    it("placement read_only overrides definition editable", () => {
        const chrome = buildDrawerFieldPolicyChromeFromEntityData(
            {
                _field_definitions: [
                    {
                        field_key: "custom_notes",
                        is_system: false,
                        interaction_policy: buildSimpleInteractionPolicy("editable", "opportunity", "custom_notes"),
                    },
                ],
                _field_policy_resolved: {
                    custom_notes: {
                        entityType: "opportunity",
                        fieldKey: "custom_notes",
                        storage: "field_values",
                        bodyKey: "custom_notes",
                        policyMode: "enforceable",
                        requirementSupported: true,
                        interactionSupported: true,
                        reason: "test",
                        interaction: buildSimpleInteractionPolicy("read_only", "opportunity", "custom_notes"),
                        interaction_source: "placement",
                    },
                },
            },
            "opportunities"
        );
        expect(chrome.custom_notes?.readOnly).toBe(true);
    });

    it("skips deferred fields", () => {
        const chrome = buildDrawerFieldPolicyChromeFromEntityData(
            {
                _field_definitions: [{ field_key: "status_key", is_system: true }],
                _field_policy_resolved: {
                    status_key: {
                        entityType: "opportunity",
                        fieldKey: "status_key",
                        storage: "column",
                        bodyKey: "status_key",
                        policyMode: "deferred",
                        requirementSupported: false,
                        interactionSupported: false,
                        reason: "deferred",
                    },
                },
            },
            "opportunities"
        );
        expect(chrome.status_key).toBeUndefined();
    });
});
