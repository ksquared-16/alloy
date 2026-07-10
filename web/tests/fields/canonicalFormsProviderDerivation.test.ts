import { describe, expect, it } from "vitest";
import {
    buildFormsProviderSeeds,
    buildFormsTenantProviderSeeds,
    FORMS_PROVIDER_DERIVATION_SOURCES,
} from "@/lib/fields/canonicalFormsProviderDerivation";
import { filterFormsDocumentsDataProviders } from "@/lib/fields/canonicalDataProviderRegistry";
import { resetCanonicalDataProviderCacheForTests } from "@/lib/fields/canonicalDataProviderRegistry";

describe("canonicalFormsProviderDerivation", () => {
    it("derives scalar seeds from canonical sources only", () => {
        resetCanonicalDataProviderCacheForTests();
        const seeds = buildFormsProviderSeeds();
        expect(seeds.length).toBeGreaterThan(0);
        expect(seeds.every((p) => p.outputShape === "scalar")).toBe(true);
        expect(seeds.some((p) => p.kind === "relationship")).toBe(false);
        expect(seeds.some((p) => p.kind === "collection")).toBe(false);
        expect(seeds.some((p) => p.kind === "calculated_field")).toBe(false);
        expect(seeds.some((p) => p.kind === "runtime_signal")).toBe(false);
    });

    it("documents derivation sources", () => {
        expect(FORMS_PROVIDER_DERIVATION_SOURCES).toContain("field_definitions");
        expect(FORMS_PROVIDER_DERIVATION_SOURCES).toContain("platform_field_catalog");
    });

    it("includes tenant business fields in picker catalog", () => {
        resetCanonicalDataProviderCacheForTests();
        const tenant = buildFormsTenantProviderSeeds([
            {
                entity_type: "person",
                field_key: "preferred_contact_method",
                field_type: "select",
                label: "Preferred contact method",
                is_system: false,
                is_active: true,
            },
        ]);
        expect(tenant).toHaveLength(1);
        expect(tenant[0]?.kind).toBe("business_field");

        const picker = filterFormsDocumentsDataProviders({
            tenantFieldDefinitions: [
                {
                    entity_type: "person",
                    field_key: "preferred_contact_method",
                    field_type: "select",
                    label: "Preferred contact method",
                    is_system: false,
                    is_active: true,
                },
            ],
        });
        expect(picker.some((p) => p.refKey === "person.preferred_contact_method")).toBe(true);
    });

    it("excludes legacy-only signature artifact from new picker", () => {
        resetCanonicalDataProviderCacheForTests();
        const picker = filterFormsDocumentsDataProviders({});
        expect(picker.some((p) => p.refKey.includes("enrollment_acknowledgement_signature"))).toBe(false);
    });
});
