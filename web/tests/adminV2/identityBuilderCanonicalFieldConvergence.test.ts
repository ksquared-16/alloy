/**
 * Identity Builder — canonical field platform convergence proofs.
 *
 * Identity nested-surface pickers must derive from Settings → Fields via the
 * canonical provider registry (focus_panel consumer), not a parallel catalog.
 */
import { describe, expect, it, beforeEach } from "vitest";

import { availableFieldsForNamespaces } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import { identityPickerFieldsForNamespaces } from "@/lib/adminV2/settings/surfaces/identityPickerFieldCatalog";
import {
    availableFieldsForNestedGroup,
    CHILDREN_SURFACE_ID,
    defaultNestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    buildNestedSurfaceLibraryForGroup,
    nestedSurfaceLibraryCategories,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceBuilderLibrary";
import { assembleFocusPanelNestedProviders } from "@/lib/fields/consumerCanonicalProviderAssembly";
import { canonicalPickerIdentityForRefKey } from "@/lib/fields/canonicalProviderDedup";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

beforeEach(() => {
    ensureRuntimeSurfacesRegistered();
});

describe("Identity Builder canonical field convergence", () => {
    it("derives nested-surface picker fields from focus_panel consumer assembly", () => {
        const namespaces = ["child", "inquiry_child"] as const;
        const expectedKeys = new Set(
            assembleFocusPanelNestedProviders()
                .filter((provider) => namespaces.includes(provider.entityNamespace as (typeof namespaces)[number]))
                .map((provider) => canonicalPickerIdentityForRefKey(provider.refKey)),
        );
        const pickerKeys = new Set(identityPickerFieldsForNamespaces({ namespaces }).map((field) => field.key));
        for (const key of pickerKeys) {
            expect(expectedKeys.has(key)).toBe(true);
        }
        expect(pickerKeys.has("child.room")).toBe(false);
        expect(pickerKeys.has("child.schedule")).toBe(false);
    });

    it("includes platform child first/last name fields from canonical registry", () => {
        const fields = availableFieldsForNamespaces(["child"]);
        const keys = fields.map((field) => field.key);
        expect(keys).toContain("child.first_name");
        expect(keys).toContain("child.last_name");
    });

    it("uses canonical provider labels (not consumer-local overrides)", () => {
        const fields = availableFieldsForNamespaces(["child"]);
        const firstName = fields.find((field) => field.key === "child.first_name");
        const provider = assembleFocusPanelNestedProviders().find((entry) => entry.refKey === "child.first_name");
        expect(firstName?.label).toBe(provider?.label);
        expect(firstName?.label).toBe("First name");
    });

    it("automatically offers a tenant custom field in Children placement without code changes", () => {
        const custom: TenantFieldDefinitionRow[] = [
            {
                field_key: "summer_program_notes",
                label: "Summer program notes",
                entity_type: "customer_member",
                field_type: "text",
                is_system: false,
                is_active: true,
            },
        ];
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const available = availableFieldsForNestedGroup(CHILDREN_SURFACE_ID, "placement", cfg, custom);
        expect(available.map((field) => field.key)).toContain("child.summer_program_notes");
        expect(available.find((field) => field.key === "child.summer_program_notes")?.isSystemField).toBe(false);
    });

    it("reflects renamed Settings → Fields labels through the canonical provider", () => {
        const custom: TenantFieldDefinitionRow[] = [
            {
                field_key: "program_preference",
                label: "Preferred Program Track",
                entity_type: "customer_member",
                field_type: "text",
                is_system: false,
                is_active: true,
            },
        ];
        const fields = availableFieldsForNamespaces(["child"], custom);
        const field = fields.find((entry) => entry.key === "child.program_preference");
        expect(field?.label).toBe("Preferred Program Track");
    });

    it("children identity picker has no duplicate field refs", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const available = availableFieldsForNestedGroup(CHILDREN_SURFACE_ID, "identity", cfg);
        const keys = available.map((field) => field.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).not.toContain("child.room");
        expect(keys).not.toContain("child.dob_age");
    });

    it("groups Identity library items by canonical field category", () => {
        const cfg = defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID);
        const items = buildNestedSurfaceLibraryForGroup(CHILDREN_SURFACE_ID, "identity", cfg);
        const categories = nestedSurfaceLibraryCategories(items);
        expect(categories.length).toBeGreaterThan(0);
        for (const category of categories) {
            expect(category.label.trim()).not.toBe("");
            expect(category.items.length).toBeGreaterThan(0);
        }
        const categoryKeys = new Set(items.map((item) => item.categoryKey));
        expect(categories.map((category) => category.key).sort()).toEqual([...categoryKeys].sort());
    });
});
