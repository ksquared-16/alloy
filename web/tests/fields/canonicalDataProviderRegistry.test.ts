/** @vitest-environment node */

import { describe, expect, it, beforeEach } from "vitest";
import {
    buildCanonicalDataProviderCatalog,
    filterCanonicalDataProviders,
    findCanonicalDataProvider,
    isCanonicalProviderPublishable,
    publishableQueueRowRefKeys,
    resetCanonicalDataProviderCacheForTests,
} from "@/lib/fields/canonicalDataProviderRegistry";
import { canonicalQueueBuilderProviders } from "@/lib/fields/canonicalBuilderFieldLibrary";
import { isValidatorAllowedQueueRecordFieldRefKey } from "@/lib/layout/queueRecordValidatorAllowList";
import { isLegacyQueueRowCompatibilityRefKey } from "@/lib/fields/queueRowLegacyCompatibility";
import { evaluateQueueRowProviderEligibility } from "@/lib/fields/queueRowProviderEligibility";
import { buildQueueRowProviderSeeds, queueRowScalarSeedRefKeysForTests } from "@/lib/fields/canonicalDataProviderSeeds";
import { availableFieldsForZone } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";

describe("canonical data provider model", () => {
    beforeEach(() => {
        resetCanonicalDataProviderCacheForTests();
    });

    it("classifies primary contact name as relationship leaf, not business field", () => {
        const provider = findCanonicalDataProvider("person.primary_contact_name");
        expect(provider?.kind).toBe("relationship");
        expect(provider?.relationship?.relationship_id).toContain("primary");
        expect(provider?.outputShape).toBe("scalar");
    });

    it("classifies children.count as collection projection", () => {
        const provider = findCanonicalDataProvider("children.count");
        expect(provider?.kind).toBe("collection");
        expect(provider?.collectionProjection?.collection_ref).toBe("children");
        expect(provider?.collectionProjection?.projection).toBe("count");
    });

    it("classifies children collection provider separately from count projection", () => {
        const collection = findCanonicalDataProvider("children");
        const count = findCanonicalDataProvider("children.count");
        expect(collection?.refKey).toBe("children");
        expect(count?.refKey).toBe("children.count");
        expect(collection?.refKey).not.toBe(count?.refKey);
    });

    it("classifies queue_row.work_summary as runtime signal", () => {
        const provider = findCanonicalDataProvider("queue_row.work_summary");
        expect(provider?.kind).toBe("runtime_signal");
    });

    it("preserves sibling collection providers for waitlist", () => {
        const provider = findCanonicalDataProvider("sibling.count");
        expect(provider?.kind).toBe("collection");
        expect(provider?.availability.waitlist).toBe(true);
        expect(provider?.availability.pipeline).toBe(false);
    });

    it("queue row picker excludes unsupported collection object shapes", () => {
        const providers = filterCanonicalDataProviders({ consumer: "queue_row", isWaitlist: false });
        for (const provider of providers) {
            if (provider.kind === "collection" && !provider.collectionProjection) {
                expect.fail(`Whole collection provider ${provider.refKey} must not appear in queue picker`);
            }
        }
    });

    it("validator allow-list derives from publishable providers", () => {
        const pipeline = publishableQueueRowRefKeys(false);
        expect(pipeline).toContain("person.primary_contact_name");
        expect(pipeline).toContain("children.count");
        for (const refKey of pipeline) {
            expect(isValidatorAllowedQueueRecordFieldRefKey(refKey, false)).toBe(true);
        }
    });

    it("legacy compatibility refs publish without appearing in picker catalog", () => {
        expect(isLegacyQueueRowCompatibilityRefKey("contact.email")).toBe(true);
        expect(isCanonicalProviderPublishable("contact.email", "queue_row", false)).toBe(true);
        const picker = filterCanonicalDataProviders({ consumer: "queue_row", isWaitlist: false });
        expect(picker.some((p) => p.refKey === "contact.email")).toBe(false);
    });

    it("composition adapter zone fields come from provider catalog", () => {
        const zoneFields = availableFieldsForZone("household", false);
        const catalog = filterCanonicalDataProviders({ consumer: "queue_row", isWaitlist: false });
        for (const field of zoneFields) {
            if (field.isSystemField) {
                expect(catalog.some((p) => p.refKey === field.key)).toBe(true);
            }
        }
    });

    it("canonical queue builder providers include relationship and collection kinds", () => {
        const providers = canonicalQueueBuilderProviders({ isWaitlist: false });
        expect(providers.some((p) => p.kind === "relationship")).toBe(true);
        expect(providers.some((p) => p.kind === "collection")).toBe(true);
        expect(providers.some((p) => p.kind === "runtime_signal")).toBe(true);
    });

    it("tenant business fields merge into catalog as business_field providers", () => {
        const catalog = buildCanonicalDataProviderCatalog({
            tenantFieldDefinitions: [
                {
                    entity_type: "person",
                    field_key: "preferred_language",
                    field_type: "text",
                    label: "Preferred Language",
                    is_system: false,
                    is_active: true,
                    is_visible_in_drawer: true,
                    config: null,
                },
            ],
        });
        const custom = catalog.find((p) => p.refKey === "person.preferred_language");
        expect(custom?.kind).toBe("business_field");
        expect(custom?.isSystem).toBe(false);
    });
});

