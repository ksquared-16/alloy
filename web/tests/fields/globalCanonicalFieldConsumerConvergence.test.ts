/**
 * Global canonical field consumer convergence — acceptance fixture + architecture boundaries.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    resolveAutomationConditionOperands,
    resolveAutomationMutationTargets,
} from "@/lib/automation/automationFieldFoundation";
import { availableFieldsForZone } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";
import { resolveCanonicalConditionOperands } from "@/lib/fields/canonicalConditionOperands";
import { assembleDrawerProviders, assembleQueueRowProviders } from "@/lib/fields/consumerCanonicalProviderAssembly";
import { resolveDrawerCanonicalFieldLabel } from "@/lib/layout/drawerLayoutFieldAdapter";
import {
    buildQueueRecordFieldPickerGroups,
    buildQueueRecordPickerFieldsFromAllowList,
} from "@/lib/layout/queueRecordFieldPickerCatalog";
import {
    resolveProcessConditionOperands,
    resolveTransitionConditionOperands,
} from "@/lib/lifecycle/processConditionOperands";
import {
    getWorkViewConditionFieldDef,
    workViewConditionFieldGroups,
    workViewFilterFieldOptions,
} from "@/lib/lifecycle/workViewCanonicalOperands";
import {
    resolveWorkViewSortFieldLabel,
    resolveWorkViewSortFieldOptions,
    canonicalWorkViewSortFieldKey,
} from "@/lib/lifecycle/workViewSortOperands";
import { evaluateWorkViewFiltersForRow } from "@/lib/lifecycle/evaluateWorkViewFiltersV1";
import { buildChildrenCollectionItemFieldCatalog } from "@/lib/presentation/collectionItemFieldCatalog";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import {
    CONVERGENCE_FIXTURE_CUSTOM_PROGRAM_DETAIL,
    CONVERGENCE_FIXTURE_RENAMED,
    CONVERGENCE_FIXTURE_TENANT_DEFS,
} from "@/tests/fields/convergenceFixture";

beforeEach(() => {
    ensureRuntimeSurfacesRegistered();
});

describe("global canonical field consumer convergence", () => {
    it("acceptance fixture appears across implemented consumers without registry registration", () => {
        const refKey = "child.custom_program_detail";
        expect(workViewFilterFieldOptions(CONVERGENCE_FIXTURE_TENANT_DEFS).map((row) => row.key)).toContain(refKey);
        expect(getWorkViewConditionFieldDef(refKey, CONVERGENCE_FIXTURE_TENANT_DEFS)?.label).toBe(
            "Custom Program Detail",
        );
        expect(
            resolveWorkViewSortFieldOptions(CONVERGENCE_FIXTURE_TENANT_DEFS).some((row) => row.key === refKey),
        ).toBe(false);
        expect(resolveProcessConditionOperands({ filter: { tenantFieldDefinitions: CONVERGENCE_FIXTURE_TENANT_DEFS } }).map((row) => row.refKey)).toContain(refKey);
        expect(resolveTransitionConditionOperands({ tenantFieldDefinitions: CONVERGENCE_FIXTURE_TENANT_DEFS }).map((row) => row.refKey)).toContain(refKey);
        expect(resolveAutomationConditionOperands(CONVERGENCE_FIXTURE_TENANT_DEFS).map((row) => row.refKey)).toContain(refKey);
        expect(resolveAutomationMutationTargets(CONVERGENCE_FIXTURE_TENANT_DEFS).map((row) => row.refKey)).toContain(refKey);
        expect(assembleDrawerProviders({ tenantFieldDefinitions: CONVERGENCE_FIXTURE_TENANT_DEFS }).map((row) => row.refKey)).toContain(refKey);
        expect(buildChildrenCollectionItemFieldCatalog(CONVERGENCE_FIXTURE_TENANT_DEFS).custom_program_detail?.label).toBe(
            "Custom Program Detail",
        );
        const queueFields = buildQueueRecordPickerFieldsFromAllowList(false, {
            tenantFieldDefinitions: CONVERGENCE_FIXTURE_TENANT_DEFS,
        });
        expect(queueFields.some((field) => field.refKey === refKey)).toBe(true);
    });

    it("native child.first_name follows the same canonical assembly path", () => {
        const refKey = "child.first_name";
        expect(workViewFilterFieldOptions(CONVERGENCE_FIXTURE_TENANT_DEFS).map((row) => row.key)).toContain(refKey);
        expect(assembleQueueRowProviders().map((row) => row.refKey)).toContain(refKey);
        expect(resolveDrawerCanonicalFieldLabel(refKey).length).toBeGreaterThan(0);
        expect(availableFieldsForZone("children").some((field) => field.key === refKey)).toBe(true);
    });

    it("rename and category propagation use canonical metadata", () => {
        const refKey = "child.custom_program_detail";
        expect(getWorkViewConditionFieldDef(refKey, [CONVERGENCE_FIXTURE_RENAMED])?.label).toBe(
            "Program Placement Detail",
        );
        expect(resolveDrawerCanonicalFieldLabel(refKey, [CONVERGENCE_FIXTURE_RENAMED])).toBe("Program Placement Detail");
        expect(buildChildrenCollectionItemFieldCatalog([CONVERGENCE_FIXTURE_RENAMED]).custom_program_detail?.label).toBe(
            "Program Placement Detail",
        );
    });

    it("persisted work view refs survive rename at runtime evaluation boundary", () => {
        const result = evaluateWorkViewFiltersForRow(
            { "child.custom_program_detail": "a" },
            [{ field_key: "child.custom_program_detail", operator: "equals", value: "a" }],
            "all",
            CONVERGENCE_FIXTURE_TENANT_DEFS,
        );
        expect(result.pass).toBe(true);
        expect(result.notes.every((note) => note.supported)).toBe(true);
    });

    it("legacy sort keys reconcile to canonical refs at parse boundary", () => {
        expect(canonicalWorkViewSortFieldKey("tour_time")).toBe("opportunity.tour_date");
        expect(resolveWorkViewSortFieldLabel("tour_time")).toBeTruthy();
    });

    it("deleted/unavailable custom field yields safe unsupported runtime state", () => {
        const result = evaluateWorkViewFiltersForRow(
            {},
            [{ field_key: "child.removed_custom_field", operator: "equals", value: "x" }],
        );
        expect(result.pass).toBe(true);
        expect(result.notes[0]?.supported).toBe(false);
    });

    it("work view condition groups include canonical custom fields", () => {
        const groups = workViewConditionFieldGroups(CONVERGENCE_FIXTURE_TENANT_DEFS);
        const customGroup = groups.find((group) => group.key === "custom" || group.key === "child");
        expect(customGroup?.fields.some((field) => field.key === "child.custom_program_detail")).toBe(true);
    });

    it("shared condition operand resolver is the only canonical operand source", () => {
        const shared = resolveCanonicalConditionOperands({
            consumer: "work_view",
            filter: { tenantFieldDefinitions: CONVERGENCE_FIXTURE_TENANT_DEFS },
        });
        const process = resolveProcessConditionOperands({
            filter: { tenantFieldDefinitions: CONVERGENCE_FIXTURE_TENANT_DEFS },
        });
        expect(shared.map((row) => row.refKey)).toContain("child.custom_program_detail");
        expect(process.map((row) => row.refKey)).toContain("child.custom_program_detail");
    });

    it("legacy queue picker delegates labels to canonical queue_row assembly", () => {
        const groups = buildQueueRecordFieldPickerGroups(false, {
            tenantFieldDefinitions: CONVERGENCE_FIXTURE_TENANT_DEFS,
        });
        const custom = groups.flatMap((group) => group.fields).find((field) => field.refKey === "child.custom_program_detail");
        expect(custom?.fieldLabel).toBe("Custom Program Detail");
    });
});

describe("canonical field consumer architecture boundaries", () => {
    const webRoot = join(process.cwd());

    it("work view condition registry module does not export a tenant custom-field catalog", () => {
        const registrySource = readFileSync(join(webRoot, "lib/lifecycle/workViewConditionFieldRegistry.ts"), "utf8");
        expect(registrySource).not.toContain("custom_program_detail");
        expect(registrySource).not.toContain("TenantFieldDefinitionRow");
    });

    it("queue legacy picker catalog delegates label resolution to canonical providers", () => {
        const source = readFileSync(join(webRoot, "lib/layout/queueRecordFieldPickerCatalog.ts"), "utf8");
        expect(source).toContain("resolveCanonicalProviderForConsumer");
    });

    it("collection item catalog derives from canonical assembly", () => {
        const source = readFileSync(join(webRoot, "lib/presentation/collectionItemFieldCatalog.ts"), "utf8");
        expect(source).toContain("assembleQueueRowProviders");
        expect(source).not.toContain("Option A");
    });
});
