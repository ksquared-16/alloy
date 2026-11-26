import { describe, expect, it } from "vitest";
import { resetCanonicalDataProviderCacheForTests, buildCanonicalDataProviderCatalog } from "@/lib/fields/canonicalDataProviderRegistry";
import { buildPersonChildRelationshipPlatformProviders } from "@/lib/fields/personChildRelationship/personChildRelationshipProviderCatalogIntegration";

describe("personChildRelationship provider catalog integration", () => {
    it("registers relationship_type exactly once in canonical catalog", () => {
        resetCanonicalDataProviderCacheForTests();
        const platform = buildPersonChildRelationshipPlatformProviders();
        const catalog = buildCanonicalDataProviderCatalog();
        const ref = "person_child_relationship.relationship_type";
        expect(platform.filter((p) => p.refKey === ref)).toHaveLength(1);
        expect(catalog.filter((p) => p.refKey === ref)).toHaveLength(1);
        const provider = catalog.find((p) => p.refKey === ref);
        expect(provider?.settingsEntity).toBe("person_child_relationship");
        expect(provider?.kind).toBe("business_field");
    });

    it("merges tenant custom relationship fields into catalog", () => {
        resetCanonicalDataProviderCacheForTests();
        const catalog = buildCanonicalDataProviderCatalog({
            tenantFieldDefinitions: [
                {
                    entity_type: "person_child_relationship",
                    field_key: "pickup_instructions",
                    label: "Pickup Instructions",
                    field_type: "text",
                    is_system: false,
                    is_active: true,
                },
            ],
        });
        expect(catalog.some((p) => p.refKey === "person_child_relationship.pickup_instructions")).toBe(true);
    });
});
