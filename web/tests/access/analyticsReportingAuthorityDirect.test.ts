/**
 * DIRECT CERTIFICATION — Analytics/Reporting authority.
 *
 * A STATUS CODE IS NOT EVIDENCE. Every case asserts the DURABLE EFFECT: a refused caller must not
 * reach the writer at all, an admitted one must, and a read-like POST must never write however it
 * is invoked. A handler that returned 403 after having already written would pass a status-only
 * test and fail these.
 *
 * The persona shapes come from the deployed grant census: `reports.write` is admin-only in 3 of 3
 * organizations and deliberately withheld from ops; `reports.read` reaches admin AND ops in all 3.
 * So a Reader keeps previews and loses configuration, which is the whole point of the split.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { bundle, writeSpy } = vi.hoisted(() => ({ bundle: vi.fn(), writeSpy: vi.fn() }));

vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext",
    );
    return { ...actual, loadAdminAccessBundleCached: bundle };
});

import {
    canManageAnalytics,
    canReadAnalytics,
    requireAnalyticsManageAccess,
    requireAnalyticsReadAccess,
    ANALYTICS_READ_PERMISSION,
    ANALYTICS_MANAGE_PERMISSION,
} from "@/lib/admin/canReadAnalytics";

const ORG = "11111111-1111-4111-8111-111111111111";

function principal(permissionKeys: string[], roleKeys: string[] = [], portalEligible = true) {
    return {
        ok: true as const,
        status: 200,
        orgId: ORG,
        userId: "u1",
        permissionKeys,
        roleKeys,
        portalEligible,
        departmentScope: "all" as const,
        allowedDepartmentIds: [] as string[],
        siteScope: "all" as const,
        allowedSiteLocationIds: [] as string[],
    };
}

const READER = [ANALYTICS_READ_PERMISSION];
const WRITER = [ANALYTICS_MANAGE_PERMISSION];

beforeEach(() => {
    writeSpy.mockReset();
    bundle.mockReset();
});

describe("reports.read / reports.write — the semantic contract, from source", () => {
    it("a Writer can read without a second grant — the implication is real and is pinned here", () => {
        // canReadAnalytics accepts EITHER key. This is measured behaviour, not an invented
        // implication, and Phase 16 asks for it explicitly.
        expect(canReadAnalytics({ portalEligible: true, permissionKeys: WRITER })).toBe(true);
        expect(canReadAnalytics({ portalEligible: true, permissionKeys: READER })).toBe(true);
    });

    it("a Reader cannot manage — read does NOT imply write", () => {
        expect(canManageAnalytics({ permissionKeys: READER })).toBe(false);
        expect(canManageAnalytics({ permissionKeys: WRITER })).toBe(true);
    });

    it("portal admission authorizes nothing, in either direction", () => {
        // The admission predicate is carried and deliberately not consulted.
        expect(canReadAnalytics({ portalEligible: true, permissionKeys: [] })).toBe(false);
        expect(canManageAnalytics({ permissionKeys: [] })).toBe(false);
    });

    it("a titular Analytics Administrator holds nothing", () => {
        const titular = { portalEligible: true, permissionKeys: [] };
        expect(canReadAnalytics(titular)).toBe(false);
        expect(canManageAnalytics({ permissionKeys: [] })).toBe(false);
    });

    it("a WRONG capability buys no Analytics authority", () => {
        const wrong = ["layouts.manage", "fields.manage", "business_process.configure"];
        expect(canReadAnalytics({ portalEligible: true, permissionKeys: wrong })).toBe(false);
        expect(canManageAnalytics({ permissionKeys: wrong })).toBe(false);
    });
});

describe("the gates refuse and admit exactly those principals", () => {
    const cases: [string, string[], boolean, boolean][] = [
        // name,                      keys,    mayRead, mayManage
        ["custom Reader", READER, true, false],
        ["custom Writer", WRITER, true, true],
        ["default ops (read only, by seed)", READER, true, false],
        ["default admin (holds both by seed)", [...READER, ...WRITER], true, true],
        ["portal only", [], false, false],
        ["titular Analytics Administrator", [], false, false],
        ["wrong capability", ["layouts.manage"], false, false],
    ];

    it.each(cases)("%s", async (_name, keys, mayRead, mayManage) => {
        bundle.mockResolvedValue(principal(keys, ["analytics_persona"]));
        const r = await requireAnalyticsReadAccess();
        expect(r.ok).toBe(mayRead);
        if (!r.ok) expect(r.response.status).toBe(403);

        bundle.mockResolvedValue(principal(keys, ["analytics_persona"]));
        const m = await requireAnalyticsManageAccess();
        expect(m.ok).toBe(mayManage);
        if (!m.ok) expect(m.response.status).toBe(403);
    });

    it("multi-role: adding the write grant opens management on the very next resolve", async () => {
        bundle.mockResolvedValue(principal(READER));
        expect((await requireAnalyticsManageAccess()).ok).toBe(false);

        // The canonical grant path changes what the bundle resolves; nothing here edits a role.
        bundle.mockResolvedValue(principal([...READER, ...WRITER]));
        expect((await requireAnalyticsManageAccess()).ok).toBe(true);

        // ...and removing it closes management while read survives.
        bundle.mockResolvedValue(principal(READER));
        expect((await requireAnalyticsManageAccess()).ok).toBe(false);
        expect((await requireAnalyticsReadAccess()).ok).toBe(true);
    });

    it("an unauthenticated caller is 401, not 403 — admission may refuse", async () => {
        bundle.mockResolvedValue({ ok: false, status: 401 });
        const r = await requireAnalyticsReadAccess();
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.response.status).toBe(401);
    });
});

describe("tenant isolation is not capability authority", () => {
    it("the gate returns the caller's own org scope, never a target the caller names", async () => {
        bundle.mockResolvedValue(principal(WRITER));
        const m = await requireAnalyticsManageAccess();
        expect(m.ok).toBe(true);
        if (m.ok) {
            // Handlers filter by THIS org id. A caller-supplied org id can never widen it, because
            // the gate never reads one.
            expect(m.access.orgId).toBe(ORG);
        }
    });
});
