import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildProcessingFormFieldLibrary } from "@/lib/forms/processingFormFieldLibrary";
import { mergeLifecycleFieldPaletteForStage } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";

const web = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");

/**
 * Why `Child → Gender` was missing.
 *
 * The picker's authority already existed — `buildProcessingFormFieldLibrary` over the lifecycle palette,
 * which is the same vocabulary `/process → requirements` reads, org custom fields included. It was
 * reachable only through `/api/admin/forms/<formId>/lifecycle-coverage`, which needs a form id. An
 * imported draft has none until the operator creates a form, so that surface could never call it and
 * fell back to a 17-entry curated list. Gender is in the catalog; the picker simply never asked for it.
 */
describe("the canonical destination catalog", () => {
    const library = buildProcessingFormFieldLibrary({ palette: mergeLifecycleFieldPaletteForStage("lead") });
    const labelsFor = (group: string) =>
        library.filter((g) => g.group === group).flatMap((g) => g.items.map((i) => i.label.toLowerCase()));
    const childLabels = labelsFor("child");

    it("offers Child fields at all", () => {
        expect(childLabels.length).toBeGreaterThan(0);
    });

    it("includes the Child facts the Director expects — gender among them", () => {
        for (const expected of ["gender", "first name", "last name", "date of birth"]) {
            expect(childLabels.some((l) => l.includes(expected)), `Child → ${expected} missing`).toBe(true);
        }
    });

    it("offers materially more than the curated fallback it replaced", () => {
        // The fallback was 17 entries across every record; the authority is the whole vocabulary.
        const total = library.reduce((n, g) => n + g.items.length, 0);
        expect(total).toBeGreaterThan(17);
    });

    it("speaks business language, not storage keys", () => {
        for (const group of library) {
            for (const item of group.items) {
                expect(item.label).not.toMatch(/^[a-z][a-z0-9_]*$/);
            }
        }
    });
});

describe("one authority, reached by both surfaces", () => {
    it("serves the catalog org-scoped, for a form that does not exist yet", () => {
        const route = web("app/api/admin/forms/field-library/route.ts");
        expect(route).toContain("buildProcessingFormFieldLibrary");
        expect(route).toContain("mergeLifecycleFieldPaletteForStage");
        // The org's own custom fields, through the same loader the form-scoped payload uses.
        expect(route).toContain("loadOrgFieldDefinitionsForLifecycle");
    });

    it("gates the catalog with the authority that owns form design", () => {
        const route = web("app/api/admin/forms/field-library/route.ts");
        expect(route).toContain("requireFormsCapability");
        expect(route).toContain("FORMS_AUTHOR");
        expect(route).toContain("getAdminContextCached");
    });

    it("is read by the imported form", () => {
        const imported = web("app/adminV2/pos/ProcessingImportedFormStudio.tsx");
        expect(imported).toContain("/api/admin/forms/field-library");
        expect(imported).toContain("fieldLibrary={fieldLibrary}");
    });

    it("is read by the hand-built form when the form-scoped call has nothing", () => {
        const builder = web("app/adminV2/pos/ProcessingFormBuilder.tsx");
        expect(builder).toContain("/api/admin/forms/field-library");
        expect(builder).toContain("lifecycle-coverage");
    });

    it("builds no imported-only catalog and no duplicate field list", () => {
        const imported = web("app/adminV2/pos/ProcessingImportedFormStudio.tsx");
        expect(imported).not.toContain("PROCESSING_BUILDER_CANONICAL_FIELDS");
        expect(imported).not.toContain("buildProcessingFormFieldLibrary");
        /*
         * The adapter may POINT at the inspector's section in prose; what it must not do is render a
         * destination picker of its own. The picker controls live in the shared inspector only.
         */
        const inspector = web("app/adminV2/pos/ProcessingFormQuestionInspector.tsx");
        for (const control of ["form-builder-destination-subject", "form-builder-destination-field", "destinationOptionsForSubject"]) {
            expect(inspector, control).toContain(control);
            expect(imported, control).not.toContain(control);
        }
    });

    it("declares the route, so the capability ratchet stays honest", () => {
        const declared = JSON.parse(web("scripts/routeCapabilities.declared.json")) as {
            routes?: Record<string, Record<string, { status?: string; capability?: string }>>;
        };
        const routes = declared.routes ?? (declared as unknown as Record<string, Record<string, { status?: string; capability?: string }>>);
        const entry = routes["app/api/admin/forms/field-library/route.ts"];
        expect(entry?.GET?.status).toBe("declared");
        expect(entry?.GET?.capability).toBe("forms.author");
    });
});
