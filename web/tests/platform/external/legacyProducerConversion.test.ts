/**
 * Gate 1 Step 10 — converting a legacy producer without inventing anything.
 *
 * The conversion is only safe if it is boring: the same input always produces
 * the same plan, running it twice produces one installation, and anything it
 * cannot establish exactly it refuses rather than approximates.
 */

import { describe, expect, it } from "vitest";

import {
    applicationSlugForProvider,
    planConversion,
    type LegacyMappingRow,
    type LegacyProducerRow,
    type LegacyProducerSite,
} from "@/lib/platform/admin/convertLegacyProducer";

const ORG = "org-a";
const SITE_1 = "site-1";
const SITE_2 = "site-2";

const producer = (over: Partial<LegacyProducerRow> = {}): LegacyProducerRow => ({
    id: "prod-1",
    org_id: ORG,
    provider_key: "classroom_coach",
    producer_key: "integration:cc:1",
    label: "Door reader",
    status: "active",
    capabilities: ["attendance.record"],
    ...over,
});

const sites = (...ids: string[]): LegacyProducerSite[] =>
    ids.map((site_location_id) => ({ producer_id: "prod-1", site_location_id }));

const mapping = (over: Partial<LegacyMappingRow> = {}): LegacyMappingRow => ({
    producer_id: "prod-1",
    external_entity_type: "child",
    external_id: "CC-1",
    child_customer_member_id: "cm-1",
    location_id: null,
    status: "active",
    ...over,
});

describe("the plan is derived, never invented", () => {
    it("keeps the producer key, so facts already authored stay attributed", () => {
        const d = planConversion({ producer: producer(), sites: sites(SITE_1), mappings: [] });
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        expect(d.plan.producerKey).toBe("integration:cc:1");
    });

    it("derives one application slug per provider, not per producer", () => {
        expect(applicationSlugForProvider("classroom_coach")).toBe("legacy-classroom-coach");
        const a = planConversion({ producer: producer(), sites: sites(SITE_1), mappings: [] });
        const b = planConversion({ producer: producer({ id: "prod-2", producer_key: "integration:cc:2" }), sites: [{ producer_id: "prod-2", site_location_id: SITE_1 }], mappings: [] });
        if (!a.ok || !b.ok) return;
        expect(a.plan.applicationSlug).toBe(b.plan.applicationSlug);
    });

    it("never carries the credential across", () => {
        const d = planConversion({ producer: producer(), sites: sites(SITE_1), mappings: [] });
        if (!d.ok) return;
        expect(d.plan.carriesCredential).toBe(false);
    });

    it("is deterministic: the same input yields an identical plan", () => {
        const input = { producer: producer(), sites: sites(SITE_2, SITE_1), mappings: [mapping({ external_id: "B" }), mapping({ external_id: "A" })] };
        const a = planConversion(input);
        const b = planConversion(input);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it("maps the boundary to exactly the recorded sites", () => {
        const d = planConversion({ producer: producer(), sites: sites(SITE_2, SITE_1), mappings: [] });
        if (!d.ok) return;
        expect(d.plan.boundaryMode).toBe("locations");
        expect(d.plan.locationBoundary).toEqual([SITE_1, SITE_2]);
    });

    it("carries active mappings into resource refs, and drops disabled ones", () => {
        const d = planConversion({
            producer: producer(),
            sites: sites(SITE_1),
            mappings: [mapping(), mapping({ external_id: "CC-OFF", status: "disabled" })],
        });
        if (!d.ok) return;
        expect(d.plan.resourceRefs.map((r) => r.external_id)).toEqual(["CC-1"]);
    });
});

describe("what it refuses rather than guesses", () => {
    it("refuses a producer with no recorded sites instead of granting the org", () => {
        const d = planConversion({ producer: producer(), sites: [], mappings: [] });
        expect(d.ok).toBe(false);
        if (d.ok) return;
        expect(d.code).toBe("no_boundary_recorded");
        // The refusal must say why, because "grant the org" is the tempting wrong move.
        expect(d.detail).toMatch(/broaden/i);
    });

    it("does not resurrect a revoked producer as a working installation", () => {
        const d = planConversion({ producer: producer({ status: "revoked" }), sites: sites(SITE_1), mappings: [] });
        expect(d.ok).toBe(false);
        if (!d.ok) expect(d.code).toBe("producer_not_active");
    });

    it("refuses a capability it cannot express as a public scope", () => {
        const d = planConversion({ producer: producer({ capabilities: ["attendance.invent"] }), sites: sites(SITE_1), mappings: [] });
        expect(d.ok).toBe(false);
        if (!d.ok) expect(d.code).toBe("unmappable_capability");
    });

    it("refuses when one external id claims two different children", () => {
        const d = planConversion({
            producer: producer(),
            sites: sites(SITE_1),
            mappings: [mapping(), mapping({ child_customer_member_id: "cm-OTHER" })],
        });
        expect(d.ok).toBe(false);
        if (!d.ok) expect(d.code).toBe("ambiguous_mapping");
    });

    it("tolerates the same mapping appearing twice with the same target", () => {
        const d = planConversion({ producer: producer(), sites: sites(SITE_1), mappings: [mapping(), mapping()] });
        expect(d.ok).toBe(true);
        if (!d.ok) return;
        expect(d.plan.resourceRefs).toHaveLength(1);
    });

    it("refuses a producer with no producer key, because provenance would break", () => {
        const d = planConversion({ producer: producer({ producer_key: "" }), sites: sites(SITE_1), mappings: [] });
        expect(d.ok).toBe(false);
        if (!d.ok) expect(d.code).toBe("no_producer_key");
    });
});
