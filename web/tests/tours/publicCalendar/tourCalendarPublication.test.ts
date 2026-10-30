/**
 * S7 — who may publish a location's public tour calendar, and what a public credential carries.
 *
 * The flag lives on a location-scoped intake link and is server-controlled: Forms authority can
 * edit a link's metadata but can never set or clear the flag that way; only `tour_calendar` sets
 * it, and that needs `tours.configure`.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    buildPublicTourCalendarPath,
    readTourCalendarLinkConfig,
    stripTourCalendarLinkConfig,
    TOUR_CALENDAR_LINK_METADATA_KEY,
    tourCalendarPathFromEmbedPath,
} from "@/lib/tours/publicCalendar/tourCalendarLinkConfig";

const ORG = "11111111-1111-4111-8111-111111111111";
const FORM = "33333333-3333-4333-8333-333333333333";
const LINK = "44444444-4444-4444-8444-444444444444";
const LOCATION = "55555555-5555-4555-8555-555555555555";
const USER = "22222222-2222-4222-8222-222222222222";

const { ctx, linkRow, updates } = vi.hoisted(() => ({
    ctx: { current: null as Record<string, unknown> | null },
    linkRow: { current: null as Record<string, unknown> | null },
    updates: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/admin/getAdminContext", async (orig) => ({
    ...(await orig<typeof import("@/lib/admin/getAdminContext")>()),
    getAdminContextCached: vi.fn(async () => ctx.current),
}));
// The link PATCH scopes the link to the caller's department/site (R2, formsDestinationScope): this suite's actor is
// unrestricted, so the scope check admits every link it edits.
vi.mock("@/lib/admin/getAdminAccessContext", async (orig) => ({
    ...(await orig<typeof import("@/lib/admin/getAdminAccessContext")>()),
    getAdminAccessContextCached: vi.fn(async () => ({
        ok: true, userId: USER, orgId: (ctx.current as { orgId?: string } | null)?.orgId ?? null, roleKeys: ["admin"], permissionKeys: [],
        departmentScope: "all", allowedDepartmentIds: null, siteScope: "all", allowedSiteLocationIds: null,
    })),
}));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/admin/forms/formsAdminDb", () => ({
    dbGetPublicLinkForForm: vi.fn(async () => ({ data: linkRow.current, error: null })),
    dbGetFormDefinition: vi.fn(async () => ({ data: { id: FORM, metadata: {} }, error: null })),
    dbGetVersion: vi.fn(async () => ({ data: null, error: null })),
    dbUpdateFormPublicLinkForForm: vi.fn(async (_s: unknown, _o: string, _f: string, _l: string, patch: Record<string, unknown>) => {
        updates.push(patch);
        return { data: { id: LINK, ...patch }, error: null };
    }),
}));

import { PATCH } from "@/app/api/admin/forms/[formId]/public-links/[linkId]/route";

function patch(body: Record<string, unknown>) {
    return PATCH(new NextRequest("http://localhost/x", { method: "PATCH", body: JSON.stringify(body) }), {
        params: Promise.resolve({ formId: FORM, linkId: LINK }),
    });
}
const leadLinkAtLocation = { lead_capture: true, default_location_id: LOCATION, distribution_context: "location_specific" };

describe("tour calendar link config (pure)", () => {
    it("reads only an explicit enabled flag; anything else is unpublished", () => {
        expect(readTourCalendarLinkConfig({ [TOUR_CALENDAR_LINK_METADATA_KEY]: { enabled: true } }).enabled).toBe(true);
        for (const v of [undefined, null, true, "yes", { enabled: "true" }, { enabled: 1 }, []]) {
            expect(readTourCalendarLinkConfig({ [TOUR_CALENDAR_LINK_METADATA_KEY]: v }).enabled).toBe(false);
        }
        expect(readTourCalendarLinkConfig(null).enabled).toBe(false);
    });
    it("strips the flag from client metadata without touching anything else", () => {
        const input = { label: "North", [TOUR_CALENDAR_LINK_METADATA_KEY]: { enabled: true } };
        expect(stripTourCalendarLinkConfig(input)).toEqual({ label: "North" });
        const untouched = { label: "North" };
        expect(stripTourCalendarLinkConfig(untouched)).toBe(untouched);
    });
    it("derives the hosted calendar path from the link's share path", () => {
        expect(tourCalendarPathFromEmbedPath("/forms/embed/abc_DEF-1")).toBe("/tours/abc_DEF-1");
        expect(tourCalendarPathFromEmbedPath("/elsewhere/abc")).toBeNull();
        expect(buildPublicTourCalendarPath("a b")).toBe("/tours/a%20b");
    });
});

describe("PATCH public link — tour calendar publication authority", () => {
    beforeEach(() => {
        updates.length = 0;
        linkRow.current = { id: LINK, org_id: ORG, metadata: { ...leadLinkAtLocation } };
        ctx.current = { ok: true, orgId: ORG, role: "admin", userId: USER, permissionKeys: ["forms.author", "tours.configure"] };
    });

    it("publishes with forms.author + tours.configure on a location-scoped intake link", async () => {
        const res = await patch({ tour_calendar: true });
        expect(res.status).toBe(200);
        const meta = updates[0]!.metadata as Record<string, unknown>;
        expect(readTourCalendarLinkConfig(meta)).toMatchObject({ enabled: true, enabledByUserId: USER });
        expect(meta.default_location_id).toBe(LOCATION);
    });

    it("refuses forms authority alone (negative control: the Tours capability is required)", async () => {
        ctx.current = { ...ctx.current!, permissionKeys: ["forms.author"] };
        const res = await patch({ tour_calendar: true });
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ required_permission: "tours.configure" });
        expect(updates).toEqual([]);
    });

    it("cannot be smuggled in — or cleared — through ordinary metadata", async () => {
        const res = await patch({ metadata: { label: "X", [TOUR_CALENDAR_LINK_METADATA_KEY]: { enabled: true } } });
        expect(res.status).toBe(200);
        expect(readTourCalendarLinkConfig(updates[0]!.metadata).enabled).toBe(false);

        updates.length = 0;
        linkRow.current = { id: LINK, org_id: ORG, metadata: { ...leadLinkAtLocation, [TOUR_CALENDAR_LINK_METADATA_KEY]: { enabled: true } } };
        await patch({ metadata: { [TOUR_CALENDAR_LINK_METADATA_KEY]: { enabled: false } } });
        expect(readTourCalendarLinkConfig(updates[0]!.metadata).enabled).toBe(true);
    });

    it("needs a location and an intake: the calendar's site and acceptance both come from the link", async () => {
        linkRow.current = { id: LINK, org_id: ORG, metadata: { lead_capture: true } };
        expect((await patch({ tour_calendar: true })).status).toBe(400);
        linkRow.current = { id: LINK, org_id: ORG, metadata: { default_location_id: LOCATION } };
        const res = await patch({ tour_calendar: true });
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: "TOUR_CALENDAR_NEEDS_INTAKE" });
        expect(updates).toEqual([]);
    });

    it("withdraws with the same authority", async () => {
        linkRow.current = { id: LINK, org_id: ORG, metadata: { ...leadLinkAtLocation, [TOUR_CALENDAR_LINK_METADATA_KEY]: { enabled: true } } };
        expect((await patch({ tour_calendar: { enabled: false } })).status).toBe(200);
        expect(readTourCalendarLinkConfig(updates[0]!.metadata).enabled).toBe(false);
    });
});
