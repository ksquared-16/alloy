/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    archivedCategoryKeys,
    buildActiveConfigurationCategoryPickerOptions,
    buildConfigurationCategoryOptions,
    resolveConfigurationCategoryLabel,
} from "@/lib/adminV2/configuration/configurationCategoryCatalog";
import {
    buildSettingsFieldCatalogEntries,
    catalogEntrySectionKey,
    fieldRowEditCapability,
    groupCatalogEntriesBySection,
    hubEntityApiTypes,
    type SettingsFieldCatalogEntry,
} from "@/lib/fields/fieldCatalogForSettings";
import type { FieldDef } from "@/app/api/admin/field-definitions/route";

const root = resolve(__dirname, "../..");

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
    const section_key = overrides.section_key ?? overrides.fieldDef?.section_key ?? "custom";
    const fieldDefRow = fieldDef({
        ...(overrides.fieldDef ?? {}),
        section_key: overrides.fieldDef?.section_key ?? section_key,
    });
    const { section_key: _sectionOverride, fieldDef: _fieldDefOverride, ...rest } = overrides;
    return {
        id: "custom:fd-1",
        ownership: "custom",
        refKey: "person.preferred_name",
        label: "Preferred name",
        field_type: "text",
        section_key,
        entity_type: "person",
        editable: true,
        configurable: true,
        fieldDef: fieldDefRow,
        ...rest,
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
            entry({
                id: "custom:fd-legacy",
                refKey: "person.legacy",
                section_key: "legacy_notes",
                fieldDef: fieldDef({ field_key: "legacy", section_key: "legacy_notes" }),
            }),
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

    it("archived org category matching entity seed is excluded from Add Field picker", () => {
        const registry = [{ section_key: "contact", label: "Contact", sort_order: 20, is_archived: true }];
        const picker = buildActiveConfigurationCategoryPickerOptions("person", registry);
        expect(picker.some((o) => o.value === "contact")).toBe(false);
        expect(picker.some((o) => o.value === "identity")).toBe(true);
    });

    it("Edit Field picker excludes archived basic/profile and unrelated categories for Person", () => {
        const registry = [
            { section_key: "basic", label: "Basic", sort_order: 5, is_archived: true },
            { section_key: "profile", label: "Profile", sort_order: 6, is_archived: true },
            { section_key: "medical", label: "Medical", sort_order: 7, is_archived: false },
            { section_key: "notes", label: "Notes", sort_order: 8, is_archived: false },
        ];
        const picker = buildActiveConfigurationCategoryPickerOptions("person", registry);
        expect(picker.some((o) => o.value === "basic")).toBe(false);
        expect(picker.some((o) => o.value === "profile")).toBe(false);
        expect(picker.some((o) => o.value === "medical")).toBe(false);
        expect(picker.some((o) => o.value === "notes")).toBe(true);
        expect(picker.some((o) => o.value === "identity")).toBe(true);
        expect(picker.some((o) => o.value === "contact")).toBe(true);
        expect(picker.some((o) => o.value === "employment")).toBe(true);
        expect(picker.some((o) => o.value === "emergency_contacts")).toBe(true);
        expect(picker.some((o) => o.value === "custom")).toBe(true);
    });

    it("Add Field and Edit Field share the same active picker source in Fields tab", () => {
        const fieldsTab = readFileSync(resolve(root, "components/admin/fields/DataModelFieldsTab.tsx"), "utf8");
        const fieldRow = readFileSync(resolve(root, "components/admin/fields/DataModelFieldRow.tsx"), "utf8");
        const createRow = readFileSync(resolve(root, "components/admin/fields/DataModelFieldCreateRow.tsx"), "utf8");
        expect(fieldsTab).toContain("buildActiveConfigurationCategoryPickerOptions");
        expect(fieldsTab).toContain("activeCategoryOptions");
        expect(fieldsTab).toContain("activeCategoryOptions={activeCategoryOptions}");
        expect(fieldsTab).not.toContain("buildConfigurationCategoryOptions");
        expect(fieldsTab).not.toContain("categoryOptions={");
        expect(fieldRow).toContain("activeCategoryOptions");
        expect(fieldRow).not.toContain("categoryOptions?:");
        expect(fieldRow).not.toContain("value={draft.category_key}");
        expect(createRow).toContain("activeCategoryOptions");
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

describe("Data Model QA — category reassignment grouping", () => {
    it("persisted section_key moves custom field into the new category group", () => {
        const before = buildSettingsFieldCatalogEntries({
            hubEntity: "person",
            entityTypes: hubEntityApiTypes("person"),
            customFields: [fieldDef({ field_key: "nickname", section_key: "custom", label: "Nickname" })],
        });
        const beforeGroups = groupCatalogEntriesBySection(before);
        expect(beforeGroups.get("custom")?.some((e) => e.refKey === "person.nickname")).toBe(true);
        expect(beforeGroups.get("contact")?.some((e) => e.refKey === "person.nickname")).toBe(false);

        const after = buildSettingsFieldCatalogEntries({
            hubEntity: "person",
            entityTypes: hubEntityApiTypes("person"),
            customFields: [fieldDef({ field_key: "nickname", section_key: "contact", label: "Nickname" })],
        });
        const afterGroups = groupCatalogEntriesBySection(after);
        expect(afterGroups.get("custom")?.some((e) => e.refKey === "person.nickname") ?? false).toBe(false);
        expect(afterGroups.get("contact")?.some((e) => e.refKey === "person.nickname")).toBe(true);
    });

    it("platform-native field uses field_definitions section_key for grouping, not catalog default", () => {
        const entries = buildSettingsFieldCatalogEntries({
            hubEntity: "person",
            entityTypes: hubEntityApiTypes("person"),
            customFields: [
                fieldDef({
                    field_key: "email",
                    is_system: true,
                    section_key: "employment",
                    label: "Work email",
                }),
            ],
        });
        const email = entries.find((e) => e.refKey === "person.email");
        expect(email?.ownership).toBe("platform");
        expect(email?.fieldDef?.section_key).toBe("employment");
        expect(catalogEntrySectionKey(email!)).toBe("employment");
        const groups = groupCatalogEntriesBySection(entries);
        expect(groups.get("contact")?.some((e) => e.refKey === "person.email")).toBe(false);
        expect(groups.get("employment")?.some((e) => e.refKey === "person.email")).toBe(true);
    });

    it("system platform field with field_definition allows presentation category edit", () => {
        const entries = buildSettingsFieldCatalogEntries({
            hubEntity: "person",
            entityTypes: hubEntityApiTypes("person"),
            customFields: [fieldDef({ field_key: "email", is_system: true, section_key: "contact" })],
        });
        const email = entries.find((e) => e.refKey === "person.email");
        expect(email).toBeTruthy();
        const cap = fieldRowEditCapability(email!, true);
        expect(cap.mode).toBe("presentation");
        expect(cap.canEditCategory).toBe(true);
    });
});

describe("Data Model QA — archived category lifecycle", () => {
    it("archived category with no referencing fields does not produce a workspace group", () => {
        const entries = [
            entry({
                id: "custom:fd-1",
                refKey: "person.preferred_name",
                section_key: "identity",
                fieldDef: fieldDef({ field_key: "preferred_name", section_key: "identity" }),
            }),
        ];
        const groups = groupCatalogEntriesBySection(entries);
        expect(groups.has("legacy_notes")).toBe(false);
        expect(groups.get("identity")?.length).toBe(1);
    });
});
