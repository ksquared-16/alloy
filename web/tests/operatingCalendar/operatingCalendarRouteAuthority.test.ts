/**
 * Operating Calendar authoring — who may author what, measured at the route.
 *
 * Every refusal is measured: the ledger intake is never reached.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAccess, authored, db } = vi.hoisted(() => ({
    mockAccess: vi.fn(),
    authored: [] as unknown[],
    db: { tables: {} as Record<string, Record<string, unknown>[]> },
}));

vi.mock("@/lib/adminAuth", () => ({ requireAdminOrOps: async () => null }));
vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>("@/lib/admin/getAdminAccessContext");
    return { ...actual, getAdminAccessContext: mockAccess, getAdminAccessContextCached: mockAccess };
});
vi.mock("@/lib/supabaseAdmin", async () => {
    const { fakeSupabase } = await import("./fakeSupabase");
    return { createAdminClient: () => fakeSupabase(db.tables) };
});
vi.mock("@/lib/admin/timezoneContract", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/timezoneContract")>("@/lib/admin/timezoneContract");
    return { ...actual, fetchOperationalTimezoneForOrg: async () => ({ iana: "America/Los_Angeles", source: "operational" }) };
});
vi.mock("@/lib/location/timezoneResolution", () => ({
    resolveLocationTimezone: async (_s: unknown, _o: string, id: string) =>
        id === SITE_NO_TZ
            ? { timezone: null, source: "unresolved", status: "incomplete", warnings: [] }
            : { timezone: "America/New_York", source: "location_metadata", status: "resolved", warnings: [] },
}));
vi.mock("@/lib/operationalExpectations/intake/authorOperationalExpectation", () => ({
    authorOperationalExpectation: async (input: unknown) => {
        authored.push(input);
        return { status: "authored", act: { id: "00000000-0000-4000-8000-00000000abcd" }, authoringActEventId: "e", idempotent: false };
    },
}));

import { POST } from "@/app/api/admin/operating-calendar/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "99999999-9999-4999-8999-999999999999";
const SITE = "22222222-2222-4222-8222-222222222222";
const OTHER_SITE = "33333333-3333-4333-8333-333333333333";
const SITE_NO_TZ = "55555555-5555-4555-8555-555555555555";
const ROOM = "44444444-4444-4444-8444-444444444444";
const FOREIGN_ENTRY = "66666666-6666-4666-8666-666666666666";

function access(over: Record<string, unknown> = {}) {
    return {
        ok: true,
        orgId: ORG,
        userId: "77777777-7777-4777-8777-777777777777",
        permissionKeys: ["settings.manage"],
        roleKeys: ["admin"],
        departmentScope: "all",
        allowedDepartmentIds: [],
        siteScope: "all",
        allowedSiteLocationIds: [],
        ...over,
    };
}

const post = (body: unknown) =>
    POST(new NextRequest("http://localhost/api/admin/operating-calendar", { method: "POST", body: JSON.stringify(body) }));

const closure = (over: Record<string, unknown> = {}) => ({
    mode: "commit",
    action: "create",
    entry: {
        scope: "location",
        location_id: SITE,
        name: "Snow day",
        designation: "closure",
        effect: "closed",
        from_date: "2027-01-12",
        to_date: "2027-01-12",
        ...over,
    },
});

beforeEach(() => {
    authored.length = 0;
    mockAccess.mockResolvedValue(access());
    db.tables = {
        locations: [
            { id: SITE, org_id: ORG, label: "Main", location_type: "site", parent_location_id: null, archived_at: null },
            { id: OTHER_SITE, org_id: ORG, label: "North", location_type: "site", parent_location_id: null, archived_at: null },
            { id: SITE_NO_TZ, org_id: ORG, label: "No zone", location_type: "site", parent_location_id: null, archived_at: null },
            { id: ROOM, org_id: ORG, label: "Toddlers", location_type: "unit", parent_location_id: SITE, archived_at: null },
        ],
        operational_expectations: [
            {
                id: FOREIGN_ENTRY,
                org_id: OTHER_ORG,
                lineage_root_id: FOREIGN_ENTRY,
                subject_kind: "site",
                subject_ref: [{ kind: "site", ref: OTHER_SITE }],
                condition: { typeKey: "location.operating_calendar", predicateShape: "calendar_closed", params: {} },
                valid_from: "2027-01-12T05:00:00.000Z",
                valid_to: "2027-01-13T05:00:00.000Z",
                authored_at: "2026-10-01T00:00:00.000Z",
            },
        ],
    };
});

describe("Operating Calendar authority", () => {
    it("a location entry with settings.manage is authored through the ledger intake, in the site's zone", async () => {
        const res = await post(closure());
        expect(res.status).toBe(200);
        expect(authored).toHaveLength(1);
        const input = authored[0] as { subjects: unknown; temporalFrame: { validFrom: string }; condition: { typeKey: string } };
        expect(input.subjects).toEqual([{ kind: "site", ref: SITE }]);
        expect(input.condition.typeKey).toBe("location.operating_calendar");
        // Local midnight in New York (EST, UTC-5).
        expect(input.temporalFrame.validFrom).toBe("2027-01-12T05:00:00.000Z");
    });

    it("without settings.manage it is refused and nothing is authored", async () => {
        mockAccess.mockResolvedValue(access({ permissionKeys: ["tours.configure", "attendance.record"] }));
        const res = await post(closure());
        expect(res.status).toBe(403);
        expect(authored).toEqual([]);
    });

    it("a location-restricted administrator cannot author an organization default", async () => {
        mockAccess.mockResolvedValue(access({ siteScope: "restricted", allowedSiteLocationIds: [SITE] }));
        const res = await post(closure({ scope: "organization", location_id: undefined }));
        expect(res.status).toBe(403);
        expect(authored).toEqual([]);
    });

    it("…can author for their own site, and cannot for another site", async () => {
        mockAccess.mockResolvedValue(access({ siteScope: "restricted", allowedSiteLocationIds: [SITE] }));
        expect((await post(closure())).status).toBe(200);
        expect((await post(closure({ location_id: OTHER_SITE }))).status).toBe(403);
        expect(authored).toHaveLength(1);
    });

    it("a room is not a calendar scope", async () => {
        const res = await post(closure({ location_id: ROOM }));
        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe("not_a_site");
        expect(authored).toEqual([]);
    });

    it("another tenant's entry cannot be revised or withdrawn — it does not exist here", async () => {
        const res = await post({ mode: "commit", action: "withdraw", entry_id: FOREIGN_ENTRY });
        expect(res.status).toBe(404);
        expect(authored).toEqual([]);
    });

    it("a location with no resolvable zone refuses rather than guessing UTC", async () => {
        const res = await post(closure({ location_id: SITE_NO_TZ }));
        expect(res.status).toBe(409);
        expect((await res.json()).code).toBe("timezone_unresolved");
        expect(authored).toEqual([]);
    });

    it("an interval crossing midnight is refused as a supported limitation", async () => {
        const res = await post(closure({ effect: "partial_closure", start_time: "22:00", end_time: "02:00" }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/cross midnight are not supported/);
        expect(authored).toEqual([]);
    });

    it("a preview writes nothing", async () => {
        const res = await post({ ...closure(), mode: "preview" });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.mode).toBe("preview");
        expect(body.dates.map((d: { date: string; after: { status: string } }) => [d.date, d.after.status])).toEqual([["2027-01-12", "closed"]]);
        expect(authored).toEqual([]);
    });
});
