/**
 * DIRECT CERTIFICATION — the Business Process residual: defining an Action, and validating a draft.
 *
 * A STATUS CODE IS NOT EVIDENCE. Every refusal asserts the Supabase client was never reached, so
 * "nothing was written" is measured rather than inferred; every admission asserts the handler went
 * on to touch the row it named.
 *
 * The personas that matter are the plausible-but-wrong ones, and two are sharp:
 *
 *   THE ACTIVATOR   `business_process.activate` is trusted to switch a configuration live. Deciding
 *                   what an Action IS, or declaring a draft fit to publish, is `configure`. The two
 *                   are deliberately independent and this proves the split holds on both handlers.
 *
 *   THE EXECUTOR    a holder of the DOMAIN capabilities that let someone RUN actions — enrollment
 *                   decisions, work operation, CRM writes — must still be refused here. Running an
 *                   Action and defining one are different powers, and Model D depends on that.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockCtx, mockAccess, fromSpy, adminOrOps, recordValidation, readDraft } = vi.hoisted(() => ({
    mockCtx: vi.fn(),
    mockAccess: vi.fn(),
    fromSpy: vi.fn(),
    adminOrOps: vi.fn(),
    recordValidation: vi.fn(),
    readDraft: vi.fn(),
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
vi.mock("@/lib/adminAuth", () => ({ requireAdminOrOps: adminOrOps }));
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => ({ from: fromSpy }) }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/runtime/provisioning/configReadCache", () => ({ invalidateConfigReadCache: vi.fn() }));
vi.mock("@/lib/businessProcesses/configuration/businessProcessConfigurationService", () => ({
    readDraft,
    recordDraftValidation: recordValidation,
    latestPublication: vi.fn().mockResolvedValue(null),
    loadPublishedConfiguration: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/admin/assertRowOrg", () => ({ assertRowOrg: vi.fn().mockResolvedValue({ ok: true }) }));

import { PATCH as EDIT_DEFINITION } from "@/app/api/admin/action-definitions/[id]/route";
import { POST as VALIDATE } from "@/app/api/admin/business-process/configuration/validate/route";
import {
    BUSINESS_PROCESS_ACTIVATE,
    BUSINESS_PROCESS_CONFIGURE,
} from "@/lib/access/businessProcessAuthority";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const DEF = "33333333-3333-4333-8333-333333333333";
const DEPT = "44444444-4444-4444-8444-444444444444";

const ctxWith = (permissionKeys: string[], role = "member", orgId = ORG) => ({
    ok: true as const,
    userId: "user-1",
    orgId,
    role,
    roleKeys: role === "member" ? [] : [role],
    permissionKeys,
});

/* Defined by GRANTS. `role` is "member" on every one of them except the titular admin. */
const CONFIGURER = () => ctxWith([BUSINESS_PROCESS_CONFIGURE]);
const ACTIVATOR = () => ctxWith(["portal.access", BUSINESS_PROCESS_ACTIVATE]);
const PORTAL_ONLY = () => ctxWith(["portal.access"]);
/** Holds the admin ROLE and no grant — the rule this slice removed would have admitted them. */
const TITULAR_ADMIN = () => ctxWith(["portal.access"], "admin");
/** Holds the admin role AND the default admin package. */
const DEFAULT_ADMIN = () => ctxWith(["portal.access", BUSINESS_PROCESS_CONFIGURE, BUSINESS_PROCESS_ACTIVATE], "admin");
/** The ops default package carries neither Business Process key. */
const DEFAULT_OPS = () =>
    ctxWith(
        ["portal.access", "work.operate", "crm.customers.write", "enrollment.decide", "attendance.record", "settings.manage"],
        "ops",
    );
const WORK_OPERATOR = () => ctxWith(["portal.access", "work.operate", "work.configure"]);
/** Every domain capability that lets someone RUN an action — and none that lets them define one. */
const ACTION_EXECUTOR = () =>
    ctxWith([
        "portal.access",
        "enrollment.decide",
        "enrollment.record.manage",
        "work.operate",
        "crm.customers.write",
        "attendance.record",
        "tours.book",
        "fin.write",
    ]);

const editReq = () =>
    new NextRequest(`http://localhost/api/admin/action-definitions/${DEF}`, {
        method: "PATCH",
        body: JSON.stringify({ label: "Renamed by the test", is_active: false }),
    });
