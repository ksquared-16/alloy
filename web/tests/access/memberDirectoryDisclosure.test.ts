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
import { readFileSync, readdirSync, statSync } from "node:fs";
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

// W-13/AD-22: an org admin is described by the grant it holds, not by the role string. The literal
// no longer satisfies `canManageUsersAndRoles`, and every org admin holds this key (`20260505120100`,
// `seed_default_rbac`, `20260811120000`).
const ORG_ADMIN: Caller = {
    label: "org admin",
    portalEligible: true,
    roleKeys: ["admin"],
    permissionKeys: ["settings.users_roles"],
};
const GRANT_HOLDER: Caller = {
    label: "granted, not admin",
    portalEligible: true,
    roleKeys: ["ops"],
    permissionKeys: ["settings.users_roles"],
};
/**
 * The `ops` operator AFTER `20260819140000`. `OD-8`'s preservation grant gives every org's `ops`
 * role `settings.users_roles.read`, so this is what an ops principal looks like once the migration
 * has landed: reads the roster, holds no managing capability, sees no addresses.
 */
const OPS_PRESERVED: Caller = {
    label: "ops with the preserved read capability",
    portalEligible: true,
    roleKeys: ["ops"],
    permissionKeys: ["settings.users_roles.read"],
};

/**
 * The same `ops` principal BEFORE the preservation grant — `Q15-B4`'s 2 organizations. Kept as a
 * fixture rather than deleted, because it is the exact population that would have been locked out
 * had the conversion shipped first, and it is why the migration is a hard predecessor rather than a
 * companion.
 */
const OPS_UNPRESERVED: Caller = {
    label: "ops without the read capability (pre-migration)",
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

    it("ops with the preserved read capability reads the roster and NO address", async () => {
        const { status, users } = await rosterFor(OPS_PRESERVED);
        expect(status).toBe(200);
        expect(users).toHaveLength(MEMBERS.length);
        for (const u of users) expect(u.email).toBeNull();
    });

    it("no address survives anywhere in that payload, under any key", async () => {
        const { users } = await rosterFor(OPS_PRESERVED);
        const serialized = JSON.stringify(users);
        // The domain is the disclosure. A label may legitimately contain the local-part.
        expect(serialized).not.toContain("westbrook-example.org");
        expect(serialized).not.toContain("@");
    });

    it("still names every member, so the roster remains usable without addresses", async () => {
        const { users } = await rosterFor(OPS_PRESERVED);
        expect(users.map((u) => u.label).sort()).toEqual(["arden", "bly"]);
    });
});

describe("OD-8 / W-15 — the roster gate is a capability, and the conversion neither widened nor narrowed", () => {
    it("a principal holding no roster capability is refused", async () => {
        const res = await (asCaller(NOT_ADMITTED), GET());
        expect(res.status).toBe(403);
    });

    it("ops WITHOUT the preserved grant is refused — which is why the migration precedes the code", async () => {
        // `Q15-B4`'s two organizations, in fixture form. This is the narrowing `OD-8` sequenced
        // around: had the gate converted first, these operators would have lost the roster with no
        // announcement. `20260819140000` grants the key and REFUSES to complete while any org
        // defining `ops` is uncovered, so this state cannot survive the migration.
        const res = await (asCaller(OPS_UNPRESERVED), GET());
        expect(res.status).toBe(403);
    });

    it("the capability admits, and admission no longer does — the DECIDED change", async () => {
        // This assertion used to read the other way, and its note said admission must not be
        // re-derived from the bundle *"which does not require portalEligible"* — the accident it
        // was written to prevent.
        //
        // `OD-8` decided it, on evidence this lane could not manufacture: `Q15-C1 = 0` — NO role
        // outside `admin`/`ops` holds `settings.users_roles.read` on the deployed tenant, so the
        // population this admits is empty in the only database that matters. `OD-7` rule 6 forbade
        // closing the gap with a secondary portal check, and `OD-8` forbids retaining one to mimic
        // the old shape.
        //
        // The boundary is narrow and worth restating where it is enforced: this says capability
        // holders may read THIS roster. It is not a general rule that a capability holder enters
        // every portal surface, and `OD-8` says so explicitly.
        const res = await (asCaller({ ...NOT_ADMITTED, permissionKeys: ["settings.users_roles.read"], roleKeys: ["auditor"] }), GET());
        expect(res.status).toBe(200);
    });

    it("the conversion granted no mutation — the read key does not open POST", async () => {
        // `OD-8` does not authorize `settings.users_roles`. The read capability must not become a
        // write one by sharing a route file with it.
        const routeSource = readFileSync(join(webRoot, "app/api/admin/users/route.ts"), "utf8");
        const postBody = routeSource.slice(routeSource.indexOf("export async function POST"));
        expect(postBody).toContain("requireUsersRolesManageAuth");
        expect(postBody).not.toContain("requirePortalOrUsersRolesManageAuth");
    });

    it("scope survives the conversion — the roster is still bounded to the caller's org", async () => {
        // `Membership ∧ Capability ∧ Scope`. Capability decides whether the roster may be read; it
        // does not decide whose. Asserted structurally, because a query that dropped the org filter
        // would return the right shape and the wrong rows.
        const routeSource = readFileSync(join(webRoot, "app/api/admin/users/route.ts"), "utf8");
        const getBody = routeSource.slice(
            routeSource.indexOf("export async function GET"),
            routeSource.indexOf("export async function POST"),
        );
        expect(getBody).toMatch(/\.eq\("org_id",\s*access\.orgId\)/);
    });

    it("the old admission shortcut cannot silently return", async () => {
        // The regression that would undo this: someone reinstates a portal test "to be safe".
        // `OD-7` rejects it and `W-13` removed the layer it belongs to — a `portalEligible` read in
        // this route would be the fifth authority layer under a new name.
        const routeSource = readFileSync(join(webRoot, "app/api/admin/users/route.ts"), "utf8");
        const executable = routeSource.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
        expect(executable).not.toContain("portalEligible");
        expect(executable).not.toContain("getAdminContextCached");
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
        const options = await pickerOptionsFor(OPS_PRESERVED);
        expect(options.map((o) => o.label)).toEqual(["arden", "bly"]);
        for (const o of options) expect(o.label).not.toContain("@");
    });

    it("shows the SAME names to a caller who may read addresses — the picker never renders one", async () => {
        const granted = await pickerOptionsFor(GRANT_HOLDER);
        const ungranted = await pickerOptionsFor(OPS_PRESERVED);
        expect(granted.map((o) => o.label)).toEqual(ungranted.map((o) => o.label));
        for (const o of granted) expect(o.label).not.toContain("@");
    });

    it("carries no address field into the component at all", async () => {
        const options = await pickerOptionsFor(ORG_ADMIN);
        for (const o of options) expect(Object.keys(o).sort()).toEqual(["label", "user_id"]);
    });
});

