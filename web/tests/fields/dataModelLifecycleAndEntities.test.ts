import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    fieldLifecycleActions,
    readFieldLifecycleState,
    buildFieldLifecyclePatch,
} from "@/lib/fields/fieldLifecycleModel";
import { fieldRowEditCapability, type SettingsFieldCatalogEntry } from "@/lib/fields/fieldCatalogForSettings";
import { FIELD_DELETE_UNCOVERED_CHECKS } from "@/lib/fields/fieldDeleteSafety";
import {
    canonicalSingularLabel,
    configurationHubEntities,
    configurationPrimaryHubEntities,
    resolveConfigurationEntitySingularLabel,
} from "@/lib/adminV2/configuration/configurationEntityCatalog";

const root = resolve(__dirname, "../..");

function entry(partial: Partial<SettingsFieldCatalogEntry> & { ownership: SettingsFieldCatalogEntry["ownership"] }): SettingsFieldCatalogEntry {
    return {
        id: partial.id ?? "custom:1",
        refKey: partial.refKey ?? "person.test_field",
        label: partial.label ?? "Test Field",
        field_type: partial.field_type ?? "text",
        section_key: partial.section_key ?? "custom",
        entity_type: partial.entity_type ?? "person",
        editable: partial.editable ?? true,
        configurable: partial.configurable ?? true,
        ...partial,
    };
}

describe("field lifecycle model", () => {
    it("platform fields cannot archive or delete", () => {
        const platform = entry({
            ownership: "platform",
            fieldDef: {
                id: "fd-1",
                org_id: "org",
                entity_type: "person",
                field_key: "first_name",
                field_type: "text",
                label: "First name",
                description: null,
                is_system: true,
                is_required: false,
                is_active: true,
                is_visible_in_form: true,
                is_visible_in_drawer: true,
                is_visible_in_table: true,
                is_filterable: false,
                is_sortable: false,
                section_key: "identity",
                sort_order: 10,
                placeholder: null,
                help_text: null,
                config: null,
                is_visible_in_public_booking: false,
                created_at: "",
                updated_at: "",
            },
        });
        const cap = fieldRowEditCapability(platform, true);
        const actions = fieldLifecycleActions(platform, cap, true, { safe: true, blockers: [], uncovered_checks: [], recommended_action: "delete" });
        expect(cap.canDelete).toBe(false);
        expect(actions.canArchive).toBe(false);
        expect(actions.canDelete).toBe(false);
        expect(actions.canHide).toBe(true);
    });

    it("custom fields can hide and archive", () => {
        const custom = entry({
            ownership: "custom",
            fieldDef: {
                id: "fd-2",
                org_id: "org",
                entity_type: "person",
                field_key: "nickname",
                field_type: "text",
                label: "Nickname",
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
                sort_order: 10,
                placeholder: null,
                help_text: null,
                config: null,
                is_visible_in_public_booking: false,
                created_at: "",
                updated_at: "",
            },
        });
        const cap = fieldRowEditCapability(custom, true);
        const blocked = fieldLifecycleActions(custom, cap, true, {
            safe: false,
            blockers: [{ kind: "field_values", label: "3 stored values exist.", count: 3 }],
            uncovered_checks: [...FIELD_DELETE_UNCOVERED_CHECKS],
            recommended_action: "archive",
        });
        expect(blocked.canHide).toBe(true);
        expect(blocked.canArchive).toBe(true);
        expect(blocked.canDelete).toBe(false);
        expect(blocked.deleteDisabledReason).toContain("stored values");
    });

    it("computed fields are view-only for lifecycle", () => {
        const computed = entry({ ownership: "computed", fieldDef: undefined });
        const cap = fieldRowEditCapability(computed, true);
        const actions = fieldLifecycleActions(computed, cap, true, null);
        expect(cap.mode).toBe("view");
        expect(actions.canHide).toBe(false);
        expect(actions.canArchive).toBe(false);
        expect(actions.canDelete).toBe(false);
    });

    it("archived state is stored in config.lifecycle_state", () => {
        const state = readFieldLifecycleState({
            id: "fd-3",
            org_id: "org",
            entity_type: "person",
            field_key: "old_note",
            field_type: "text",
            label: "Old note",
            description: null,
            is_system: false,
            is_required: false,
            is_active: false,
            is_visible_in_form: false,
            is_visible_in_drawer: false,
            is_visible_in_table: false,
            is_filterable: false,
            is_sortable: false,
            section_key: "custom",
            sort_order: 10,
            placeholder: null,
            help_text: null,
            config: { lifecycle_state: "archived" },
            is_visible_in_public_booking: false,
            created_at: "",
            updated_at: "",
        });
        expect(state).toBe("archived");
        const patch = buildFieldLifecyclePatch("active", {
            id: "fd-3",
            org_id: "org",
            entity_type: "person",
            field_key: "old_note",
            field_type: "text",
            label: "Old note",
            description: null,
            is_system: false,
            is_required: false,
            is_active: false,
            is_visible_in_form: false,
            is_visible_in_drawer: false,
            is_visible_in_table: false,
            is_filterable: false,
            is_sortable: false,
            section_key: "custom",
            sort_order: 10,
            placeholder: null,
            help_text: null,
            config: { lifecycle_state: "archived" },
            is_visible_in_public_booking: false,
            created_at: "",
            updated_at: "",
        });
        expect(patch.is_active).toBe(true);
        expect((patch.config as Record<string, unknown>).lifecycle_state).toBe("active");
    });

    it("Fields tab includes hidden and archived custom fields in catalog build", () => {
        const catalog = readFileSync(resolve(root, "lib/fields/fieldCatalogForSettings.ts"), "utf8");
        const tab = readFileSync(resolve(root, "components/admin/fields/DataModelFieldsTab.tsx"), "utf8");
        expect(catalog).toContain("includeArchivedCustom");
        expect(catalog).toContain("readFieldLifecycleState");
        expect(tab).toContain("includeHiddenCustom: true");
        expect(tab).toContain("includeArchivedCustom: true");
    });

    it("delete safety documents uncovered consumer checks", () => {
        expect(FIELD_DELETE_UNCOVERED_CHECKS).toEqual(
            expect.arrayContaining([
                "focus_panel_configs",
                "queue_row_configs",
                "business_process_requirements",
                "documents_packets",
                "processing_mappings",
            ]),
        );
    });
});

