/**
 * THE ACCOUNTS LIST GATES ON THE KEYS THIS REQUEST ALREADY RESOLVED.
 *
 * `/subjects` and `/position` start in parallel when Accounts opens, and each used to re-read
 * `user_roles` then `role_permission_grants` to learn `fin.read` — measured on deployed staging at
 * `perm;dur=` 248ms and 256ms, in two requests that had both already paid for exactly those rows
 * via `loadAdminRouteGate`. The gate hands them over as `ctx.permissionKeys`, and
 * `resolveAdminAccessCore.fetchPermissionKeys` and `resolveActorPermissionGrants` read the same
 * table with the same predicates, so the second read learned nothing new.
 *
 * This is a security boundary, so it is tested by EXECUTING each route. The properties asserted are
 * the ones the database-backed gate guaranteed: a caller without the capability is refused and gets
 * no cohort, an unestablished capability is refused, the answer is recomputed per request so a
 * revocation denies the next one, one principal's or organization's keys never decide another's
 * request, and the capability step does not touch the grants tables.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockLoadAdminRouteGate, mockCreateAdminClient, mockSubjects, mockPosition } = vi.hoisted(() => ({
    mockLoadAdminRouteGate: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    mockSubjects: vi.fn(),
    mockPosition: vi.fn(),
}));

vi.mock("@/lib/admin/adminRouteGate", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/adminRouteGate")>(
        "@/lib/admin/adminRouteGate",
    );
    return { ...actual, loadAdminRouteGate: mockLoadAdminRouteGate };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: mockCreateAdminClient }));
vi.mock("@/lib/financials/workspace/resolveFinancialSubjects", () => ({
    resolveFinancialSubjectCohort: mockSubjects,
    FINANCIAL_SUBJECT_SCAN_CAP: 2000,
}));
/*
 * The cohort's facts are now acquired in ONE round trip before the resolver runs. Stubbed here so
 * this file keeps testing what it is about — that the capability is answered from the request's own
 * keys — and NOT the acquisition. The stub is deliberately placed after the capability gate in the
 * route, so a caller without `fin.read` never reaches it; the denial assertions below are unchanged
 * and still fail if the gate moves.
 */
vi.mock("@/lib/financials/workspace/readAccountSubjectFacts", () => ({
    readAccountSubjectFacts: vi.fn(async () => ({
        households: [], members: [], agreement_sites_direct: [], agreement_sites_orphan: [],
        orphan_members: [], contacts: [], placements: [], enrolment_intents: [],
        program_labels: [], room_labels: [],
    })),
}));
vi.mock("@/lib/financials/workspace/resolveFinancialPosition", () => ({
    resolveFinancialPositionCohort: mockPosition,
}));

const { GET: SUBJECTS } = await import("@/app/api/admin/financials/subjects/route");
const { GET: POSITION } = await import("@/app/api/admin/financials/position/route");

const ALLOWED_KEYS = ["fin.read", "fin.write"];
const DENIED_KEYS = ["enrollment.read"];
const SECRET = "cohort-secret-value";

const gateWith = (keys: readonly string[] | null | undefined, over: Record<string, unknown> = {}) => ({
    ok: true,
    orgId: "org-1",
    userId: "user-1",
    role: "admin",
    roleKeys: ["admin"],
    access: {
        ok: true,
        orgId: "org-1",
        userId: "user-1",
        roleKeys: ["admin"],
        siteScope: "all",
        allowedSiteLocationIds: [],
        departmentScope: "all",
        allowedDepartmentIds: [],
        ...(keys === undefined ? {} : { permissionKeys: keys }),
        ...over,
    },
    dim: {},
});

const req = (p: string) => new NextRequest(`https://example.test/api/admin/financials/${p}`);

beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAdminClient.mockReturnValue({});
    mockSubjects.mockResolvedValue({ subjects: [{ id: SECRET }] });
    mockPosition.mockResolvedValue({ rows: [{ id: SECRET }] });
    mockLoadAdminRouteGate.mockResolvedValue(gateWith(ALLOWED_KEYS));
});

const ROUTES = [
    ["subjects", () => SUBJECTS(req("subjects"))],
    ["position", () => POSITION(req("position"))],
] as const;

describe.each(ROUTES)("%s — capability from the request's own context", (name, call) => {
    it("refuses a caller who holds other grants but not fin.read, and returns no cohort", async () => {
        mockLoadAdminRouteGate.mockResolvedValue(gateWith(DENIED_KEYS));
        const res = await call();
        expect(res.status).toBe(403);
        const body = await res.text();
        expect(body, "no cohort reaches a refused caller").not.toContain(SECRET);
        expect(JSON.parse(body)).toMatchObject({ required_permission: "fin.read" });
    });

    // Fail closed on every shape of "the capability was never established".
    it.each([
        ["absent", undefined],
        ["null", null],
        ["empty", [] as readonly string[]],
    ])("refuses when permission keys are %s", async (_label, keys) => {
        mockLoadAdminRouteGate.mockResolvedValue(gateWith(keys));
        const res = await call();
        expect(res.status).toBe(403);
        expect(await res.text()).not.toContain(SECRET);
    });

    it("recomputes per request — a revocation refuses the very next one", async () => {
        mockLoadAdminRouteGate
            .mockResolvedValueOnce(gateWith(ALLOWED_KEYS))
            .mockResolvedValueOnce(gateWith(DENIED_KEYS));
        expect((await call()).status).toBe(200);
        expect((await call()).status, "no verdict is carried across requests").toBe(403);
    });

    it("judges a second principal on their OWN keys", async () => {
        mockLoadAdminRouteGate
            .mockResolvedValueOnce(gateWith(ALLOWED_KEYS, { userId: "user-1" }))
            .mockResolvedValueOnce(gateWith(DENIED_KEYS, { userId: "user-2" }));
        expect((await call()).status).toBe(200);
        expect((await call()).status).toBe(403);
    });

    it("judges a second organization on its OWN keys", async () => {
        mockLoadAdminRouteGate
            .mockResolvedValueOnce(gateWith(ALLOWED_KEYS, { orgId: "org-1" }))
            .mockResolvedValueOnce(gateWith(DENIED_KEYS, { orgId: "org-2" }));
        expect((await call()).status).toBe(200);
        expect((await call()).status).toBe(403);
    });

    it("does NOT read the grants tables to answer the capability", async () => {
        /*
         * The defect being removed. The cohort resolver is mocked, so the admin client the route
         * builds is reachable only by the permission step; any `.from()` on it is that step
         * re-acquiring what `loadAdminRouteGate` already resolved.
         */
        const from = vi.fn(() => { throw new Error("the capability must not query the grants tables"); });
        mockCreateAdminClient.mockReturnValue({ from });
        const res = await call();
        expect(res.status).toBe(200);
        expect(from, "no grants re-read").not.toHaveBeenCalled();
    });

    it("still serves an authorized caller", async () => {
        const res = await call();
        expect(res.status).toBe(200);
        expect(await res.text()).toContain(SECRET);
    });
});
