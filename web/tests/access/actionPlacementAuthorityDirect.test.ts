/**
 * DIRECT CERTIFICATION — Action Placement authority.
 *
 * A STATUS CODE IS NOT EVIDENCE. Every refusal asserts the Supabase client was never reached, so
 * "nothing was written" is measured rather than inferred; every admitted request asserts the handler
 * went on to touch the database.
 *
 * The personas that matter here are the plausible-but-wrong ones. A layout manager, a workflow
 * writer and an organization-settings manager each have a reasonable claim on something called a
 * "placement" configured under Settings — and each must be refused, because the row decides which
 * actions a PROCESS STAGE offers and Business Process already owns that.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockCtx, mockAccess, fromSpy } = vi.hoisted(() => ({
    mockCtx: vi.fn(),
    mockAccess: vi.fn(),
    fromSpy: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext",
    );
    return { ...actual, getAdminContext: mockCtx, getAdminContextCached: mockCtx };
});
vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext",
    );
    return { ...actual, getAdminAccessContext: mockAccess, getAdminAccessContextCached: mockAccess };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({ from: fromSpy }) }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/runtime/provisioning/configReadCache", () => ({ invalidateConfigReadCache: vi.fn() }));

import { POST as CREATE } from "@/app/api/admin/action-placements/route";
import { PATCH as EDIT, DELETE as REMOVE } from "@/app/api/admin/action-placements/[id]/route";
import { BUSINESS_PROCESS_CONFIGURE } from "@/lib/access/businessProcessAuthority";

/* Referenced by the lock and the inventory; kept imported so the owner is named in one place. */
void BUSINESS_PROCESS_CONFIGURE;

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const PLACEMENT = "33333333-3333-4333-8333-333333333333";

function principal(permissionKeys: string[], roleKeys: string[] = []) {
    return {
        ok: true as const,
        userId: "user-1",
        orgId: ORG,
        roleKeys,
        permissionKeys,
        departmentScope: "all" as const,
        allowedDepartmentIds: null,
        siteScope: "all" as const,
        allowedSiteLocationIds: null,
    };
}

/* Defined by GRANTS. `roleKeys` is empty on every one of them except the titular admin. */
const CONFIGURER = () => principal([BUSINESS_PROCESS_CONFIGURE]);
const PORTAL_ONLY = () => principal(["portal.access"]);
/** Holds the admin ROLE and no grant — the rule this slice removed would have admitted them. */
const TITULAR_ADMIN = () => principal(["portal.access"], ["admin"]);
const LAYOUT_MANAGER = () => principal(["portal.access", "layouts.manage", "sections.manage"]);
const WORKFLOW_WRITER = () => principal(["portal.access", "ops.workflows.write"]);
const SETTINGS_MANAGER = () => principal(["portal.access", "settings.manage"]);
const WORK_OPERATOR = () => principal(["portal.access", "work.operate", "work.configure"]);
/** Holds ACTIVATE but not CONFIGURE: trusted to switch a configuration live, not to design it. */
const ACTIVATOR = () => principal(["portal.access", "business_process.activate"]);

const createReq = () =>
    new NextRequest("http://localhost/api/admin/action-placements", {
        method: "POST",
        body: JSON.stringify({ action_definition_id: "def-1", surface: "record_header", slot: "primary" }),
    });
const editReq = () =>
    new NextRequest(`http://localhost/api/admin/action-placements/${PLACEMENT}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
    });
const removeReq = () =>
    new NextRequest(`http://localhost/api/admin/action-placements/${PLACEMENT}`, { method: "DELETE" });
const idCtx = { params: Promise.resolve({ id: PLACEMENT }) };

const CALLS: [string, () => Promise<Response>][] = [
    ["create", () => CREATE(createReq())],
    ["edit", () => EDIT(editReq(), idCtx)],
    ["remove", () => REMOVE(removeReq(), idCtx)],
];

beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.mockResolvedValue({ ok: true, orgId: ORG, userId: "user-1", role: "admin" });
    fromSpy.mockImplementation(() => {
        throw new Error("supabase must not be reached on a refusal");
    });
});

describe("Action Placement direct — the owner is admitted", () => {
    it.each(CALLS)("a Business Process configurer reaches the database on %s", async (_label, call) => {
        mockAccess.mockResolvedValue(CONFIGURER());
        const reached: string[] = [];
        fromSpy.mockImplementation((t: string) => {
            reached.push(t);
            throw new Error("stop after the gate");
        });
        await expect(call()).rejects.toThrow("stop after the gate");
        expect(reached.length, "authority admitted; the handler went on to the database").toBeGreaterThan(0);
    });
});

