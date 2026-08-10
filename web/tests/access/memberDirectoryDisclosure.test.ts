/**
 * W14-F1, disclosure half — the operational roster stops handing every portal-admitted principal
 * the organisation's email list.
 *
 * The mission's acceptance form is that the UI, the route, and effective authorization AGREE — not
 * that each behaves defensibly alone. A route that withholds an address while the component that
 * consumes it still renders one from somewhere else would pass two separate suites and leak
 * anyway. So the agreement tests here do not restate the route's output: they run the real handler
 * and feed its actual JSON to the real consumer's fetcher, then assert what that consumer would
 * put on screen.
 *
 * Two negatives carry the finding and must not be softened into positives:
 *
 *   - a portal-admitted caller WITHOUT `settings.users_roles` receives no address at all, and
 *   - admission is UNCHANGED — a caller the route refused before is refused still. The fix must
 *     narrow disclosure without widening reach, and `getAdminAccessContextCached` (which does not
 *     require `portalEligible`) is right there to widen it by accident.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const webRoot = process.cwd();

const { mockLoadAdminAccessBundleCached, mockGetAdminContextCached } = vi.hoisted(() => ({
    mockLoadAdminAccessBundleCached: vi.fn(),
    mockGetAdminContextCached: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminAccessContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminAccessContext")>(
        "@/lib/admin/getAdminAccessContext"
    );
    return { ...actual, loadAdminAccessBundleCached: mockLoadAdminAccessBundleCached };
});

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>(
        "@/lib/admin/getAdminContext"
    );
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});

const ORG = "org-1";

/** Two members whose local-parts differ from their addresses, so a leak cannot hide in a label. */
const MEMBERS = [
    { user_id: "u-arden", email: "arden@westbrook-example.org" },
    { user_id: "u-bly", email: "bly@westbrook-example.org" },
];

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: vi.fn(() => ({
        from: () => ({
            select: () => ({
                eq: () => ({
                    order: () =>
                        Promise.resolve({
                            data: MEMBERS.map((m) => ({ user_id: m.user_id, role: "ops" })),
                            error: null,
                        }),
                }),
            }),
        }),
        auth: {
            admin: {
                getUserById: (id: string) => {
                    const row = MEMBERS.find((m) => m.user_id === id);
                    return Promise.resolve({
                        data: row
                            ? { user: { email: row.email, created_at: "2026-01-01T00:00:00Z" } }
                            : { user: null },
                    });
                },
            },
        },
    })),
}));

import { GET } from "@/app/api/admin/users/route";
import { fetchOperationalWorkOrgUsers } from "@/components/admin/opportunity/OperationalWorkAssigneeSelect";
import { memberDirectoryLabel, projectMemberEmail } from "@/lib/access/memberDirectoryProjection";

type Caller = {
    label: string;
    portalEligible: boolean;
    roleKeys: string[];
    permissionKeys: string[];
};

const ORG_ADMIN: Caller = { label: "org admin", portalEligible: true, roleKeys: ["admin"], permissionKeys: [] };
const GRANT_HOLDER: Caller = {
    label: "granted, not admin",
    portalEligible: true,
    roleKeys: ["ops"],
    permissionKeys: ["settings.users_roles"],
};
const PORTAL_ONLY: Caller = {
    label: "portal-admitted, no grant",
    portalEligible: true,
    roleKeys: ["ops"],
    permissionKeys: ["opportunities.write"],
};
const NOT_ADMITTED: Caller = {
    label: "not portal-eligible",
    portalEligible: false,
    roleKeys: [],
    permissionKeys: [],
};

function asCaller(caller: Caller) {
    const bundle = {
        ok: true as const,
        userId: "caller-1",
        orgId: ORG,
        roleKeys: caller.roleKeys,
        permissionKeys: caller.permissionKeys,
        departmentScope: "all",
        allowedDepartmentIds: [],
        siteScope: "all",
        allowedSiteLocationIds: [],
        portalEligible: caller.portalEligible,
    };
    mockLoadAdminAccessBundleCached.mockResolvedValue(bundle);
    mockGetAdminContextCached.mockResolvedValue(
        caller.portalEligible
            ? { ok: true, orgId: ORG, role: caller.roleKeys.includes("admin") ? "admin" : "ops", userId: "caller-1" }
            : { ok: false, status: 403 }
    );
}

