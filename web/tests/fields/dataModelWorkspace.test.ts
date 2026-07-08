/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";
import {
    buildSettingsFieldCatalogEntries,
    hubEntityApiTypes,
} from "@/lib/fields/fieldCatalogForSettings";
import { relationshipsForHubEntity } from "@/lib/fields/entityRelationshipCatalog";
import { deriveRegistryFieldAvailability } from "@/lib/fields/fieldCapabilityEngine";
import { resolveSettingsCatalogEntryAvailability } from "@/lib/fields/fieldSurfaceAvailability";
import { CONFIGURATION_WORKSPACE_DOMAINS } from "@/lib/adminV2/configurationWorkspaceDomains";

const root = resolve(__dirname, "../..");

describe("Data Model workspace", () => {
    it("configuration nav exposes Data Model at /settings/fields", () => {
        const dataModel = CONFIGURATION_WORKSPACE_DOMAINS.find((d) => d.id === "data_model");
        expect(dataModel?.items.some((i) => i.label === "Data Model")).toBe(true);
        expect(dataModel?.items.some((i) => i.href.endsWith("/fields"))).toBe(true);
        expect(dataModel?.items.some((i) => i.href.endsWith("/data-model"))).toBe(false);
    });

    it("Child hub entity includes gender in catalog entries", () => {
        const entries = buildSettingsFieldCatalogEntries({
            hubEntity: "inquiry_child",
            entityTypes: hubEntityApiTypes("inquiry_child"),
            customFields: [
                {
                    id: "g1",
                    org_id: "o",
                    entity_type: "customer_member",
                    field_key: "gender",
                    field_type: "select",
                    label: "Gender",
                    description: null,
                    is_system: true,
                    is_required: false,
                    is_active: true,
                    is_visible_in_form: true,
                    is_visible_in_drawer: true,
                    is_visible_in_table: false,
                    is_visible_in_public_booking: false,
                    is_filterable: false,
                    is_sortable: false,
                    section_key: "identity",
                    sort_order: 10,
                    placeholder: null,
                    help_text: null,
                    config: { option_set_key: "person_gender" },
                    requirement_policy: null,
                    interaction_policy: null,
                    created_at: "",
                    updated_at: "",
                },
            ],
        });
        const gender = entries.find((e) => e.refKey === "child.gender");
        expect(gender?.label).toBe("Gender");
        expect(gender?.ownership).toBe("custom");
    });

    it("Child overview model includes relationships, fields, and computed signals", () => {
        const entries = buildSettingsFieldCatalogEntries({
            hubEntity: "inquiry_child",
            entityTypes: hubEntityApiTypes("inquiry_child"),
            customFields: [],
        });
        expect(relationshipsForHubEntity("inquiry_child").length).toBeGreaterThan(0);
        expect(entries.some((e) => e.ownership === "platform")).toBe(true);
        expect(entries.some((e) => e.ownership === "computed")).toBe(true);
    });

    it("Data Model workspace does not mount legacy field detail drawer", () => {
        const client = readFileSync(resolve(root, "app/adminV2/settings/fields/DataModelWorkspaceClient.tsx"), "utf8");
        expect(client).not.toContain("FieldDetailDrawer");
        expect(client).toContain("DataModelFieldsTab");
        expect(client).toContain("focusFieldRefKey");
    });

    it("uses operator-facing entity labels without internal grains in rendered nav", () => {
        expect(adminFieldEntitySingularLabel({}, "inquiry_child")).toBe("Child");
        const navSrc = readFileSync(resolve(root, "components/admin/fields/FieldEntityNav.tsx"), "utf8");
        expect(navSrc).toContain("Lead / Enrollment");
        expect(navSrc).toContain("All Entities");
        expect(navSrc).not.toContain("Inquiry child");
        expect(navSrc).not.toContain("placement_candidate");
        expect(navSrc).not.toContain("OCM");
        expect(navSrc).not.toContain("👶");
    });

    it("configured gender is available to business process requirements with child context", () => {
        const rows = deriveRegistryFieldAvailability(
            {
                entity_type: "customer_member",
                field_key: "gender",
                field_type: "select",
                is_system: true,
                is_active: true,
                is_visible_in_form: true,
                is_visible_in_drawer: true,
            },
            { hub_entity: "inquiry_child" },
        );
        const bp = rows.find((r) => r.surface === "business_process");
        expect(bp?.status).toBe("available");
    });

    it("queue row remains stricter than focus panel for gender", () => {
        const input = {
            entity_type: "customer_member",
            field_key: "gender",
            is_system: true,
            is_active: true,
            is_visible_in_form: true,
            is_visible_in_drawer: true,
        };
        const rows = resolveSettingsCatalogEntryAvailability({
            ownership: "custom",
            hub_entity: "inquiry_child",
            registry: input,
        });
        const queue = rows.find((r) => r.surface === "queue_row");
        const focus = rows.find((r) => r.surface === "focus_panel");
        expect(queue?.status).toBe("unavailable");
        expect(focus?.status).toBe("available");
    });
});