const idCtx = { params: Promise.resolve({ id: DEF }) };
const editDefinition = () => EDIT_DEFINITION(editReq(), idCtx);

const validateReq = () =>
    new NextRequest("http://localhost/api/admin/business-process/configuration/validate", {
        method: "POST",
        body: JSON.stringify({ department_id: DEPT }),
    });
const validate = () => VALIDATE(validateReq());

/** The definition row the handler expects to find, owned by the caller's org. */
function supabaseServingDefinition(orgIdOfRow: string, writes: unknown[], reached: string[]) {
    return (table: string) => {
        reached.push(table);
        return {
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: { id: DEF, org_id: orgIdOfRow }, error: null }),
                }),
            }),
            update: (v: unknown) => {
                writes.push(v);
                return {
                    eq: () => ({
                        eq: () => ({
                            select: () => ({ maybeSingle: async () => ({ data: { id: DEF, label: "x" }, error: null }) }),
                        }),
                    }),
                };
            },
        };
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    adminOrOps.mockResolvedValue(null); // admission passes; authority is what is under test
    mockAccess.mockResolvedValue({
        ok: true,
        userId: "user-1",
        orgId: ORG,
        roleKeys: [],
        permissionKeys: [],
        departmentScope: "all",
        allowedDepartmentIds: null,
        siteScope: "all",
        allowedSiteLocationIds: null,
    });
    readDraft.mockResolvedValue({ payload: {}, draft_status: "draft" });
    recordValidation.mockResolvedValue({ payload: {}, draft_status: "validated" });
    fromSpy.mockImplementation(() => {
        throw new Error("supabase must not be reached on a refusal");
    });
});

describe("Action definition direct — the owner is admitted and the row changes", () => {
    it("a Business Process configurer edits the definition, and the update carries what was asked", async () => {
        const writes: unknown[] = [];
        const reached: string[] = [];
        mockCtx.mockResolvedValue(CONFIGURER());
        fromSpy.mockImplementation(supabaseServingDefinition(ORG, writes, reached));

        const res = await editDefinition();
        expect(res.status, `refused unexpectedly: ${JSON.stringify(await res.clone().json())}`).toBe(200);
        expect(reached).toContain("action_definitions");
        expect(writes).toHaveLength(1);
        // The exact fields asked for, not a default — and `is_active:false` withdraws the Action
        // from every stage that offers it, which is why this key and not a role title.
        expect(writes[0]).toMatchObject({ label: "Renamed by the test", is_active: false });
    });

    it("the default administrator is admitted — by the package, not the title", async () => {
        const writes: unknown[] = [];
        const reached: string[] = [];
        mockCtx.mockResolvedValue(DEFAULT_ADMIN());
        fromSpy.mockImplementation(supabaseServingDefinition(ORG, writes, reached));
        expect((await editDefinition()).status).toBe(200);
        expect(writes).toHaveLength(1);
    });
});

describe("Action definition direct — who is refused, and nothing is written", () => {
    const REFUSED: [string, () => ReturnType<typeof ctxWith>][] = [
        ["portal admission alone", PORTAL_ONLY],
        ["the admin ROLE with no grant — the rule this slice removed", TITULAR_ADMIN],
        ["a process ACTIVATOR who cannot configure", ACTIVATOR],
        ["a work operator", WORK_OPERATOR],
        ["a holder of every capability that RUNS actions — execution is not definition", ACTION_EXECUTOR],
        ["the default ops package, which carries neither Business Process key", DEFAULT_OPS],
    ];

    it.each(REFUSED)("%s is refused", async (_label, who) => {
        mockCtx.mockResolvedValue(who());
        const res = await editDefinition();
        expect(res.status).toBe(403);
        expect(fromSpy, "a refusal must not reach the database").not.toHaveBeenCalled();
    });
});

