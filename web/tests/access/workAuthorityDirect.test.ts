/**
 * DIRECT CERTIFICATION — Work authority.
 *
 * Every refusal asserts the handler never reached its client, so "nothing was written" is measured
 * rather than inferred. The persona shapes follow the seeded package: admin holds BOTH keys, ops
 * holds only `work.operate`, and custom roles hold neither automatically.
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

import { POST as CREATE_WORK_UNIT } from "@/app/api/admin/work-units/route";
import {
    WORK_CONFIGURE,
    WORK_OPERATE,
    WORK_CAPABILITIES,
    hasWorkCapability,
    requireWorkCapability,
} from "@/lib/access/workAuthority";

const ORG = "11111111-1111-4111-8111-111111111111";
const access = (permissionKeys: string[], roleKeys: string[] = []) =>
    ({ ok: true as const, orgId: ORG, userId: "u1", permissionKeys, roleKeys,
       departmentScope: "all" as const, allowedDepartmentIds: [] as string[],
       siteScope: "all" as const, allowedSiteLocationIds: [] as string[] });

function installClient() {
    fromSpy.mockReset();
    fromSpy.mockImplementation(() => {
        const b: Record<string, unknown> = {};
        const chain = () => b;
        Object.assign(b, {
            select: chain, eq: chain, order: chain, limit: chain,
            maybeSingle: async () => ({ data: { id: "d1", org_id: ORG }, error: null }),
            single: async () => ({ data: { id: "d1", org_id: ORG }, error: null }),
            insert: () => ({ select: () => ({ single: async () => ({ data: { id: "w1" }, error: null }) }) }),
        });
        return b;
    });
}

/*
 * The shape the handler validates, read from its own body parser rather than guessed — a payload
 * the validator rejects returns 400 on every case and makes refusals pass for free.
 */
const VALID = { department_id: "d1", key: "intake", name: "Intake" };

const post = () =>
    CREATE_WORK_UNIT(new NextRequest("http://localhost/api/admin/work-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
    }));

beforeEach(() => {
    mockCtx.mockResolvedValue({ ok: true, orgId: ORG, userId: "u1", role: "admin" });
    installClient();
});

describe("configure and operate do not imply one another", () => {
    it("work.configure does not confer work.operate", () => {
        const c = { permissionKeys: [WORK_CONFIGURE] };
        expect(hasWorkCapability(c, WORK_CONFIGURE)).toBe(true);
        expect(hasWorkCapability(c, WORK_OPERATE)).toBe(false);
    });

    it("work.operate does not confer work.configure — the ops package depends on this", () => {
        // Ops is seeded operate ONLY. If operate implied configure, the seeded asymmetry would be
        // decorative and every ops user could redefine the organization's work.
        const o = { permissionKeys: [WORK_OPERATE] };
        expect(hasWorkCapability(o, WORK_OPERATE)).toBe(true);
        expect(hasWorkCapability(o, WORK_CONFIGURE)).toBe(false);
    });

    it.each([
        ["ops.workflows.write"],
        ["business_process.configure"],
        ["business_process.activate"],
        ["ai.enrichment.use"],
        ["communications.assign"],
        ["configuration.vocabulary.manage"],
    ])("%s confers neither Work authority", (key) => {
        const other = { permissionKeys: [key] };
        expect(hasWorkCapability(other, WORK_CONFIGURE)).toBe(false);
        expect(hasWorkCapability(other, WORK_OPERATE)).toBe(false);
    });

    it("the capability set is exactly two — no work.assign, no work.manage", () => {
        expect([...WORK_CAPABILITIES].sort()).toEqual(["work.configure", "work.operate"]);
    });

    it("a titular Admin holds nothing, and the refusal names the key", () => {
        const titular = { permissionKeys: [] };
        expect(requireWorkCapability(titular, WORK_CONFIGURE)?.status).toBe(403);
        expect(requireWorkCapability(titular, WORK_OPERATE)?.status).toBe(403);
    });

    it("a missing or null capability list refuses rather than throwing", () => {
        expect(hasWorkCapability({}, WORK_OPERATE)).toBe(false);
        expect(hasWorkCapability({ permissionKeys: null }, WORK_CONFIGURE)).toBe(false);
    });
});