async function rosterFor(caller: Caller): Promise<{ status: number; users: Array<Record<string, unknown>> }> {
    asCaller(caller);
    const res = await GET();
    const json = (await res.json()) as { users?: Array<Record<string, unknown>> };
    return { status: res.status, users: json.users ?? [] };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("W14-F1 — the projection helpers", () => {
    it("labels from the local-part, never the whole address", () => {
        expect(memberDirectoryLabel("arden@westbrook-example.org", "u-arden")).toBe("arden");
        expect(memberDirectoryLabel("arden@westbrook-example.org", "u-arden")).not.toContain("@");
    });

    it("falls back to a user-id fragment when no address is readable", () => {
        expect(memberDirectoryLabel(null, "u-arden-0123456789")).toBe("u-arden-");
        expect(memberDirectoryLabel("   ", "u-arden-0123456789")).toBe("u-arden-");
    });

    it("withholds the address unless the caller may read it", () => {
        expect(projectMemberEmail("arden@westbrook-example.org", true)).toBe("arden@westbrook-example.org");
        expect(projectMemberEmail("arden@westbrook-example.org", false)).toBeNull();
    });
});

describe("W14-F1 — the route projects the address against the managing capability", () => {
    it.each([ORG_ADMIN, GRANT_HOLDER])("$label reads addresses", async (caller) => {
        const { status, users } = await rosterFor(caller);
        expect(status).toBe(200);
        expect(users).toHaveLength(MEMBERS.length);
        expect(users.map((u) => u.email).sort()).toEqual(MEMBERS.map((m) => m.email).sort());
    });

    it("a portal-admitted caller without the grant receives NO address", async () => {
        const { status, users } = await rosterFor(PORTAL_ONLY);
        expect(status).toBe(200);
        expect(users).toHaveLength(MEMBERS.length);
        for (const u of users) expect(u.email).toBeNull();
    });

    it("no address survives anywhere in that payload, under any key", async () => {
        const { users } = await rosterFor(PORTAL_ONLY);
        const serialized = JSON.stringify(users);
        // The domain is the disclosure. A label may legitimately contain the local-part.
        expect(serialized).not.toContain("westbrook-example.org");
        expect(serialized).not.toContain("@");
    });

    it("still names every member, so the roster remains usable without addresses", async () => {
        const { users } = await rosterFor(PORTAL_ONLY);
        expect(users.map((u) => u.label).sort()).toEqual(["arden", "bly"]);
    });
});

describe("W14-F1 — narrowing disclosure did not widen reach", () => {
    it("a caller who is not portal-eligible is still refused", async () => {
        asCaller(NOT_ADMITTED);
        const res = await GET();
        expect(res.status).toBe(403);
    });

    it("admission is decided by getAdminContextCached, not by the capability bundle", async () => {
        // Portal-refused, yet holding the managing grant: if admission were re-derived from the
        // bundle (which does not require portalEligible) this caller would be let in and would
        // read every address. That is the exact accident this asserts against.
        asCaller({ ...NOT_ADMITTED, permissionKeys: ["settings.users_roles"], roleKeys: ["admin"] });
        const res = await GET();
        expect(res.status).toBe(403);
    });
});

describe("W14-F1 — the picker agrees with the route it consumes", () => {
    /** Runs the real handler, then hands its real JSON to the real consumer. */
    async function pickerOptionsFor(caller: Caller) {
        asCaller(caller);
        const res = await GET();
        const body = await res.json();
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) })
        );
        try {
            return await fetchOperationalWorkOrgUsers();
        } finally {
            vi.unstubAllGlobals();
        }
    }

    it("shows names, not addresses, to a caller without the grant", async () => {
        const options = await pickerOptionsFor(PORTAL_ONLY);
        expect(options.map((o) => o.label)).toEqual(["arden", "bly"]);
        for (const o of options) expect(o.label).not.toContain("@");
    });

    it("shows the SAME names to a caller who may read addresses — the picker never renders one", async () => {
        const granted = await pickerOptionsFor(GRANT_HOLDER);
        const ungranted = await pickerOptionsFor(PORTAL_ONLY);
        expect(granted.map((o) => o.label)).toEqual(ungranted.map((o) => o.label));
        for (const o of granted) expect(o.label).not.toContain("@");
    });

    it("carries no address field into the component at all", async () => {
        const options = await pickerOptionsFor(ORG_ADMIN);
        for (const o of options) expect(Object.keys(o).sort()).toEqual(["label", "user_id"]);
    });
});

describe("W14-F1 — non-vacuity: the removed defect is convicted by name", () => {
    const pickerSource = readFileSync(
        join(webRoot, "components/admin/opportunity/OperationalWorkAssigneeSelect.tsx"),
        "utf8"
    );

    it("the picker no longer prefers a raw address as the option text", () => {
        // The defect was literally `label: row.email?.trim() || row.label`.
        expect(pickerSource).not.toMatch(/row\.email/);
    });

    it("the route reads the managing predicate rather than a second one that agrees today", () => {
        const routeSource = readFileSync(join(webRoot, "app/api/admin/users/route.ts"), "utf8");
        expect(routeSource).toContain("canManageUsersAndRoles");
        // Admission must still come from the portal gate.
        expect(routeSource).toContain("getAdminContextCached");
    });
});
