/**
 * WS0-A / SEC-1 — a snapshot run can only ever compute for the caller's own organization.
 *
 * `/api/admin/analytics/snapshots/run` read `body.org_id ?? session org` for BOTH auth branches, so
 * an operator holding `reports.write` in org A could name org B and have the service-role client
 * evaluate B's definitions against B's data and write rows into B. The real route handlers run here
 * with the real `requireAnalyticsManageAccess`; only the session, the cron credential check and the
 * runner/writer (so the test can see which org they were asked to compute for) are substituted.
 *
 * The cron branch is a separate machine credential and keeps targeting by id — and it must not
 * inherit anything from a user session.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, invokeRoute } from "../harness/routeInvoker";

const ORG_A = "aaaaaaaa-1111-4111-8111-111111111111";
const ORG_B = "bbbbbbbb-2222-4222-8222-222222222222";

const state = vi.hoisted(() => ({
    cron: false,
    bundle: null as unknown,
    adminCtx: null as unknown,
}));

const runner = vi.hoisted(() => ({
    runMetricSnapshotsForOrg: vi.fn(async (_db: unknown, opts: { orgId: string }) => ({ orgId: opts.orgId, written: 1, skipped: 0, errors: [] })),
    runAllOrgMetricPlatformSnapshots: vi.fn(async () => ({ orgs: 2, written: 2, skipped: 0, errors: [] })),
}));

const writer = vi.hoisted(() => ({
    writeOrgMetricSnapshots: vi.fn(async (p: { orgId: string }) => ({ orgId: p.orgId, written: 1, skipped: 0, errors: [] })),
    writeAllOrgMetricSnapshots: vi.fn(async () => ({ orgs: 2, written: 2, skipped: 0, errors: [] })),
}));

vi.mock("@/lib/admin/cronAuth", () => ({ isInternalCronAuthorized: vi.fn(() => state.cron) }));

vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext",
    );
    return {
        ...actual,
        loadAdminAccessBundleCached: vi.fn(async () => state.bundle),
        getAdminAccessContextCached: vi.fn(async () => state.bundle),
    };
});

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: vi.fn(async () => state.adminCtx) };
});

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: vi.fn(() => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) })) }));
vi.mock("@/lib/metrics/platform/metricSnapshotRunner", () => runner);
vi.mock("@/lib/metrics/snapshots/writeOrgMetricSnapshots", () => writer);

import { POST as runPOST } from "@/app/api/admin/analytics/snapshots/run/route";
import { POST as writePOST } from "@/app/api/admin/metrics/snapshots/write/route";

function writerSession(orgId: string, permissionKeys = ["reports.read", "reports.write"]) {
    state.cron = false;
    state.bundle = {
        ok: true,
        orgId,
        departmentScope: "all",
        allowedDepartmentIds: [],
        siteScope: "all",
        allowedSiteLocationIds: [],
        roleKeys: ["admin"],
        permissionKeys,
        portalEligible: true,
    };
    state.adminCtx = { ok: true, orgId, role: "admin", userId: "u-a" };
}

function cronOnly() {
    state.cron = true;
    state.bundle = { ok: false, status: 401 };
    state.adminCtx = { ok: false, status: 401, error: "Unauthorized" };
}

const post = (path: string, body?: Record<string, unknown>) => buildRequest({ method: "POST", path, body: body ?? {} });

beforeEach(() => {
    vi.clearAllMocks();
});

describe("SEC-1 — POST /api/admin/analytics/snapshots/run", () => {
    it("an operator naming ANOTHER organization is refused (403) and nothing is computed", async () => {
        writerSession(ORG_A);
        const res = await invokeRoute(runPOST, post("/api/admin/analytics/snapshots/run", { org_id: ORG_B }));
        expect(res.status).toBe(403);
        expect(runner.runMetricSnapshotsForOrg).not.toHaveBeenCalled();
        expect(runner.runAllOrgMetricPlatformSnapshots).not.toHaveBeenCalled();
    });

    it("an operator with no org in the body runs for the session organization only", async () => {
        writerSession(ORG_A);
        const res = await invokeRoute(runPOST, post("/api/admin/analytics/snapshots/run"));
        expect(res.status).toBe(200);
        expect(runner.runMetricSnapshotsForOrg).toHaveBeenCalledTimes(1);
        expect(runner.runMetricSnapshotsForOrg.mock.calls[0]![1]).toMatchObject({ orgId: ORG_A });
    });

    it("an operator naming their OWN organization is admitted", async () => {
        writerSession(ORG_A);
        const res = await invokeRoute(runPOST, post("/api/admin/analytics/snapshots/run", { org_id: ORG_A }));
        expect(res.status).toBe(200);
        expect(runner.runMetricSnapshotsForOrg.mock.calls[0]![1]).toMatchObject({ orgId: ORG_A });
    });

    it("an operator without reports.write is refused before any body is considered", async () => {
        writerSession(ORG_A, ["reports.read"]);
        const res = await invokeRoute(runPOST, post("/api/admin/analytics/snapshots/run", { org_id: ORG_A }));
        expect(res.status).toBe(403);
        expect(runner.runMetricSnapshotsForOrg).not.toHaveBeenCalled();
    });

    it("cron may target an organization by id, with no user session at all", async () => {
        cronOnly();
        const res = await invokeRoute<{ mode: string }>(runPOST, post("/api/admin/analytics/snapshots/run", { org_id: ORG_B }));
        expect(res.status).toBe(200);
        expect(res.body.mode).toBe("cron_single_org");
        expect(runner.runMetricSnapshotsForOrg.mock.calls[0]![1]).toMatchObject({ orgId: ORG_B });
    });

    it("cron with no org runs every organization", async () => {
        cronOnly();
        const res = await invokeRoute<{ mode: string }>(runPOST, post("/api/admin/analytics/snapshots/run"));
        expect(res.status).toBe(200);
        expect(res.body.mode).toBe("cron_all_orgs");
        expect(runner.runAllOrgMetricPlatformSnapshots).toHaveBeenCalledTimes(1);
    });

    it("no session and no cron credential is refused", async () => {
        state.cron = false;
        state.bundle = { ok: false, status: 401 };
        state.adminCtx = { ok: false, status: 401, error: "Unauthorized" };
        const res = await invokeRoute(runPOST, post("/api/admin/analytics/snapshots/run", { org_id: ORG_B }));
        expect(res.status).toBe(401);
        expect(runner.runMetricSnapshotsForOrg).not.toHaveBeenCalled();
    });
});

describe("WS0-A — POST /api/admin/metrics/snapshots/write (SEC-1 sibling)", () => {
    it("an operator naming another organization is refused (403)", async () => {
        writerSession(ORG_A);
        const res = await invokeRoute(writePOST, post("/api/admin/metrics/snapshots/write", { org_id: ORG_B }));
        expect(res.status).toBe(403);
        expect(writer.writeOrgMetricSnapshots).not.toHaveBeenCalled();
    });

    it("an operator run writes for the session org and never passes the operator's scope to the writer", async () => {
        writerSession(ORG_A);
        const res = await invokeRoute(writePOST, post("/api/admin/metrics/snapshots/write"));
        expect(res.status).toBe(200);
        const params = writer.writeOrgMetricSnapshots.mock.calls[0]![0] as Record<string, unknown>;
        expect(params.orgId).toBe(ORG_A);
        // Rows are labelled org/site and read by everyone entitled to that scope: the writer computes
        // canonically, so no caller scope may be handed in.
        expect(params).not.toHaveProperty("scope");
    });

    it("cron targets by id without a session", async () => {
        cronOnly();
        const res = await invokeRoute(writePOST, post("/api/admin/metrics/snapshots/write", { org_id: ORG_B }));
        expect(res.status).toBe(200);
        expect((writer.writeOrgMetricSnapshots.mock.calls[0]![0] as { orgId: string }).orgId).toBe(ORG_B);
    });
});