describe("entities workspace adoption", () => {
    it("uses operator-facing entity labels without internal hub keys in Entities UI", () => {
        const entitiesPage = readFileSync(
            resolve(root, "components/adminV2/settings/entities/EntitiesConfigurationPage.tsx"),
            "utf8",
        );
        const workspace = readFileSync(
            resolve(root, "components/adminV2/settings/entities/EntitiesWorkspaceClient.tsx"),
            "utf8",
        );
        expect(entitiesPage).toContain("EntitiesWorkspaceClient");
        expect(entitiesPage).not.toContain("EntityLabelsClient");
        expect(workspace).not.toContain("inquiry_child");
        expect(workspace).not.toContain("customer_member");
        expect(workspace).not.toContain("placement_candidate");
        expect(workspace).toContain("configurationPrimaryHubEntities");
    });

    it("Data Model entity rail shares configuration entity catalog", () => {
        const nav = readFileSync(resolve(root, "components/admin/fields/FieldEntityNav.tsx"), "utf8");
        expect(nav).toContain("configurationPrimaryHubEntities");
        expect(nav).toContain("resolveConfigurationEntitySingularLabel");
        expect(nav).not.toContain("inquiry_child");
    });

    it("canonical hub labels match sprint operator-facing names", () => {
        const hubs = configurationPrimaryHubEntities();
        expect(hubs.map((h) => h.hubKey)).toEqual(
            expect.arrayContaining(["person", "customer", "inquiry_child", "opportunity", "location"]),
        );
        expect(canonicalSingularLabel("person")).toBe("Person");
        expect(canonicalSingularLabel("customer")).toBe("Family");
        expect(canonicalSingularLabel("inquiry_child")).toBe("Child");
        expect(canonicalSingularLabel("opportunity")).toBe("Lead / Enrollment");
        expect(canonicalSingularLabel("location")).toBe("Location / Site");
    });

    it("entity catalog maps hub keys to labels API keys", () => {
        const person = configurationHubEntities().find((e) => e.hubKey === "person");
        const child = configurationHubEntities().find((e) => e.hubKey === "inquiry_child");
        expect(person?.labelsKey).toBe("persons");
        expect(child?.labelsKey).toBe("customer_members");
        expect(resolveConfigurationEntitySingularLabel({}, "opportunity")).toBe("Lead / Enrollment");
    });
});
