/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    computedSignalPreviewGroups,
    previewFieldSections,
} from "@/lib/fields/dataModelWorkspaceModel";
import { buildSettingsFieldCatalogEntries, hubEntityApiTypes } from "@/lib/fields/fieldCatalogForSettings";
import {
    focusPanelConceptToLayoutRefKey,
    focusPanelSurfaceStatus,
} from "@/lib/adminV2/settings/surfaces/focusPanelFieldAvailability";
import { DATA_MODEL_ENTITY_ICONS } from "@/lib/fields/dataModelWorkspaceIcons";

const root = resolve(__dirname, "../..");

describe("Data Model finish pass", () => {
    it("entity rail uses lucide icons (no emoji)", () => {
        const nav = readFileSync(resolve(root, "components/admin/fields/FieldEntityNav.tsx"), "utf8");
        expect(nav).toContain("DATA_MODEL_ENTITY_ICONS");
        expect(nav).toContain("alloy-bend-pine");
        expect(nav).not.toContain("👶");
        expect(nav).not.toContain("👤");
        expect(Object.keys(DATA_MODEL_ENTITY_ICONS)).toContain("inquiry_child");
    });

    it("page header is compact Platform Configuration shell", () => {
        const page = readFileSync(resolve(root, "app/adminV2/settings/fields/page.tsx"), "utf8");
        expect(page).toContain("config-platform-hub-eyebrow");
        expect(page).toContain("Platform Configuration");
        expect(page).not.toContain("FIELDS_HUB_REGISTRY_TRUST_NOTE");
        expect(page).not.toContain("data-model-registry-trust-note");
    });

    it("Add Relationship uses inline create row (not modal / placeholder)", () => {
        const client = readFileSync(resolve(root, "app/adminV2/settings/fields/DataModelWorkspaceClient.tsx"), "utf8");
        const create = readFileSync(
            resolve(root, "components/admin/fields/DataModelRelationshipCreateRow.tsx"),
            "utf8",
        );
        expect(client).not.toContain("DataModelAddRelationshipModal");
        expect(client).not.toContain("add-relationship-modal-placeholder");
        expect(client).toContain("creatingRelationship");
        expect(create).toContain("customer-person-role-types");
        expect(create).toContain("person-relationship-type-settings");
        expect(create).not.toContain("fixed inset-0");
    });

    it("overview field preview groups with overflow counts", () => {
        const entries = buildSettingsFieldCatalogEntries({
            hubEntity: "inquiry_child",
            entityTypes: hubEntityApiTypes("inquiry_child"),
            customFields: [],
        });
        const sections = previewFieldSections(entries, 3, 4);
        expect(sections.length).toBeGreaterThan(0);
        expect(sections[0]?.label.length).toBeGreaterThan(0);
        const groups = computedSignalPreviewGroups(entries, 3);
        expect(groups.every((g) => g.status === "now" || g.status === "future")).toBe(true);
    });

    it("Focus Panel concept availability uses capability engine", () => {
        expect(focusPanelConceptToLayoutRefKey("Enrollment → Children → DOB")).toBe("child.date_of_birth");
        expect(focusPanelConceptToLayoutRefKey("child.gender")).toBe("child.gender");
        const gender = focusPanelSurfaceStatus("child.gender");
        expect(gender.status === "available" || gender.status === "unavailable").toBe(true);
        expect(gender.rows.some((r) => r.surface === "focus_panel")).toBe(true);
    });

    it("Focus Panel builder wires availability into inspector and library", () => {
        const editor = readFileSync(
            resolve(root, "components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx"),
            "utf8",
        );
        expect(editor).toContain("availabilityConcept");
        expect(editor).toContain("itemAvailability");
        expect(editor).toContain("focusPanelSurfaceStatus");
    });
});