describe("W14-F1 — non-vacuity: the removed defect is convicted by name", () => {
    /**
     * EVERY consumer of the roster projection, discovered rather than named.
     *
     * This scan used to read one file. The OD-2 reconciliation is why it no longer does: staging had
     * added `TourInternalRecipientsMultiSelect`, a second consumer of
     * `fetchOperationalWorkOrgUsers`, carrying `label: row.email?.trim() || row.label` — the exact
     * expression W14-F1 removed from the first picker, in a file this lock's subject did not
     * include. It surfaced as a TYPE error on merge, because the option type no longer has the
     * field; had the type still carried it, the defect would have arrived silently.
     *
     * `W-5`'s question again — *does it DISCOVER or ENUMERATE?* — and the enumerated answer failed
     * the same way it has failed four times before in this register. The subject is now every file
     * that consumes the projection.
     */
    /** Comments removed, so a scan cannot be satisfied — or convicted — by prose. */
    function executableSource(src: string): string {
        return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    }

    it("the strip is real — the removed expression in a COMMENT does not convict", () => {
        expect(executableSource("// old: label: row.email?.trim() || row.label")).not.toMatch(/row\.email/);
        expect(executableSource("label: row.email?.trim() || row.label,")).toMatch(/row\.email/);
    });

    function rosterConsumers(): string[] {
        const out: string[] = [];
        const walk = (rel: string) => {
            for (const entry of readdirSync(join(webRoot, rel))) {
                const child = `${rel}/${entry}`;
                if (statSync(join(webRoot, child)).isDirectory()) walk(child);
                else if (/\.tsx?$/.test(entry) && readFileSync(join(webRoot, child), "utf8").includes("fetchOperationalWorkOrgUsers")) {
                    out.push(child);
                }
            }
        };
        walk("app");
        walk("components");
        return out.sort();
    }

    it("the scan finds more than one consumer — the enumerated version could not have", () => {
        const consumers = rosterConsumers();
        expect(consumers).toContain("components/admin/opportunity/OperationalWorkAssigneeSelect.tsx");
        expect(consumers.length, "discovery found only the file the old lock named").toBeGreaterThan(1);
    });

    it("NO consumer prefers a raw address as the option text", () => {
        // The defect was literally `label: row.email?.trim() || row.label`.
        //
        // Comment-stripped, and the first run of this scan is why: the fix to the tour picker
        // records the removed expression in a comment, and an unstripped scan convicted the very
        // change that removed it. Third time this branch has paid for that — `@/lib/revoke`,
        // `data-capability="planned"`, and now here.
        const offenders = rosterConsumers().filter((rel) =>
            /row\.email/.test(executableSource(readFileSync(join(webRoot, rel), "utf8"))),
        );
        expect(
            offenders,
            "the roster projection withholds the address; a consumer that reads one is reading a "
                + "field the route no longer returns, and asking for the defect back",
        ).toEqual([]);
    });

    it("the sibling picker carries no address field into the component at all", () => {
        const pickerSource = readFileSync(
            join(webRoot, "components/admin/opportunity/OperationalWorkAssigneeSelect.tsx"),
            "utf8",
        );
        expect(executableSource(pickerSource)).not.toMatch(/row\.email/);
    });

    it("the route reads the managing predicate rather than a second one that agrees today", () => {
        const routeSource = readFileSync(join(webRoot, "app/api/admin/users/route.ts"), "utf8");
        // The DISCLOSURE half is unchanged by OD-8: addresses are still projected against the
        // MANAGING key, so converting the read gate handed the ops population nothing new.
        expect(routeSource).toContain("canManageUsersAndRoles");
        // …and the gate itself is now the capability helper. The old admission read is asserted
        // absent in the OD-8 block above, where the reason it must stay absent is recorded.
        expect(routeSource).toContain("requirePortalOrUsersRolesManageAuth");
    });
});
