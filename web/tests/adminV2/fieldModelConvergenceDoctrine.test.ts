import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

/**
 * Drift prevention for field model convergence (V4).
 * Documents known parallel catalogs; fails if merge paths regress.
 * Full convergence tests (registry-only pickers) belong in F1+ sprint.
 */
describe("field model convergence doctrine", () => {
    it("field convergence doctrine doc exists", () => {
        const doc = readFileSync(resolve(root, "../docs/system/field-model-convergence-doctrine.md"), "utf8");
        expect(doc).toContain("field_definitions");
        expect(doc).toContain("LIFECYCLE_FIELD_REQUIREMENT_CATALOG");
        expect(doc).toContain("OPERATIONAL_FORM_SYSTEM_FIELDS");
    });

    it("Fields settings uses field_definitions API", () => {
        const client = read("components/admin/EntityFieldsClient.tsx");
        expect(client).toContain("/api/admin/field-definitions");
    });

    it("Layouts field catalog loads from field_definitions", () => {
        const route = read("app/api/admin/entity-layouts/field-catalog/route.ts");
        expect(route).toContain('.from("field_definitions")');
    });

    it("Layouts placement model uses field_placements_v1", () => {
        expect(read("lib/fields/fieldPlacementV1.ts")).toContain("field_placements_v1");
    });

    it("Business Processes requirements API merges org field_definitions", () => {
        const route = read("app/api/admin/departments/[departmentId]/lifecycle-requirements/route.ts");
        expect(route).toContain("loadOrgFieldDefinitionsForLifecycle");
        expect(route).toContain("mergeLifecycleFieldPaletteForBuilderStage");
        expect(read("lib/lifecycle/loadOrgFieldDefinitionsForLifecycle.ts")).toContain(
            '.from("field_definitions")'
        );
    });

    it("Business Processes stage editor documents field-source gap honestly", () => {
        const editor = read("components/adminV2/settings/LifecycleStageFieldRequirementsEditor.tsx");
        expect(editor).toContain("stage-requirements-field-source-note");
        expect(read("lib/lifecycle/businessProcessUiLabels.ts")).toContain(
            "stored separately from Layout placement"
        );
    });

    it("Forms builder loads registry-first system fields via field-definitions API", () => {
        const editor = read("components/admin/forms/documentComposition/DocumentCompositionEditor.tsx");
        expect(editor).toContain("useFormSystemFieldPicker");
        expect(read("lib/fields/useFormSystemFieldPicker.ts")).toContain("/api/admin/field-definitions");
        expect(read("lib/fields/formFieldRegistryPicker.ts")).toContain("buildFormSystemFieldPicker");
    });

    it("parallel catalogs are confined to known modules", () => {
        const lifecycleCatalog = read("lib/lifecycle/lifecycleFieldRequirementsCatalog.ts");
        expect(lifecycleCatalog).toContain("LIFECYCLE_FIELD_REQUIREMENT_CATALOG");
        const formsRegistry = read("lib/forms/systemFieldRegistry.ts");
        expect(formsRegistry).toContain("OPERATIONAL_FORM_SYSTEM_FIELDS");
        const layoutCatalog = read("lib/layout/fieldCatalog.ts");
        expect(layoutCatalog).toContain("CURATED_FIELDS");
    });

    it("requiredness models remain distinct (layout vs stage)", () => {
        expect(read("lib/fields/fieldPlacementV1.ts")).toContain("requirement");
        expect(read("lib/lifecycle/lifecycleBuilderStageFieldRules.ts")).toContain(
            "lifecycle_builder_stage_field_rules_v1"
        );
        const doc = readFileSync(resolve(root, "../docs/system/field-model-convergence-doctrine.md"), "utf8");
        expect(doc).toContain("Keep both layout and stage requiredness");
    });
});
