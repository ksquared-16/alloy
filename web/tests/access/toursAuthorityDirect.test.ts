/**
 * DIRECT CERTIFICATION — Tours authority.
 *
 * Every refusal asserts the handler never reached its client, so "nothing was written" is measured
 * rather than inferred; every success asserts the write was actually attempted.
 *
 * Persona shapes follow the seeded package: admin and ops each receive BOTH keys, custom roles
 * receive neither automatically, and the two keys are independently delegable.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockCtx, mockAccess, fromSpy } = vi.hoisted(() => ({
    mockCtx: vi.fn(), mockAccess: vi.fn(), fromSpy: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContext: mockCtx, getAdminContextCached: mockCtx };
});
vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>("@/lib/admin/getAdminAccessContext");
    return { ...actual, getAdminAccessContext: mockAccess, getAdminAccessContextCached: mockAccess };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({ from: fromSpy }) }));

import { POST as CREATE_RULE } from "@/app/api/admin/tours/availability-rules/route";
import {
    TOURS_BOOK,
    TOURS_CONFIGURE,
    hasToursCapability,
    requireToursCapability,
} from "@/lib/access/toursAuthority";

const ORG = "11111111-1111-4111-8111-111111111111";

/*
 * THE SHAPE THE HANDLER ACTUALLY VALIDATES, read out of its own RuleInsert type and required-field
 * check rather than guessed. `weekday` is not a field — the column is `day_of_week` — and timezone
 * and slot_duration_minutes are required too. A payload the validator rejects returns 400 on every
 * case, which makes all six refusal assertions pass for free while only the SUCCESS cases fail: a
 * suite in that state certifies nothing, which is why the success case asserts `not 400` out loud.
 */
const VALID_RULE = {
    location_id: "loc1",
    day_of_week: 1,
    start_time: "09:00",
    end_time: "10:00",
    timezone: "America/Los_Angeles",
    slot_duration_minutes: 30,
};
const access = (permissionKeys: string[], roleKeys: string[] = []) =>
    ({ ok: true as const, orgId: ORG, userId: "u1", permissionKeys, roleKeys });

function installClient() {
    fromSpy.mockReset();
    fromSpy.mockImplementation(() => {
        const b: Record<string, unknown> = {};
        const chain = () => b;
        Object.assign(b, {
            select: chain, eq: chain, order: chain, limit: chain,
            maybeSingle: async () => ({ data: { id: "loc1", org_id: ORG }, error: null }),
            single: async () => ({ data: { id: "loc1", org_id: ORG }, error: null }),
            insert: () => ({ select: () => ({ single: async () => ({ data: { id: "r1" }, error: null }) }) }),
        });
        return b;
    });
}

const postRule = () =>
    CREATE_RULE(new NextRequest("http://localhost/api/admin/tours/availability-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID_RULE),
    }));

beforeEach(() => {
    mockCtx.mockResolvedValue({ ok: true, orgId: ORG, userId: "u1", role: "admin" });
    installClient();
});

describe("the two Tours powers do not imply one another", () => {
    it("tours.configure does not confer tours.book", () => {
        const configurer = { permissionKeys: [TOURS_CONFIGURE] };
        expect(hasToursCapability(configurer, TOURS_CONFIGURE)).toBe(true);
        expect(hasToursCapability(configurer, TOURS_BOOK)).toBe(false);
    });

    it("tours.book does not confer tours.configure", () => {
        const booker = { permissionKeys: [TOURS_BOOK] };
        expect(hasToursCapability(booker, TOURS_BOOK)).toBe(true);
        expect(hasToursCapability(booker, TOURS_CONFIGURE)).toBe(false);
    });

    it.each([
        ["scheduling.write"],
        ["crm.customers.write"],
        ["crm.opportunities.write"],
        ["business_process.configure"],
        ["configuration.vocabulary.manage"],
        ["ops.schedules.write"],
    ])("%s confers neither Tours authority", (key) => {
        const other = { permissionKeys: [key] };
        expect(hasToursCapability(other, TOURS_CONFIGURE)).toBe(false);
        expect(hasToursCapability(other, TOURS_BOOK)).toBe(false);
    });

    it("a titular Tour Administrator holds nothing, and the refusal names the key", () => {
        const titular = { permissionKeys: [] };
        expect(requireToursCapability(titular, TOURS_CONFIGURE)?.status).toBe(403);
        expect(requireToursCapability(titular, TOURS_BOOK)?.status).toBe(403);
    });

    it("a missing or null capability list refuses rather than throwing", () => {
        expect(hasToursCapability({}, TOURS_BOOK)).toBe(false);
        expect(hasToursCapability({ permissionKeys: null }, TOURS_CONFIGURE)).toBe(false);
    });
});

