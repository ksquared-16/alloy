import { describe, expect, it } from "vitest";
import {
    canonicalLocationDisplay,
    isInSiteScope,
    normalizeLocationRow,
    resolveLocationById,
    resolveLocationHierarchy,
    resolveLocationsForOrganization,
    resolveLocationsForUser,
    resolveSiteLocations,
} from "@/lib/location/canonicalLocationProvider";
import type { CanonicalLocation } from "@/lib/location/canonicalLocationModel";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

const OTHER_ORG = "org-other";

function loc(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
        org_id: ORG_ID,
        label: null,
        location_number: null,
        location_type: "site",
        parent_location_id: null,
        status_key: null,
        is_active: true,
        is_primary: false,
        address1: null,
        address2: null,
        city: null,
        state: null,
        postal_code: null,
        country: null,
        lat: null,
        lng: null,
        metadata: {},
        ...overrides,
    };
}

function setup() {
    const store = createOperationalEnrollmentMockStore({
        locations: [
            loc({ id: "site-b", label: "Bravo Campus", location_type: "site", metadata: { timezone: "America/Chicago" } }),
            loc({ id: "site-a", label: "Alpha Campus", location_type: "site" }),
            loc({ id: "site-inactive", label: "Closed Campus", location_type: "site", is_active: false }),
            loc({ id: "room-a1", label: "Infant Room", location_type: "unit", parent_location_id: "site-a" }),
            loc({ id: "room-b1", label: "Toddler Room", location_type: "unit", parent_location_id: "site-b" }),
            loc({ id: "addr-1", label: "123 Home St", location_type: "address", address1: "123 Home St", city: "Austin" }),
            loc({ id: "other-site", org_id: OTHER_ORG, label: "Other Org Site", location_type: "site" }),
        ],
    });
    return createOperationalEnrollmentMockSupabase(store);
}

describe("normalizeLocationRow — total normalizer", () => {
    it("maps a full row and derives timezoneRef from metadata", () => {
        const c = normalizeLocationRow(loc({ id: "s", label: "Site", location_number: 7, metadata: { timezone: "America/Chicago" } }));
        expect(c.type).toBe("site");
        expect(c.name).toBe("Site");
        expect(c.locationNumber).toBe(7);
        expect(c.timezoneRef).toBe("America/Chicago");
        expect(c.isActive).toBe(true);
    });
    it("never throws on missing optionals; is_active null is active", () => {
        const c = normalizeLocationRow({ id: "x", org_id: ORG_ID, location_type: "unit" });
        expect(c.name).toBeNull();
        expect(c.address).toBeNull();
        expect(c.isActive).toBe(true);
        expect(c.timezoneRef).toBeNull();
    });
    it("coerces bigint-as-string location_number and unknown type to address", () => {
        expect(normalizeLocationRow(loc({ location_number: "42" })).locationNumber).toBe(42);
        expect(normalizeLocationRow(loc({ location_type: "weird" })).type).toBe("address");
    });
});

describe("canonicalLocationDisplay", () => {
    it("prefers name, falls back to address parts", () => {
        expect(canonicalLocationDisplay(normalizeLocationRow(loc({ label: "Named" })))).toBe("Named");
        expect(
            canonicalLocationDisplay(normalizeLocationRow(loc({ label: null, address1: "1 Main", city: "Austin", postal_code: "78701" })))
        ).toBe("1 Main, Austin, 78701");
    });
});

describe("isInSiteScope", () => {
    const site = (id: string): CanonicalLocation => normalizeLocationRow(loc({ id, location_type: "site" })) as CanonicalLocation;
    const room = (id: string, parent: string): CanonicalLocation =>
        normalizeLocationRow(loc({ id, location_type: "unit", parent_location_id: parent })) as CanonicalLocation;
    it("undefined scope is org-wide", () => {
        expect(isInSiteScope(site("s1"), undefined)).toBe(true);
    });
    it("sites must be listed; units must hang off an allowed site", () => {
        const scope = { siteLocationIds: ["s1"] };
        expect(isInSiteScope(site("s1"), scope)).toBe(true);
        expect(isInSiteScope(site("s2"), scope)).toBe(false);
        expect(isInSiteScope(room("r1", "s1"), scope)).toBe(true);
        expect(isInSiteScope(room("r2", "s2"), scope)).toBe(false);
    });
});

