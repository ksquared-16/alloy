/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { categoryDisplayLabel } from "@/lib/fields/fieldCatalogForSettings";
import {
    buildConfigurationCategoryOptions,
    resolveConfigurationCategoryLabel,
} from "@/lib/adminV2/configuration/configurationCategoryCatalog";
import { platformRelationshipsForHubEntity } from "@/lib/fields/entityRelationshipCatalog";
import { fieldTypeOperatorLabel } from "@/lib/fields/dataModelWorkspaceOperatorUi";

const root = resolve(__dirname, "../..");

describe("Configuration workspace doctrine", () => {
    it("doctrine doc states Data Model is the reference implementation", () => {
        const doc = readFileSync(resolve(root, "../docs/doctrine/configuration-workspace-doctrine.md"), "utf8");
        expect(doc).toContain("canonical reference");
        expect(doc).toContain("Data Model");
        expect(doc).toContain("Overview summarizes");
        expect(doc).toContain("Tabs edit");
        expect(doc).toContain("Business concepts first");
        expect(doc).toContain("entity-owned");
        expect(doc).toContain("Forms");
        expect(doc).toContain("Surface Builder");
        expect(doc).toContain("Categories");
        expect(doc).toContain("Active");
        expect(doc).toContain("Hidden");
    });

    it("categories tab is first-class — entity-owned, not in field create", () => {
        const tabs = readFileSync(resolve(root, "components/admin/fields/DataModelWorkspaceTabs.tsx"), "utf8");
        const fieldsTab = readFileSync(resolve(root, "components/admin/fields/DataModelFieldsTab.tsx"), "utf8");
        const client = readFileSync(resolve(root, "app/adminV2/settings/fields/DataModelWorkspaceClient.tsx"), "utf8");
        expect(tabs).toContain('"categories"');
        expect(tabs).toContain("Categories");
        expect(tabs).not.toContain("computed_signals");
        expect(client).toContain("DataModelCategoriesTab");
        expect(fieldsTab).not.toContain("ConfigurationCategoryCreateRow");
        expect(fieldsTab).not.toContain("fields-tab-add-category");
    });

    it("categories are entity-scoped — person does not inherit child medical", () => {
        const personOptions = buildConfigurationCategoryOptions("person", [], []);
        const childOptions = buildConfigurationCategoryOptions("inquiry_child", [], []);
        expect(personOptions.some((o) => o.value === "medical")).toBe(false);
        expect(childOptions.some((o) => o.value === "medical")).toBe(true);
        expect(personOptions.some((o) => o.value === "employment")).toBe(true);
        expect(childOptions.some((o) => o.value === "employment")).toBe(false);
    });

    it("categories merge org registry with entity seeds", () => {
        const options = buildConfigurationCategoryOptions(
            "location",
            [{ section_key: "licensing", label: "Site Licensing", sort_order: 5 }],
            ["identity"],
        );
        expect(options.some((o) => o.value === "licensing")).toBe(true);
        expect(options.some((o) => o.value === "programs")).toBe(true);
        expect(options.some((o) => o.value === "medical")).toBe(false);
        expect(
            resolveConfigurationCategoryLabel("licensing", [
                { section_key: "licensing", label: "Site Licensing", sort_order: 5 },
            ]),
        ).toBe("Site Licensing");
    });

    it("field create stays business-first with no Advanced disclosure", () => {
        const create = readFileSync(resolve(root, "components/admin/fields/DataModelFieldCreateRow.tsx"), "utf8");
        expect(create).not.toContain("ConfigurationAdvancedToggle");
        expect(create).not.toContain("inline-create-key");
        expect(create).toContain("Field name");
        expect(create).toContain("Category");
        expect(create).not.toContain(">Section<");
        expect(create).toContain("ConfigurationStatusToggle");
        expect(create).not.toContain("is_visible_in_form");
    });

    it("field edit exposes Advanced + internal key only when editing", () => {
        const row = readFileSync(resolve(root, "components/admin/fields/DataModelFieldRow.tsx"), "utf8");
        expect(row).toContain("inline-field-category");
        expect(row).toContain("ConfigurationStatusToggle");
        expect(row).toContain("ConfigurationAdvancedToggle");
        expect(row).toContain("inline-field-key");
        expect(row).not.toContain("data-model-field-availability-hint");
        expect(row).toContain("data-model-field-unavailable-hint");
        expect(row).not.toContain('["is_required", "Required"]');
        expect(row).not.toContain('["is_visible_in_form", "Forms"]');
        expect(row).toContain("CONFIG_WORKSPACE_ROW_INNER_CLASS");
        expect(
            readFileSync(
                resolve(root, "lib/adminV2/configuration/configurationWorkspaceOperatorUi.ts"),
                "utf8",
            ),
        ).toContain("CONFIG_WORKSPACE_ROW_CLASS");
    });

    it("relationship create uses business language and hides key by default", () => {
        const create = readFileSync(resolve(root, "components/admin/fields/DataModelRelationshipCreateRow.tsx"), "utf8");
        expect(create).toContain("RELATIONSHIP_KIND_OPERATOR_OPTIONS");
        expect(create).not.toContain("customer ↔ person");
        expect(create).toContain("ConfigurationAdvancedToggle");
        expect(create.split('data-testid="inline-relationship-key"')[1] ?? "").not.toContain("autoFocus");
    });

    it("relationships tab separates platform and custom", () => {
        const tab = readFileSync(resolve(root, "components/admin/fields/DataModelRelationshipsTab.tsx"), "utf8");
        expect(tab).toContain("platform-relationships-section");
        expect(tab).toContain("custom-relationships-section");
        expect(tab).toContain("person-roles-teaching");
        expect(tab).toContain("DataModelCustomRelationshipRow");
        expect(tab).toContain("PERSON_ROLES_TEACHING");
    });

    it("platform relationships use business connection language", () => {
        const child = platformRelationshipsForHubEntity("inquiry_child");
        const parent = child.find((r) => r.id === "child.parent_guardian");
        expect(parent?.connection_label).toBeTruthy();
        expect(parent?.meaning).toContain("parent or guardian");
        expect(parent?.kind).toBe("platform");
    });

    it("categories use operator-facing labels", () => {
        expect(categoryDisplayLabel("identity")).toBe("Identity");
        expect(categoryDisplayLabel("billing")).toBe("Billing");
        expect(categoryDisplayLabel("scheduling")).toBe("Scheduling");
        expect(fieldTypeOperatorLabel("boolean")).toBe("Yes / No");
    });
});