describe("relationship and collection preservation", () => {
    beforeEach(() => {
        resetCanonicalDataProviderCacheForTests();
    });

    const relationshipLeaves = [
        "person.primary_contact_name",
        "person.primary_email",
        "person.primary_phone",
        "person.emergency_contact_name",
    ];

    for (const refKey of relationshipLeaves) {
        it(`${refKey} remains relationship-derived`, () => {
            const provider = findCanonicalDataProvider(refKey);
            expect(provider?.kind).toBe("relationship");
            expect(provider?.relationship).toBeDefined();
        });
    }

    it("children providers are not flattened into Child 1 / Child 2 scalar fields", () => {
        const catalog = buildCanonicalDataProviderCatalog();
        const childIndexed = catalog.filter((p) => /child\s*[12]/i.test(p.label));
        expect(childIndexed.length).toBe(0);
        expect(catalog.some((p) => p.refKey === "children.count")).toBe(true);
    });

    it("current work runtime signal is not coerced to a business field", () => {
        const provider = findCanonicalDataProvider("queue_row.work_summary");
        expect(provider?.kind).toBe("runtime_signal");
        expect(provider?.kind).not.toBe("business_field");
    });
});

describe("queue row provider eligibility gates", () => {
    beforeEach(() => {
        resetCanonicalDataProviderCacheForTests();
    });

    it("distinguishes unknown provider from legacy-only compatibility", () => {
        const unknown = evaluateQueueRowProviderEligibility("not.a.real.provider", false);
        expect(unknown.reasons).toContain("unknown_provider");
        expect(unknown.publish).toBe(false);

        const legacy = evaluateQueueRowProviderEligibility("contact.email", false);
        expect(legacy.reasons).toContain("legacy_only");
        expect(legacy.publish).toBe(true);
        expect(legacy.picker).toBe(false);
    });

    it("blocks whole collection providers from picker while keeping projections", () => {
        const collection = evaluateQueueRowProviderEligibility("children", false);
        expect(collection.picker).toBe(false);
        expect(collection.reasons).toContain("whole_collection_without_renderer");

        const count = evaluateQueueRowProviderEligibility("children.count", false);
        expect(count.picker).toBe(true);
        expect(count.publish).toBe(true);
    });

    it("blocks waitlist-only providers on pipeline layouts", () => {
        const sibling = evaluateQueueRowProviderEligibility("sibling.count", false);
        expect(sibling.publish).toBe(false);
        expect(sibling.reasons).toContain("wrong_context");

        const waitlist = evaluateQueueRowProviderEligibility("sibling.count", true);
        expect(waitlist.publish).toBe(true);
    });

    it("relationship leaves remain publishable with lineage metadata", () => {
        const primary = evaluateQueueRowProviderEligibility("person.primary_contact_name", false);
        expect(primary.publish).toBe(true);
        const provider = findCanonicalDataProvider("person.primary_contact_name");
        expect(provider?.kind).toBe("relationship");
        expect(provider?.relationship?.relationship_id).toContain("primary");
    });

    it("seeds derive from canonical modules rather than anchorScalars", () => {
        const medical = findCanonicalDataProvider("child.medical_summary");
        expect(medical?.source?.sourceModule).toContain("queueRowChildSummaryFieldRegistry");
        expect(medical?.kind).toBe("runtime_signal");

        const work = findCanonicalDataProvider("queue_row.work_summary");
        expect(work?.source?.sourceModule).toContain("fieldPickerContextCatalog");
    });

    it("blocked manifest refs still seed from queue presentation overrides", () => {
        const scalarKeys = queueRowScalarSeedRefKeysForTests();
        expect(scalarKeys).toContain("child.program");
        expect(scalarKeys).toContain("child.status");
        const seeds = buildQueueRowProviderSeeds();
        expect(seeds.some((p) => p.refKey === "child.program")).toBe(true);
    });
});