describe("resolveLocationsForOrganization", () => {
    it("excludes address + inactive, returns sites+rooms, deterministic by label", async () => {
        const supabase = setup();
        const result = await resolveLocationsForOrganization(supabase, ORG_ID);
        expect(result.map((l) => l.id)).toEqual(["site-a", "site-b", "room-a1", "room-b1"]);
        expect(result.every((l) => l.type !== "address")).toBe(true);
    });
    it("include_address mode returns the address row too", async () => {
        const supabase = setup();
        const result = await resolveLocationsForOrganization(supabase, ORG_ID, { mode: "include_address" });
        expect(result.some((l) => l.id === "addr-1")).toBe(true);
    });
    it("honors a site-scope allow-list (site + its rooms only)", async () => {
        const supabase = setup();
        const result = await resolveLocationsForOrganization(supabase, ORG_ID, { siteScope: { siteLocationIds: ["site-a"] } });
        expect(result.map((l) => l.id)).toEqual(["site-a", "room-a1"]);
    });
    it("never returns another org's locations", async () => {
        const supabase = setup();
        const result = await resolveLocationsForOrganization(supabase, ORG_ID, { mode: "include_address" });
        expect(result.some((l) => l.id === "other-site")).toBe(false);
    });
    it("includeInactive surfaces closed sites", async () => {
        const supabase = setup();
        const result = await resolveLocationsForOrganization(supabase, ORG_ID, { includeInactive: true });
        expect(result.some((l) => l.id === "site-inactive")).toBe(true);
    });
});

describe("resolveSiteLocations / resolveLocationsForUser", () => {
    it("returns active sites only", async () => {
        const supabase = setup();
        const sites = await resolveSiteLocations(supabase, ORG_ID);
        expect(sites.map((l) => l.id)).toEqual(["site-a", "site-b"]);
    });
    it("restricts to the site-scope allow-list (pushed to the query)", async () => {
        const supabase = setup();
        const sites = await resolveSiteLocations(supabase, ORG_ID, { siteScope: { siteLocationIds: ["site-b"] } });
        expect(sites.map((l) => l.id)).toEqual(["site-b"]);
    });
    it("resolveLocationsForUser applies the user's site scope", async () => {
        const supabase = setup();
        const visible = await resolveLocationsForUser(supabase, ORG_ID, { siteLocationIds: ["site-b"] });
        expect(visible.map((l) => l.id)).toEqual(["site-b", "room-b1"]);
    });
    it("empty allow-list yields nothing", async () => {
        const supabase = setup();
        const visible = await resolveLocationsForUser(supabase, ORG_ID, { siteLocationIds: [] });
        expect(visible).toEqual([]);
    });
});

describe("resolveLocationById", () => {
    it("resolves a site by id", async () => {
        const supabase = setup();
        expect((await resolveLocationById(supabase, ORG_ID, "site-a"))?.name).toBe("Alpha Campus");
    });
    it("excludes an address row in childcare mode, includes it on opt-in", async () => {
        const supabase = setup();
        expect(await resolveLocationById(supabase, ORG_ID, "addr-1")).toBeNull();
        expect((await resolveLocationById(supabase, ORG_ID, "addr-1", { mode: "include_address" }))?.id).toBe("addr-1");
    });
    it("returns null across org boundary and for empty id", async () => {
        const supabase = setup();
        expect(await resolveLocationById(supabase, ORG_ID, "other-site")).toBeNull();
        expect(await resolveLocationById(supabase, ORG_ID, "")).toBeNull();
    });
});

describe("resolveLocationHierarchy", () => {
    it("returns a site with its unit children only", async () => {
        const supabase = setup();
        const hierarchy = await resolveLocationHierarchy(supabase, ORG_ID, "site-a");
        expect(hierarchy?.site.id).toBe("site-a");
        expect(hierarchy?.rooms.map((r) => r.id)).toEqual(["room-a1"]);
    });
    it("returns null for a non-site id (a room is not a site)", async () => {
        const supabase = setup();
        expect(await resolveLocationHierarchy(supabase, ORG_ID, "room-a1")).toBeNull();
    });
});
