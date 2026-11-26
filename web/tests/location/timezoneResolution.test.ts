import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    buildOperationalTimeContext,
    dualTimeLabel,
    formatInLocationTz,
    isDateOnly,
    resolveLocationTimezone,
    resolveRecipientTimezone,
    resolveViewerTimezone,
} from "@/lib/location/timezoneResolution";
import type { TimezoneResolution } from "@/lib/location/timezoneResolutionModel";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    ORG_ID,
    type OperationalEnrollmentMockStore,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

const CHI: TimezoneResolution = { timezone: "America/Chicago", source: "location_metadata", status: "resolved", warnings: [] };
const NY: TimezoneResolution = { timezone: "America/New_York", source: "viewer", status: "resolved", warnings: [] };
const UNRESOLVED: TimezoneResolution = { timezone: null, source: "unresolved", status: "incomplete", warnings: [{ code: "x", message: "y" }] };

function setup(seed: Partial<OperationalEnrollmentMockStore>) {
    return createOperationalEnrollmentMockSupabase(createOperationalEnrollmentMockStore(seed));
}

describe("isDateOnly", () => {
    it("detects bare calendar dates", () => {
        expect(isDateOnly("2026-06-01")).toBe(true);
        expect(isDateOnly("2026-06-01T12:00:00Z")).toBe(false);
    });
});

describe("formatInLocationTz — DST-safe, date-only preserving", () => {
    it("applies the correct offset across DST (EST vs EDT)", () => {
        expect(formatInLocationTz("2026-01-15T12:00:00Z", NY, "yyyy-MM-dd HH:mm")).toBe("2026-01-15 07:00"); // EST -05
        expect(formatInLocationTz("2026-07-15T12:00:00Z", NY, "yyyy-MM-dd HH:mm")).toBe("2026-07-15 08:00"); // EDT -04
    });
    it("returns date-only values unchanged (no shift)", () => {
        expect(formatInLocationTz("2026-06-01", CHI)).toBe("2026-06-01");
    });
    it("returns null for an unresolved zone (never defaults to UTC)", () => {
        expect(formatInLocationTz("2026-07-15T12:00:00Z", UNRESOLVED)).toBeNull();
    });
});

describe("dualTimeLabel", () => {
    it("combines when zones differ, primary-only when same/unresolved", () => {
        const combined = dualTimeLabel("2026-07-15T18:00:00Z", CHI, NY);
        expect(combined).toContain("·");
        expect(dualTimeLabel("2026-07-15T18:00:00Z", CHI, CHI)).not.toContain("·");
        expect(dualTimeLabel("2026-07-15T18:00:00Z", CHI, UNRESOLVED)).not.toContain("·");
    });
});

describe("buildOperationalTimeContext", () => {
    it("flags dual display only when a secondary zone differs", () => {
        expect(buildOperationalTimeContext({ instant: "i", location: CHI, viewer: NY }).requiresDualTimeDisplay).toBe(true);
        expect(buildOperationalTimeContext({ instant: "i", location: CHI, viewer: CHI }).requiresDualTimeDisplay).toBe(false);
        expect(buildOperationalTimeContext({ instant: "i", location: CHI, viewer: UNRESOLVED }).requiresDualTimeDisplay).toBe(false);
    });
});

describe("resolveLocationTimezone — ladder (never silent UTC)", () => {
    it("resolves from location metadata timezone", async () => {
        const supabase = setup({
            locations: [{ id: "site-a", org_id: ORG_ID, location_type: "site", is_active: true, metadata: { timezone: "America/Chicago" } }],
        });
        const r = await resolveLocationTimezone(supabase, ORG_ID, "site-a");
        expect(r).toMatchObject({ timezone: "America/Chicago", source: "location_metadata", status: "resolved" });
    });
    it("falls back to the org default when the location has no timezone", async () => {
        const supabase = setup({
            locations: [{ id: "site-a", org_id: ORG_ID, location_type: "site", is_active: true, metadata: {} }],
            org_settings: [{ id: "os-1", org_id: ORG_ID, metadata: { timezone: "America/Denver" } }],
        });
        const r = await resolveLocationTimezone(supabase, ORG_ID, "site-a");
        expect(r).toMatchObject({ timezone: "America/Denver", source: "org_default", status: "resolved" });
    });
    it("returns unresolved (not UTC) when neither location nor org has a timezone", async () => {
        const supabase = setup({
            locations: [{ id: "site-a", org_id: ORG_ID, location_type: "site", is_active: true, metadata: {} }],
            org_settings: [{ id: "os-1", org_id: ORG_ID, metadata: {} }],
        });
        const r = await resolveLocationTimezone(supabase, ORG_ID, "site-a");
        expect(r.timezone).toBeNull();
        expect(r.source).toBe("unresolved");
        expect(r.status).toBe("incomplete");
    });
});

describe("resolveViewerTimezone", () => {
    it("resolves from the user profile timezone", async () => {
        const client = {
            from(table: string) {
                const chain = {
                    select: () => chain,
                    eq: () => chain,
                    maybeSingle: async () =>
                        table === "user_profiles" ? { data: { timezone: "America/Los_Angeles" }, error: null } : { data: null, error: null },
                };
                return chain;
            },
        } as unknown as SupabaseClient;
        const r = await resolveViewerTimezone(client, { userId: "u1", orgId: ORG_ID });
        expect(r).toMatchObject({ timezone: "America/Los_Angeles", source: "viewer", status: "resolved" });
    });
    it("falls back to org default, then unresolved", async () => {
        const withOrg = setup({ org_settings: [{ id: "os-1", org_id: ORG_ID, metadata: { timezone: "America/Chicago" } }] });
        expect((await resolveViewerTimezone(withOrg, { userId: "u1", orgId: ORG_ID })).source).toBe("org_default");
        const noOrg = setup({ org_settings: [{ id: "os-1", org_id: ORG_ID, metadata: {} }] });
        expect((await resolveViewerTimezone(noOrg, { userId: "u1", orgId: ORG_ID })).source).toBe("unresolved");
    });
});

describe("resolveRecipientTimezone", () => {
    it("uses a valid candidate, else org default, else unresolved", async () => {
        const withOrg = setup({ org_settings: [{ id: "os-1", org_id: ORG_ID, metadata: { timezone: "America/Chicago" } }] });
        expect(await resolveRecipientTimezone(withOrg, { orgId: ORG_ID, candidateTimezone: "America/New_York" })).toMatchObject({
            timezone: "America/New_York",
            source: "recipient",
        });
        expect((await resolveRecipientTimezone(withOrg, { orgId: ORG_ID, candidateTimezone: "Not/AZone" })).source).toBe("org_default");
        const noOrg = setup({ org_settings: [{ id: "os-1", org_id: ORG_ID, metadata: {} }] });
        expect((await resolveRecipientTimezone(noOrg, { orgId: ORG_ID, candidateTimezone: null })).source).toBe("unresolved");
    });
});