describe("Action definition direct — tenant isolation", () => {
    it("a definition owned by another organization is refused and never updated", async () => {
        const writes: unknown[] = [];
        const reached: string[] = [];
        mockCtx.mockResolvedValue(CONFIGURER());
        // The row exists, but it belongs to OTHER_ORG.
        fromSpy.mockImplementation(supabaseServingDefinition(OTHER_ORG, writes, reached));
        const res = await editDefinition();
        expect(res.status).toBe(403);
        expect(writes, "no foreign-org row may be written").toEqual([]);
    });

    it("a platform-managed definition is refused even to the owner key", async () => {
        const writes: unknown[] = [];
        const reached: string[] = [];
        mockCtx.mockResolvedValue(CONFIGURER());
        fromSpy.mockImplementation(() => {
            reached.push("action_definitions");
            return {
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: DEF, org_id: null }, error: null }) }) }),
                update: (v: unknown) => {
                    writes.push(v);
                    return { eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };
                },
            };
        });
        expect((await editDefinition()).status).toBe(403);
        expect(writes).toEqual([]);
    });
});

describe("Action definition direct — W-17 composition, no TTL", () => {
    it("granting configure opens the next request; revoking closes it", async () => {
        // No grant row is edited and no clock advanced: each call resolves its own context.
        mockCtx.mockResolvedValue(PORTAL_ONLY());
        expect((await editDefinition()).status).toBe(403);
        expect(fromSpy).not.toHaveBeenCalled();

        const writes: unknown[] = [];
        const reached: string[] = [];
        mockCtx.mockResolvedValue(CONFIGURER());
        fromSpy.mockImplementation(supabaseServingDefinition(ORG, writes, reached));
        expect((await editDefinition()).status).toBe(200);
        expect(writes).toHaveLength(1);

        fromSpy.mockImplementation(() => {
            throw new Error("supabase must not be reached on a refusal");
        });
        mockCtx.mockResolvedValue(PORTAL_ONLY());
        expect((await editDefinition()).status).toBe(403);
    });
});

describe("Validate direct — it persists, so it is gated", () => {
    it("the configurer validates, and the draft status write is reached", async () => {
        mockCtx.mockResolvedValue(CONFIGURER());
        const res = await validate();
        expect(res.status, `refused unexpectedly: ${JSON.stringify(await res.clone().json())}`).toBe(200);
        expect(recordValidation, "validating IS the write — it flips draft_status to validated").toHaveBeenCalledTimes(1);
        expect(recordValidation.mock.calls[0][1]).toMatchObject({ orgId: ORG, departmentId: DEPT });
    });

    const REFUSED: [string, () => ReturnType<typeof ctxWith>][] = [
        ["portal admission alone — the gate this slice closed", PORTAL_ONLY],
        ["the admin ROLE with no grant", TITULAR_ADMIN],
        ["a process ACTIVATOR — switching a configuration live is not declaring one fit to publish", ACTIVATOR],
        ["the default ops package", DEFAULT_OPS],
        ["a work operator", WORK_OPERATOR],
    ];

    it.each(REFUSED)("%s is refused, and no draft is marked validated", async (_label, who) => {
        mockCtx.mockResolvedValue(who());
        const res = await validate();
        expect(res.status).toBe(403);
        expect(recordValidation, "a refusal must not advance the publication workflow").not.toHaveBeenCalled();
        expect(readDraft, "authority settles before the draft is even read").not.toHaveBeenCalled();
    });

    it("granting configure opens the next validate; revoking closes it", async () => {
        mockCtx.mockResolvedValue(PORTAL_ONLY());
        expect((await validate()).status).toBe(403);
        expect(recordValidation).not.toHaveBeenCalled();

        mockCtx.mockResolvedValue(CONFIGURER());
        expect((await validate()).status).toBe(200);
        expect(recordValidation).toHaveBeenCalledTimes(1);

        recordValidation.mockClear();
        mockCtx.mockResolvedValue(PORTAL_ONLY());
        expect((await validate()).status).toBe(403);
        expect(recordValidation).not.toHaveBeenCalled();
    });

    it("the write is addressed with the caller's org, never the body's", async () => {
        mockCtx.mockResolvedValue({ ...CONFIGURER(), orgId: OTHER_ORG });
        mockAccess.mockResolvedValue({
            ok: true, userId: "user-1", orgId: OTHER_ORG, roleKeys: [], permissionKeys: [],
            departmentScope: "all", allowedDepartmentIds: null, siteScope: "all", allowedSiteLocationIds: null,
        });
        await validate();
        expect(recordValidation.mock.calls[0][1].orgId).toBe(OTHER_ORG);
    });
});