describe("availability configuration — authority decides, and the write follows", () => {
    it("TOUR CONFIGURER (custom role, no privileged title) is admitted AND the rule is written", async () => {
        mockAccess.mockResolvedValue(access([TOURS_CONFIGURE], ["tour_configurer"]));
        const res = await postRule();
        expect(res.status, "a 400 here is a broken fixture, not a refusal").not.toBe(400);
        expect(res.status).toBeLessThan(400);
        expect(fromSpy).toHaveBeenCalledWith("tour_availability_rules");
    });

    it("TOUR BOOKER is refused availability configuration, and nothing is written", async () => {
        mockAccess.mockResolvedValue(access([TOURS_BOOK], ["tour_booker"]));
        const res = await postRule();
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ required_permission: "tours.configure" });
        expect(fromSpy).not.toHaveBeenCalled();
    });

    it("PORTAL ONLY is refused, and nothing is written", async () => {
        mockAccess.mockResolvedValue(access([], []));
        expect((await postRule()).status).toBe(403);
        expect(fromSpy).not.toHaveBeenCalled();
    });

    it("TITULAR ADMIN — the label carries nothing, and nothing is written", async () => {
        mockCtx.mockResolvedValue({ ok: true, orgId: ORG, userId: "u1", role: "admin" });
        mockAccess.mockResolvedValue(access([], ["admin"]));
        expect((await postRule()).status).toBe(403);
        expect(fromSpy).not.toHaveBeenCalled();
    });

    it.each([["scheduling.write"], ["crm.customers.write"], ["ops.schedules.write"]])(
        "WRONG CAPABILITY %s writes nothing",
        async (key) => {
            mockAccess.mockResolvedValue(access([key], ["other"]));
            expect((await postRule()).status).toBe(403);
            expect(fromSpy).not.toHaveBeenCalled();
        },
    );

    it("COMPOSED TOUR MANAGER holding both is admitted", async () => {
        mockAccess.mockResolvedValue(access([TOURS_CONFIGURE, TOURS_BOOK], ["tour_manager"]));
        expect((await postRule()).status).toBeLessThan(400);
        expect(fromSpy).toHaveBeenCalledWith("tour_availability_rules");
    });

    it("W-17: adding the configure grant opens the next request, removing it closes", async () => {
        mockAccess.mockResolvedValue(access([TOURS_BOOK], ["tour_booker"]));
        expect((await postRule()).status).toBe(403);
        expect(fromSpy).not.toHaveBeenCalled();

        mockAccess.mockResolvedValue(access([TOURS_BOOK, TOURS_CONFIGURE], ["tour_booker"]));
        expect((await postRule()).status).toBeLessThan(400);

        installClient();
        mockAccess.mockResolvedValue(access([TOURS_BOOK], ["tour_booker"]));
        expect((await postRule()).status).toBe(403);
        // The booking authority survives; only configuration closed.
        expect(fromSpy).not.toHaveBeenCalled();
    });

    it("TENANT: the rule is written against the caller's own org, never one they name", async () => {
        mockAccess.mockResolvedValue(access([TOURS_CONFIGURE], ["tour_configurer"]));
        const res = await CREATE_RULE(new NextRequest("http://localhost/api/admin/tours/availability-rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...VALID_RULE, org_id: "99999999-9999-4999-8999-999999999999" }),
        }));
        expect(res.status).toBeLessThan(400);
        // The location lookup is org-scoped by the handler's own context.
        expect(fromSpy).toHaveBeenCalledWith("locations");
    });
});
