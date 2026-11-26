/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deriveRegistryFieldAvailability } from "@/lib/fields/fieldCapabilityEngine";
import {
    availableSurfacesForField,
    isQueueCompositionFieldResolverBacked,
    resolveFieldSurfaceAvailability,
    resolveSettingsCatalogEntryAvailability,
    unavailableSurfacesForField,
} from "@/lib/fields/fieldSurfaceAvailability";
import { availableFieldsForZone } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import { buildFormSystemFieldPicker } from "@/lib/fields/formFieldRegistryPicker";
import { isValidatorAllowedQueueRecordFieldRefKey } from "@/lib/layout/queueRecordValidatorAllowList";

const root = resolve(__dirname, "../..");

describe("fieldSurfaceAvailability", () => {
    it("marks gender available on drawer, forms, and queue rows", () => {
        const input = {
            entity_type: "customer_member",
            field_key: "gender",
            field_type: "select",
            label: "Gender",
            is_system: true,
            is_active: true,
            is_visible_in_form: true,
            is_visible_in_drawer: true,
            is_visible_in_table: false,
            config: { option_set_key: "person_gender" },
        };
        const rows = resolveFieldSurfaceAvailability(input);
        const bySurface = Object.fromEntries(rows.map((r) => [r.surface, r.status]));
        expect(bySurface.drawer).toBe("available");
        expect(bySurface.forms).toBe("available");
        expect(bySurface.queue_row).toBe("available");
    });

    it("marks gender available on focus panel, business process, and queue rows with child context", () => {
        const input = {
            entity_type: "customer_member",
            field_key: "gender",
            field_type: "select",
            label: "Gender",
            is_system: true,
            is_active: true,
            is_visible_in_form: true,
            is_visible_in_drawer: true,
            is_visible_in_table: false,
            config: { option_set_key: "person_gender" },
        };
        const contextual = resolveSettingsCatalogEntryAvailability({
            ownership: "custom",
            hub_entity: "inquiry_child",
            registry: input,
        });
        const bySurface = Object.fromEntries(contextual.map((r) => [r.surface, r.status]));
        expect(bySurface.focus_panel).toBe("available");
        expect(bySurface.business_process).toBe("available");
        expect(bySurface.queue_row).toBe("available");
        expect(unavailableSurfacesForField(input).some((r) => r.surface === "queue_row")).toBe(false);
    });

    it("child.gender ref is on queue validator allow-list and composition-backed", () => {
        expect(isValidatorAllowedQueueRecordFieldRefKey("child.gender", false)).toBe(true);
        expect(isValidatorAllowedQueueRecordFieldRefKey("child.gender", true)).toBe(true);
        expect(isQueueCompositionFieldResolverBacked("child.gender")).toBe(true);
    });

    it("queue composition adapter includes gender in children zone builder fields", () => {
        const fields = availableFieldsForZone("children", false, [
            {
                entity_type: "customer_member",
                field_key: "gender",
                label: "Gender",
                field_type: "select",
                is_system: true,
                is_active: true,
                is_visible_in_drawer: true,
            },
        ]);
        expect(fields.some((f) => f.key === "child.gender")).toBe(true);
    });

    it("forms picker includes customer_member gender from registry", () => {
        const picker = buildFormSystemFieldPicker([
            {
                entity_type: "customer_member",
                field_key: "gender",
                field_type: "select",
                label: "Gender",
                is_system: true,
                is_active: true,
                config: { option_set_key: "person_gender" },
            },
        ]);
        expect(picker.some((e) => e.field_key === "gender" || e.id.includes("gender"))).toBe(true);
    });
});

describe("Settings Fields operator labels", () => {
    it("never shows Inquiry child in operator entity labels", () => {
        expect(adminFieldEntitySingularLabel({}, "inquiry_child")).toBe("Child");
        expect(adminFieldEntitySingularLabel({}, "customer_member")).toBe("Child");
    });

    it("operator-facing field label helpers use Child not Inquiry child", () => {
        const labelSrc = readFileSync(resolve(root, "lib/admin/adminFieldEntityDisplayLabel.ts"), "utf8");
        expect(labelSrc).not.toContain("Inquiry child");
        expect(adminFieldEntitySingularLabel({}, "inquiry_child")).toBe("Child");
    });

    it("field settings cards render availability badges component", () => {
        const cardSrc = readFileSync(
            resolve(root, "components/admin/fields/FieldDefinitionSettingsCard.tsx"),
            "utf8",
        );
        expect(cardSrc).toContain("FieldSurfaceAvailabilityBadges");
        expect(cardSrc).toContain("data-testid=\"field-definition-card\"");
    });
});

describe("field availability summary helpers", () => {
    it("summarizes available surfaces for lead location", () => {
        const surfaces = availableSurfacesForField({
            entity_type: "opportunity",
            field_key: "location_id",
            field_type: "select",
            is_system: true,
            is_active: true,
            is_visible_in_form: true,
            is_visible_in_drawer: true,
            is_visible_in_table: true,
        });
        expect(surfaces).toContain("drawer");
        expect(surfaces).toContain("forms");
    });
});
