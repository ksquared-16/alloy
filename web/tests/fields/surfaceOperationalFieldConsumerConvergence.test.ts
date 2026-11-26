/**
 * Surface Builder + Business Process — canonical field consumer convergence.
 */
import { describe, expect, it, beforeEach } from "vitest";

import {
    availableFieldsForZone,
    availableFieldsForNamespaces,
} from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import { buildQueueRowLibraryCatalog } from "@/lib/adminV2/settings/surfaces/queueRowBuilderLibrary";
import { availableFieldsForFocusPanelCard } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardFieldPicker";
import {
    assembleQueueRowProviders,
    assembleBusinessProcessProviders,
    assembleFocusPanelNestedProviders,
} from "@/lib/fields/consumerCanonicalProviderAssembly";
import { dedupeCanonicalPickerProviders } from "@/lib/fields/canonicalProviderDedup";
import { mergeLifecycleFieldPaletteForStage } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import {
    CONVERGENCE_FIXTURE_RENAMED,
    CONVERGENCE_FIXTURE_TENANT_DEFS,
} from "@/tests/fields/convergenceFixture";

beforeEach(() => {
    ensureRuntimeSurfacesRegistered();
});

describe("Surface + operational canonical field consumer", () => {
    it("queue row zone picker derives from queue_row provider assembly and group seeds", () => {
        const zoneFields = availableFieldsForZone("children");
        expect(zoneFields.length).toBeGreaterThan(0);
        expect(zoneFields.some((field) => field.key === "child.first_name" || field.key === "child.name")).toBe(true);
        const custom = availableFieldsForZone("children", false, CONVERGENCE_FIXTURE_TENANT_DEFS);
        expect(custom.map((field) => field.key)).toContain("child.custom_program_detail");
    });

    it("focus panel and queue row assemblies share deduplication utility", () => {
        const queueDuped = dedupeCanonicalPickerProviders(assembleQueueRowProviders(), "queue_row");
        expect(queueDuped.filter((provider) => provider.refKey === "child.first_name").length).toBeLessThanOrEqual(1);
        expect(queueDuped.map((provider) => provider.refKey)).not.toContain("child.display_name");
    });

    it("custom Program-category field appears in queue row library without consumer code changes", () => {
        const catalog = buildQueueRowLibraryCatalog({
            isWaitlist: false,
            inRowZoneKeys: ["children"],
            tenantFieldDefinitions: CONVERGENCE_FIXTURE_TENANT_DEFS,
        });
        const field = catalog.find(
            (item) => item.kind === "field" && item.fieldKey === "child.custom_program_detail",
        );
        expect(field?.kind).toBe("field");
        if (field?.kind === "field") {
            expect(field.label).toBe("Custom Program Detail");
            expect(field.category).toBe("child");
        }
    });

    it("custom field appears in card/tile focus panel picker", () => {
        const fields = availableFieldsForFocusPanelCard("children", CONVERGENCE_FIXTURE_TENANT_DEFS);
        expect(fields.map((field) => field.key)).toContain("child.custom_program_detail");
    });

    it("queue row and focus panel pickers expose the same custom field refKey", () => {
        const queue = availableFieldsForZone("children", false, CONVERGENCE_FIXTURE_TENANT_DEFS);
        const focus = availableFieldsForNamespaces(["child", "inquiry_child"], CONVERGENCE_FIXTURE_TENANT_DEFS);
        expect(queue.map((field) => field.key)).toContain("child.custom_program_detail");
        expect(focus.map((field) => field.key)).toContain("child.custom_program_detail");
    });

    it("renamed Settings label propagates to queue row library", () => {
        const catalog = buildQueueRowLibraryCatalog({
            isWaitlist: false,
            inRowZoneKeys: ["children"],
            tenantFieldDefinitions: [CONVERGENCE_FIXTURE_RENAMED],
        });
        const field = catalog.find(
            (item) => item.kind === "field" && item.fieldKey === "child.custom_program_detail",
        );
        expect(field?.kind).toBe("field");
        if (field?.kind === "field") {
            expect(field.label).toBe("Program Placement Detail");
        }
    });

    it("business process assembly includes tenant custom fields for stage palette merge", () => {
        const providers = assembleBusinessProcessProviders({ tenantFieldDefinitions: CONVERGENCE_FIXTURE_TENANT_DEFS });
        expect(providers.map((provider) => provider.refKey)).toContain("child.custom_program_detail");
        const palette = mergeLifecycleFieldPaletteForStage("lead", {
            child: [
                {
                    field_key: "custom_program_detail",
                    label: "Custom Program Detail",
                    entity_type: "customer_member",
                    field_type: "select",
                    is_system: false,
                    is_active: true,
                },
            ],
        });
        expect(palette.map((entry) => entry.rule_id)).toContain("custom:child:custom_program_detail");
    });

    it("native first name follows the same queue row assembly path as custom fields", () => {
        const native = availableFieldsForZone("children").find((field) => field.key === "child.first_name");
        expect(native?.label).toBeTruthy();
        const custom = availableFieldsForZone("children", false, CONVERGENCE_FIXTURE_TENANT_DEFS).find(
            (field) => field.key === "child.custom_program_detail",
        );
        expect(custom?.isSystemField).toBe(false);
        expect(native?.isSystemField).toBe(true);
    });

    it("focus panel assembly remains distinct from queue row when capabilities diverge", () => {
        const queue = assembleQueueRowProviders();
        const focus = assembleFocusPanelNestedProviders();
        expect(queue.length).toBeGreaterThan(0);
        expect(focus.length).toBeGreaterThan(0);
    });
});