describe("Action Placement direct — who is refused, and nothing is written", () => {
    const REFUSED: [string, () => ReturnType<typeof principal>][] = [
        ["portal admission alone", PORTAL_ONLY],
        ["the admin ROLE with no grant", TITULAR_ADMIN],
        ["a layout manager — the noun is 'placement', the owner is not", LAYOUT_MANAGER],
        ["a workflow writer — placements position actions, they do not author automations", WORKFLOW_WRITER],
        ["an organization settings manager — living under Settings is not an owner", SETTINGS_MANAGER],
        ["a work operator", WORK_OPERATOR],
        ["a process ACTIVATOR who cannot configure", ACTIVATOR],
    ];

    for (const [label, who] of REFUSED) {
        it.each(CALLS)(`${label} is refused on %s`, async (_l, call) => {
            mockAccess.mockResolvedValue(who());
            const res = await call();
            expect(res.status).toBe(403);
            /*
             * `requireBusinessProcessCapability` answers `{ error: "Forbidden" }` and does NOT name
             * the key, unlike the Enrollment and Work helpers which return `required_permission`.
             * That is a pre-existing inconsistency in the SHARED Business Process helper: changing
             * it here would alter the refusal body of every BP-gated route in the product, which is
             * not this slice's to do. So this asserts what the helper actually does, and the
             * divergence is reported rather than quietly "fixed" as a side effect.
             */
            expect(await res.json()).toMatchObject({ error: "Forbidden" });
            expect(fromSpy, "a refusal must not reach the database").not.toHaveBeenCalled();
        });
    }
});

describe("Action Placement direct — tenant isolation", () => {
    it.each(CALLS)("a principal resolved into another organization writes nothing on %s", async (_l, call) => {
        /*
         * The handlers pin every query to `ctx.orgId` and never read an org from the body, so a
         * caller whose context resolves elsewhere cannot address this organization's rows. Asserted
         * by driving the org context to OTHER_ORG and proving the row is never found.
         */
        mockCtx.mockResolvedValue({ ok: true, orgId: OTHER_ORG, userId: "user-1", role: "admin" });
        mockAccess.mockResolvedValue({ ...CONFIGURER(), orgId: OTHER_ORG });
        const writes: unknown[] = [];
        fromSpy.mockImplementation(() => ({
            select: () => ({
                eq: () => ({
                    eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                    maybeSingle: async () => ({ data: null, error: null }),
                }),
            }),
            insert: (v: unknown) => {
                writes.push(v);
                return { select: () => ({ single: async () => ({ data: null, error: null }) }) };
            },
            update: (v: unknown) => {
                writes.push(v);
                return { eq: () => ({ eq: async () => ({ error: null }) }) };
            },
            delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        }));
        const res = await call();
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(writes, "no foreign-org row may be written").toEqual([]);
    });
});

describe("Action Placement direct — W-17 composition, no TTL", () => {
    it("granting the owner opens the next request; revoking closes it", async () => {
        // No grant row is edited and no clock advanced: each call resolves its own context.
        mockAccess.mockResolvedValue(PORTAL_ONLY());
        expect((await CREATE(createReq())).status).toBe(403);
        expect(fromSpy).not.toHaveBeenCalled();

        mockAccess.mockResolvedValue(CONFIGURER());
        const reached: string[] = [];
        fromSpy.mockImplementation((t: string) => {
            reached.push(t);
            throw new Error("stop after the gate");
        });
        await expect(CREATE(createReq())).rejects.toThrow("stop after the gate");
        expect(reached.length).toBeGreaterThan(0);

        fromSpy.mockImplementation(() => {
            throw new Error("supabase must not be reached on a refusal");
        });
        mockAccess.mockResolvedValue(PORTAL_ONLY());
        expect((await CREATE(createReq())).status).toBe(403);
    });

    it("a role TITLE never substitutes for the grant", async () => {
        mockAccess.mockResolvedValue(
            principal(["portal.access"], ["admin", "ops", "business_process_admin"]),
        );
        expect((await CREATE(createReq())).status).toBe(403);
        expect(fromSpy).not.toHaveBeenCalled();
    });
});
