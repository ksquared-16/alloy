/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_MODEL_FIELD_TYPE_ICONS } from "@/lib/fields/dataModelWorkspaceIcons";

const root = resolve(__dirname, "../..");

describe("Data Model inline UX pass", () => {
    it("workspace owns fields via DataModelFieldsTab (no EntityFieldsClient / drawer / modal)", () => {
        const client = readFileSync(resolve(root, "app/adminV2/settings/fields/DataModelWorkspaceClient.tsx"), "utf8");
        expect(client).toContain("DataModelFieldsTab");
        expect(client).toContain("DataModelRelationshipsTab");
        expect(client).not.toContain("EntityFieldsClient");
        expect(client).not.toContain("FieldDetailDrawer");
        expect(client).not.toContain("DataModelAddRelationshipModal");
        expect(client).not.toContain("FieldDefinitionEditModal");
    });

    it("fields use expandable rows with inline create — not FieldCatalogCard", () => {
        const fieldsTab = readFileSync(resolve(root, "components/admin/fields/DataModelFieldsTab.tsx"), "utf8");
        const fieldRow = readFileSync(resolve(root, "components/admin/fields/DataModelFieldRow.tsx"), "utf8");
        const createRow = readFileSync(resolve(root, "components/admin/fields/DataModelFieldCreateRow.tsx"), "utf8");
        expect(fieldsTab).toContain("DataModelFieldRow");
        expect(fieldsTab).toContain("DataModelFieldCreateRow");
        expect(fieldsTab).toContain('method: "PATCH"');
        expect(fieldsTab).toContain('method: "POST"');
        expect(fieldsTab).not.toContain("FieldCatalogCard");
        expect(fieldsTab).not.toContain("FieldDetailDrawer");
        expect(fieldsTab).not.toContain("FieldDefinitionEditModal");
        expect(fieldRow).toContain('data-testid="data-model-field-row"');
        expect(fieldRow).toContain('data-testid="data-model-field-editor"');
        expect(createRow).toContain('data-testid="data-model-field-create-row"');
        expect(createRow).toContain("Category");
        expect(createRow).not.toContain("ConfigurationAdvancedToggle");
    });

    it("relationships use rows + inline create (no modal)", () => {
        const relTab = readFileSync(resolve(root, "components/admin/fields/DataModelRelationshipsTab.tsx"), "utf8");
        const create = readFileSync(
            resolve(root, "components/admin/fields/DataModelRelationshipCreateRow.tsx"),
            "utf8",
        );
        expect(relTab).toContain("DataModelRelationshipRow");
        expect(relTab).toContain("DataModelRelationshipCreateRow");
        expect(relTab).toContain("platform-relationships-section");
        expect(relTab).not.toContain("DataModelAddRelationshipModal");
        expect(create).toContain("customer-person-role-types");
        expect(create).toContain("person-relationship-type-settings");
        expect(create).not.toContain("fixed inset-0");
    });

    it("entity header compresses metrics into a single line", () => {
        const header = readFileSync(resolve(root, "components/admin/fields/DataModelEntityHeader.tsx"), "utf8");
        expect(header).toContain("data-model-entity-metrics");
        expect(header).not.toContain("data-model-stat-fields");
        expect(header).not.toContain("grid-cols-4");
    });

    it("field type icons share Lucide language", () => {
        expect(DATA_MODEL_FIELD_TYPE_ICONS.text).toBeTruthy();
        expect(DATA_MODEL_FIELD_TYPE_ICONS.select).toBeTruthy();
        expect(DATA_MODEL_FIELD_TYPE_ICONS.boolean).toBeTruthy();
    });
});
