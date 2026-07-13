/**
 * Identity / Focus Panel — full canonical field consumer convergence proofs.
 */
import { describe, expect, it, beforeEach } from "vitest";

import { availableFieldsForFocusPanelCard } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardFieldPicker";
import { availableFieldsForNestedGroup } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { defaultNestedSurfaceConfig, CHILDREN_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    legacyConceptToRefKey,
    reconcileCardFieldToCanonicalRef,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelConceptCompat";
import {
    resolveCanonicalIdentityFieldLabel,
    resolveIdentityFieldRuntimeBinding,
    isFocusPanelFieldKnown,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityCanonicalFieldMetadata";
import { resolveChildFocusEditPolicy } from "@/lib/adminV2/runtime/focusPanel/children/childFocusFieldPolicy";
import { orderedChildEditFieldKeys } from "@/lib/adminV2/runtime/focusPanel/children/childIdentityFieldRuntime";
import { resolveContactEditFieldPolicy } from "@/lib/adminV2/runtime/focusPanel/household/householdContactFieldPolicy";
import { canonicalCardFieldLabel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { categoryDisplayLabel } from "@/lib/fields/fieldCatalogForSettings";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

beforeEach(() => {
    ensureRuntimeSurfacesRegistered();
});

const PROGRAM_CUSTOM: TenantFieldDefinitionRow[] = [
    {
        field_key: "custom_program_detail",
        label: "Custom Program Detail",
        entity_type: "customer_member",
        field_type: "select",
        section_key: "program",
        config: { options: [{ value: "a", label: "Option A" }, { value: "b", label: "Option B" }] },
        is_system: false,
        is_active: true,
    },
];

describe("Identity Focus Panel canonical consumer", () => {
    it("propagates tenant section_key as canonical category for custom child fields", () => {
        const nested = availableFieldsForNestedGroup(
            CHILDREN_SURFACE_ID,
            "placement",
            defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID),
            PROGRAM_CUSTOM,
        );
        const field = nested.find((entry) => entry.key === "child.custom_program_detail");
        expect(field?.categoryKey).toBe("program");
        expect(field?.label).toBe("Custom Program Detail");
    });

    it("groups card and nested pickers under the same Program category label", () => {
        const cardFields = availableFieldsForFocusPanelCard("children", PROGRAM_CUSTOM);
        const nested = availableFieldsForNestedGroup(
            CHILDREN_SURFACE_ID,
            "identity",
            defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID),
            PROGRAM_CUSTOM,
        );
        const card = cardFields.find((entry) => entry.key === "child.custom_program_detail");
        const nestedField = nested.find((entry) => entry.key === "child.custom_program_detail");
        expect(card?.categoryKey).toBe("program");
        expect(nestedField?.categoryKey).toBe("program");
        expect(categoryDisplayLabel("program")).toBeTruthy();
    });

    it("reflects renamed Settings labels without Identity code changes", () => {
        const renamed: TenantFieldDefinitionRow[] = [{
            ...PROGRAM_CUSTOM[0]!,
            label: "Preferred Program Track",
        }];
        expect(resolveCanonicalIdentityFieldLabel("child.custom_program_detail", renamed)).toBe("Preferred Program Track");
    });

    it("reconciles legacy concept paths to canonical refKeys at compat boundary", () => {
        expect(legacyConceptToRefKey("Enrollment → Primary Contact → Phone")).toBe("person.primary_phone");
        const reconciled = reconcileCardFieldToCanonicalRef({
            id: "x",
            label: "Phone",
            concept: "Enrollment → Primary Contact → Phone",
            renderer: "text",
            placement: "collapsed",
            kind: "field",
        });
        expect(reconciled.refKey).toBe("person.primary_phone");
    });

    it("card field labels resolve from canonical metadata", () => {
        expect(
            canonicalCardFieldLabel({
                id: "fn",
                label: "Override ignored when refKey present",
                refKey: "child.first_name",
                concept: "Enrollment → Children → Name",
                renderer: "text",
                placement: "collapsed",
                kind: "field",
            }),
        ).toBe("First name");
    });

    it("native and custom fields share runtime binding shape", () => {
        const native = resolveIdentityFieldRuntimeBinding("child.first_name");
        const custom = resolveIdentityFieldRuntimeBinding("child.custom_program_detail", {
            tenantFieldDefinitions: PROGRAM_CUSTOM,
        });
        expect(native.fieldRef).toBe("child.first_name");
        expect(custom.fieldRef).toBe("child.custom_program_detail");
        expect(custom.categoryKey).toBe("program");
        expect(native.label).toBe("First name");
    });

    it("child edit policy uses canonical labels and mutation bindings", () => {
        const config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const placement = config.groups.find((group) => group.key === "placement");
        if (placement) {
            placement.selectedFieldKeys = [...placement.selectedFieldKeys, "child.custom_program_detail"];
        }
        const rows = resolveChildFocusEditPolicy(config, PROGRAM_CUSTOM);
        const custom = rows.find((row) => row.configKey === "child.custom_program_detail");
        expect(custom?.label).toBe("Custom Program Detail");
    });

    it("household contact edit policy uses canonical labels", () => {
        const rows = resolveContactEditFieldPolicy(null);
        expect(rows.find((row) => row.configKey === "contact.first_name")?.label).toBe("First name");
    });

    it("explicit empty field configuration stays empty at runtime", () => {
        const config = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        for (const group of config.groups) {
            if (group.key !== "identity") group.selectedFieldKeys = [];
        }
        expect(orderedChildEditFieldKeys(config)).toEqual([]);
    });

    it("marks unknown deleted custom fields as unresolved in canonical metadata", () => {
        expect(isFocusPanelFieldKnown("child.deleted_custom_field_xyz")).toBe(false);
    });

    it("custom Program-category field appears in Summary, Context, and Details tiers", () => {
        for (const groupKey of ["identity", "placement"] as const) {
            for (const tier of [undefined, { tier: "context_fact" as const }, { tier: "details" as const }] as const) {
                const available = availableFieldsForNestedGroup(
                    CHILDREN_SURFACE_ID,
                    groupKey,
                    defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID),
                    PROGRAM_CUSTOM,
                    tier,
                );
                expect(available.map((entry) => entry.key)).toContain("child.custom_program_detail");
            }
        }
    });
});
