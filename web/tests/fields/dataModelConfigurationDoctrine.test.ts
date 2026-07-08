/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { categoryDisplayLabel } from "@/lib/fields/fieldCatalogForSettings";
import { platformRelationshipsForHubEntity } from "@/lib/fields/entityRelationshipCatalog";
import { fieldTypeOperatorLabel } from "@/lib/fields/dataModelWorkspaceOperatorUi";

const root = resolve(__dirname, "../..");

describe("Configuration workspace doctrine", () => {
    it("doctrine doc states Data Model is the reference implementation", () => {
        const doc = readFileSync(resolve(root, "../docs/doctrine/configuration-workspace-doctrine.md"), "utf8");
        expect(doc).toContain("canonical reference");
        expect(doc).toContain("Data Model");
        expect(doc).toContain("Categories");
        expect(doc).toContain("Active");
        expect(doc).toContain("Hidden");
    });

    it("field create hides implementation key by default", () => {
        const create = readFileSync(resolve(root, "components/admin/fields/DataModelFieldCreateRow.tsx"), "utf8");
        expect(create).toContain("ConfigurationAdvancedToggle");
        expect(create).toContain("inline-create-key");
        expect(create).toContain("Internal key");
        expect(create.split('data-testid="inline-create-key"')[1] ?? "").not.toContain("autoFocus");
        expect(create).toContain("Category");
        expect(create).not.toContain(">Section<");
        expect(create).toContain("ConfigurationStatusToggle");
        expect(create).not.toContain("is_visible_in_form");
    });

    it("field edit uses Category + Status, not visibility checkboxes", () => {
        const row = readFileSync(resolve(root, "components/admin/fields/DataModelFieldRow.tsx"), "utf8");
        expect(row).toContain("inline-field-category");
        expect(row).toContain("ConfigurationStatusToggle");
        expect(row).not.toContain('["is_required", "Required"]');
        expect(row).not.toContain('["is_visible_in_form", "Forms"]');
        expect(row).toContain("Derived from the field platform");
        expect(row).toContain("CONFIG_WORKSPACE_ROW_CLASS");
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