describe("defining work — authority decides, and the write follows", () => {
    it("WORK CONFIGURER (custom role, no privileged title) is admitted AND the unit is written", async () => {
        mockAccess.mockResolvedValue(access([WORK_CONFIGURE], ["work_configurer"]));
        const res = await post();
        expect(res.status, "a 400 here is a broken fixture, not a refusal").not.toBe(400);
        expect(res.status).toBeLessThan(400);
        expect(fromSpy).toHaveBeenCalledWith("work_units");
    });

    it("WORK OPERATOR is refused — and this is the ops package boundary", async () => {
        mockAccess.mockResolvedValue(access([WORK_OPERATE], ["work_operator"]));
        const res = await post();
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ required_permission: "work.configure" });
        expect(fromSpy).not.toHaveBeenCalled();
    });

    it("DEFAULT OPS shape (operate only) cannot define work", async () => {
        mockAccess.mockResolvedValue(access(["portal.access", WORK_OPERATE], ["ops"]));
        expect((await post()).status).toBe(403);
        expect(fromSpy).not.toHaveBeenCalled();
    });

    it("DEFAULT ADMIN shape (both keys) can", async () => {
        mockAccess.mockResolvedValue(access(["portal.access", WORK_CONFIGURE, WORK_OPERATE], ["admin"]));
        expect((await post()).status).toBeLessThan(400);
        expect(fromSpy).toHaveBeenCalledWith("work_units");
    });

    it("PORTAL ONLY is refused, and nothing is written", async () => {
        mockAccess.mockResolvedValue(access(["portal.access"], []));
        expect((await post()).status).toBe(403);
        expect(fromSpy).not.toHaveBeenCalled();
    });

    it("TITULAR ADMIN — the label carries nothing, and nothing is written", async () => {
        mockCtx.mockResolvedValue({ ok: true, orgId: ORG, userId: "u1", role: "admin" });
        mockAccess.mockResolvedValue(access([], ["admin"]));
        expect((await post()).status).toBe(403);
        expect(fromSpy).not.toHaveBeenCalled();
    });

    it.each([["ops.workflows.write"], ["business_process.configure"], ["ai.enrichment.use"]])(
        "WRONG CAPABILITY %s writes nothing",
        async (key) => {
            mockAccess.mockResolvedValue(access([key], ["other"]));
            expect((await post()).status).toBe(403);
            expect(fromSpy).not.toHaveBeenCalled();
        },
    );

    it("W-17: adding configure opens the next request, removing it closes, operate survives", async () => {
        mockAccess.mockResolvedValue(access([WORK_OPERATE], ["front_desk"]));
        expect((await post()).status).toBe(403);
        expect(fromSpy).not.toHaveBeenCalled();

        mockAccess.mockResolvedValue(access([WORK_OPERATE, WORK_CONFIGURE], ["front_desk"]));
        expect((await post()).status).toBeLessThan(400);

        installClient();
        mockAccess.mockResolvedValue(access([WORK_OPERATE], ["front_desk"]));
        expect((await post()).status).toBe(403);
        expect(fromSpy).not.toHaveBeenCalled();
        // ...and the operate authority is untouched by the removal.
        expect(hasWorkCapability({ permissionKeys: [WORK_OPERATE] }, WORK_OPERATE)).toBe(true);
    });

    it("TENANT: the unit is written against the caller's own org, never one they name", async () => {
        mockAccess.mockResolvedValue(access([WORK_CONFIGURE], ["work_configurer"]));
        const res = await CREATE_WORK_UNIT(new NextRequest("http://localhost/api/admin/work-units", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...VALID, org_id: "99999999-9999-4999-8999-999999999999" }),
        }));
        expect(res.status).toBeLessThan(400);
        expect(fromSpy).toHaveBeenCalledWith("work_units");
    });
});
