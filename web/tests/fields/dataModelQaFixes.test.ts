/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    archivedCategoryKeys,
    buildConfigurationCategoryOptions,
    resolveConfigurationCategoryLabel,
} from "@/lib/adminV2/configuration/configurationCategoryCatalog";
import {
    fieldRowEditCapability,
    groupCatalogEntriesBySection,
    type SettingsFieldCatalogEntry,
} from "@/lib/fields/fieldCatalogForSettings";
import type { FieldDef } from "@/app/api/admin/field-definitions/route";

function fieldDef(overrides: Partial<FieldDef> = {}): FieldDef {
    return {
        id: "fd-1",
        org_id: "org-1",
        entity_type: "person",
        field_key: "preferred_name",
        field_type: "text",
        label: "Preferred name",
        description: null,
        is_system: false,
        is_required: false,
        is_active: true,
        is_visible_in_form: true,
        is_visible_in_drawer: true,
        is_visible_in_table: true,
        is_filterable: false,
        is_sortable: false,
        section_key: "custom",
        sort_order: 100,
        placeholder: null,
        help_text: null,
        config: null,
        is_visible_in_public_booking: false,
        requirement_policy: null,
        interaction_policy: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

function entry(overrides: Partial<SettingsFieldCatalogEntry> = {}): SettingsFieldCatalogEntry {
    return {
        id: "custom:fd-1",
        ownership: "custom",
        refKey: "person.preferred_name",
        label: "Preferred name",
        field_type: "text",
        section_key: "custom",
        entity_type: "person",
        editable: true,
        configurable: true,
        fieldDef: fieldDef(),
        ...overrides,
    };
}

describe("Data Model QA — archived categories", () => {
    it("archived category is excluded from the picker even when a field still uses it", () => {
        const registry = [
            { section_key: "identity", label: "Identity", sort_order: 10, is_archived: false },
            { section_key: "legacy_notes", label: "Legacy Notes", sort_order: 20, is_archived: true },
        ];
        const options = buildConfigurationCategoryOptions("person", registry, ["legacy_notes", "identity"]);
        expect(options.some((o) => o.value === "legacy_notes")).toBe(false);
        expect(options.some((o) => o.value === "identity")).toBe(true);
        expect(archivedCategoryKeys(registry).has("legacy_notes")).toBe(true);
    });

    it("fields referencing an archived category remain visible and grouped, not lost", () => {
        const registry = [{ section_key: "legacy_notes", label: "Legacy Notes", sort_order: 20, is_archived: true }];
        const entries = [
            entry({ id: "custom:fd-legacy", refKey: "person.legacy", section_key: "legacy_notes" }),
        ];
        const groups = groupCatalogEntriesBySection(entries);
        expect(groups.get("legacy_notes")?.length).toBe(1);
        // Group can still render a human label even though the category is archived.
        expect(resolveConfigurationCategoryLabel("legacy_notes", registry, "person")).toBe("Legacy Notes");
    });

    it("archived category does not leak, and entity scoping keeps others intact", () => {
        // Even if a person somehow carried a 'medical' row, archiving removes it from the picker,
        // and 'medical' is not a person seed. Child (a different entity) still owns Medical.
        const personRegistry = [{ section_key: "medical", label: "Medical", sort_order: 30, is_archived: true }];
        const personOptions = buildConfigurationCategoryOptions("person", personRegistry, ["medical"]);
        expect(personOptions.some((o) => o.value === "medical")).toBe(false);
        expect(personOptions.some((o) => o.value === "employment")).toBe(true);

        const childOptions = buildConfigurationCategoryOptions("inquiry_child", [], []);
        expect(childOptions.some((o) => o.value === "medical")).toBe(true);
    });
});

describe("Data Model QA — platform/system field organization overrides", () => {
    it("pure platform-catalog field is view-only", () => {
        const cap = fieldRowEditCapability(entry({ ownership: "platform", fieldDef: undefined, configurable: false }), true);
        expect(cap.mode).toBe("view");
        expect(cap.canEditLabel).toBe(false);
        expect(cap.canDelete).toBe(false);
    });

    it("computed field is view-only", () => {
        const cap = fieldRowEditCapability(entry({ ownership: "computed", fieldDef: undefined, configurable: false }), true);
        expect(cap.mode).toBe("view");
    });

    it("system field_definition allows label + category, never type/storage/delete", () => {
        const cap = fieldRowEditCapability(
            entry({ configurable: false, fieldDef: fieldDef({ is_system: true }) }),
            true,
        );
        expect(cap.mode).toBe("presentation");
        expect(cap.canEditLabel).toBe(true);
        expect(cap.canEditCategory).toBe(true);
        expect(cap.canEditDescription).toBe(true);
        expect(cap.canEditType).toBe(false);
        expect(cap.canEditStatus).toBe(false);
        expect(cap.canDelete).toBe(false);
    });

    it("tenant custom field allows full editing including delete", () => {
        const cap = fieldRowEditCapability(entry(), true);
        expect(cap.mode).toBe("full");
        expect(cap.canEditLabel).toBe(true);
        expect(cap.canEditCategory).toBe(true);
        expect(cap.canDelete).toBe(true);
        expect(cap.canEditType).toBe(false);
    });

    it("no mutate permission means view-only for every ownership", () => {
        expect(fieldRowEditCapability(entry(), false).mode).toBe("view");
        expect(fieldRowEditCapability(entry({ fieldDef: fieldDef({ is_system: true }), configurable: false }), false).mode).toBe(
            "view",
        );
    });
});
