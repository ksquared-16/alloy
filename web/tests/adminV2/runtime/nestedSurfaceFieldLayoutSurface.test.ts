import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const readSrc = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("NestedSurfaceFieldLayoutSurface builder UX", () => {
    const layoutSurface = readSrc("components/admin/focusPanel/drillIn/NestedSurfaceFieldLayoutSurface.tsx");
    const householdCard = readSrc("components/admin/focusPanel/cards/HouseholdCard.tsx");
    const composeCanvas = readSrc("components/admin/focusPanel/identity/IdentityComposeSectionCanvas.tsx");
    const evidenceCard = readSrc("components/admin/focusPanel/drillIn/EvidenceSectionCard.tsx");

    it("shows canonical field name in toolbar with secondary rename", () => {
        expect(layoutSurface).toContain("fp-field-instance__name");
        expect(layoutSurface).toContain("{catalogLabel}");
        expect(layoutSurface).toContain("fp-layout-field__control--secondary");
        expect(layoutSurface).not.toMatch(/>\s*Rename\s*<\/button>\s*\)\s*:\s*null\}\s*<select/);
    });

    it("uses builder rows in compose mode instead of runtime preview values", () => {
        expect(layoutSurface).toContain("BuilderFieldIdentityRow");
        expect(layoutSurface).toContain("data-builder-field-row");
        expect(layoutSurface).toContain("{!composing ? (");
        expect(layoutSurface).toContain('<BuilderFieldIdentityRow');
    });

    it("owns a single Add field per layout surface section", () => {
        expect(layoutSurface).toContain("showAddField");
        expect(layoutSurface).toContain("<NestedSurfaceAddField");
        expect(composeCanvas).toContain("showAddField");
        expect(evidenceCard).toContain("showAddField={false}");
        expect(evidenceCard).toContain("<NestedSurfaceAddField");
        expect(householdCard).not.toContain("NestedSurfaceAddField");
        expect(householdCard).toContain("IdentityComposeSectionCanvas");
    });
});
