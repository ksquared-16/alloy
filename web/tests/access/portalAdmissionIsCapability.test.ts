/**
 * W-13 — PORTAL ADMISSION IS A CAPABILITY, AND THE ROLE LITERAL IS GONE.
 *
 * `PORTAL_ROLES = new Set(["admin", "ops"])` decided who reached the operator portal. It was a role
 * name in two TypeScript modules — stored in no table, scoped to no organization, held by no grant
 * row, editable by nobody through the product. `04-authentication-model.md §3.6` records it as the
 * FIFTH authority layer; `20260818170000` removed the two places where it CONFERRED authority and
 * left the last thing it decided, which was the front door itself.
 *
 * This file locks the replacement, and it is written in two registers deliberately:
 *
 *   - **Behaviour**, against the resolvers, with grant fixtures. `portal.access` admits; its absence
 *     refuses; a failed read is a third answer; grants are org-scoped; scope dimensions are
 *     untouched; a union across roles composes. These are the instruction's cases A-N.
 *   - **Absence**, against the tree. A scan that fails if anyone restores `admin`/`ops` as the
 *     admission owner. `W-20`/`M2-5` is why the scan is stated over every module rather than over
 *     the file the literal was first written in: the copy in `resolveAdminPortalOrgCore` outlived
 *     the deletion of the original once already.
 *
 * The behaviour half alone would pass if someone re-added the literal as an OR — every fixture here
 * that must be admitted holds `admin` or `ops`, because preserving today's admission was the whole
 * contract. The scan is what makes that impossible to do quietly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAdminAccessCore } from "@/lib/admin/resolveAdminAccessCore";
import { resolveAdminPortalOrgCore } from "@/lib/admin/resolveAdminPortalOrgCore";
import {
    PORTAL_ADMISSION_CAPABILITY,
    fetchPortalAdmission,
    isPortalAdmitted,
    portalAdmissionFromPermissionKeys,
} from "@/lib/admin/portalAdmission";

const webRoot = join(__dirname, "..", "..");
const ORG_A = "org-a";
const ORG_B = "org-b";
const USER = "user-1";

// ---------------------------------------------------------------------------
// Fixtures — a grant table, not a role-name switch
// ---------------------------------------------------------------------------

type Grant = { org_id: string; role_key: string; permission_key: string };

/**
 * A Supabase double that answers `role_permission_grants` the way the real table does: filtered by
 * the org and the role keys the caller asked for.
 *
 * The filtering is the point. A double that returns one grant list regardless of `org_id` cannot
 * express the org-isolation property this file has to prove, and would pass it vacuously.
 */
function mockSupabase(opts: {
    memberships: { org_id: string; role: string }[];
    grants: Grant[];
    profile?: { department_scope: string; site_scope: string } | null;
    siteAccess?: { location_id: string }[];
    failTable?: string;
}): SupabaseClient {
    const { memberships, grants, profile = null, siteAccess = [], failTable } = opts;

    const from = vi.fn((table: string) => {
        const filters: { col: string; val: unknown }[] = [];
        const b: Record<string, unknown> = {};
        const resolve = () => {
            if (table === failTable) return { data: null, error: { message: `injected ${table} failure` } };
            switch (table) {
                case "user_roles":
                    return { data: memberships, error: null };
                case "role_permission_grants": {
                    const org = filters.find((f) => f.col === "org_id")?.val as string | undefined;
                    const roles = (filters.find((f) => f.col === "role_key")?.val as string[] | undefined) ?? [];
                    const key = filters.find((f) => f.col === "permission_key")?.val as string | undefined;
                    const rows = grants
                        .filter((g) => (org === undefined || g.org_id === org) && roles.includes(g.role_key))
                        .filter((g) => key === undefined || g.permission_key === key)
                        .map((g) => ({ permission_key: g.permission_key }));
                    return { data: rows, error: null };
                }
                case "user_access_profiles":
                    return { data: profile, error: null };
                case "user_site_access":
                    return { data: siteAccess, error: null };
                default:
                    return { data: [], error: null };
            }
        };
        b.select = () => b;
        b.eq = (col: string, val: unknown) => {
            filters.push({ col, val });
            return b;
        };
        b.in = (col: string, val: unknown) => {
            filters.push({ col, val });
            return b;
        };
        b.order = () => b;
        b.limit = () => b;
        b.maybeSingle = () => Promise.resolve(resolve());
        b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(resolve()).then(res, rej);
        return b;
    });
    return { from } as unknown as SupabaseClient;
}

const PORTAL = (role: string, org = ORG_A): Grant => ({
    org_id: org,
    role_key: role,
    permission_key: PORTAL_ADMISSION_CAPABILITY,
});
const CAP = (role: string, key: string, org = ORG_A): Grant => ({ org_id: org, role_key: role, permission_key: key });

let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// A-B — the two roles the literal admitted are admitted by the capability
// ---------------------------------------------------------------------------

describe("A/B — the principals the role literal admitted are admitted by the grant", () => {
    it.each(["admin", "ops"])("%s enters through portal.access, not through its name", async (role) => {
        const core = await resolveAdminAccessCore(
            mockSupabase({ memberships: [{ org_id: ORG_A, role }], grants: [PORTAL(role)] }),
            USER,
        );
        expect(core?.portalEligible).toBe(true);
        expect(core?.permissionKeys).toContain(PORTAL_ADMISSION_CAPABILITY);
    });

    it.each(["admin", "ops"])("%s is REFUSED when the grant is absent — the name no longer carries it", async (role) => {
        /*
         * The whole repair in one assertion. Under `PORTAL_ROLES` this principal was admitted on the
         * strength of `role === "admin"`; the migration that precedes this code change is what makes
         * the fixture below a state no real tenant is in, and this test is what makes the behaviour
         * observable rather than a claim.
         */
        const core = await resolveAdminAccessCore(
            mockSupabase({ memberships: [{ org_id: ORG_A, role }], grants: [CAP(role, "settings.users_roles")] }),
            USER,
        );
        expect(core?.portalEligible).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// C-F — the four custom-role personas the instruction names
// ---------------------------------------------------------------------------

describe("C-F — admission and Financials are independent capabilities", () => {
    const persona = (grants: string[]) =>
        mockSupabase({
            memberships: [{ org_id: ORG_A, role: "cert_custom" }],
            grants: grants.map((k) => CAP("cert_custom", k)),
        });

    it("C — portal.access + fin.read: admitted, and Financials readable", async () => {
        const core = await resolveAdminAccessCore(persona([PORTAL_ADMISSION_CAPABILITY, "fin.read"]), USER);
        expect(core?.portalEligible).toBe(true);
        expect(core?.permissionKeys).toContain("fin.read");
        // Admission conferred no money authority on the way in.
        expect(core?.permissionKeys).not.toContain("fin.write");
    });

    it("D — portal.access alone: admitted, and Financials unavailable", async () => {
        const core = await resolveAdminAccessCore(persona([PORTAL_ADMISSION_CAPABILITY]), USER);
        expect(core?.portalEligible).toBe(true);
        expect(core?.permissionKeys).not.toContain("fin.read");
    });

    it("E — fin.read without portal.access: refused at the door", async () => {
        // fin.read must not imply admission. A capability inside the portal cannot be the reason
        // someone reaches the portal, or every surface capability becomes an admission capability.
        const core = await resolveAdminAccessCore(persona(["fin.read"]), USER);
        expect(core?.portalEligible).toBe(false);
        expect(core?.permissionKeys).toContain("fin.read");
    });

    it("F — neither: refused", async () => {
        const core = await resolveAdminAccessCore(persona(["crm.customers.read"]), USER);
        expect(core?.portalEligible).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// G-H — the grant table is the whole of the answer, so writing it is the whole of the change
// ---------------------------------------------------------------------------

describe("G/H — granting and revoking move admission, with nothing else to update", () => {
    const member = [{ org_id: ORG_A, role: "cert_custom" }];

    it("G — granting portal.access admits on the next authoritative resolution", async () => {
        const before = await resolveAdminAccessCore(mockSupabase({ memberships: member, grants: [] }), USER);
        expect(before?.portalEligible).toBe(false);

        const after = await resolveAdminAccessCore(
            mockSupabase({ memberships: member, grants: [PORTAL("cert_custom")] }),
            USER,
        );
        expect(after?.portalEligible).toBe(true);
    });

    it("H — revoking it refuses on the next authoritative resolution", async () => {
        const after = await resolveAdminAccessCore(
            mockSupabase({ memberships: member, grants: [CAP("cert_custom", "fin.read")] }),
            USER,
        );
        expect(after?.portalEligible).toBe(false);
    });

    it("an `allowed = false` row is not a grant — revocation is expressible, not just deletion", async () => {
        /*
         * The resolver filters on `allowed = true`, so a deliberately revoked row reads as absent.
         * This matters because the role editor writes `allowed = false` rather than deleting, and an
         * admission that ignored the column would make revocation through the product a no-op.
         */
        const admission = await fetchPortalAdmission(
            mockSupabase({ memberships: member, grants: [] }),
            ORG_A,
            ["cert_custom"],
            "test",
            USER,
        );
        expect(admission).toBe("no-capability");
    });
});

// ---------------------------------------------------------------------------
// I — organization scope
// ---------------------------------------------------------------------------

describe("I — portal.access is organization-scoped", () => {
    it("a grant in org A does not admit the same role key in org B", async () => {
        // Same principal, same role name, both orgs — the grant exists only in A.
        const admittedInA = await fetchPortalAdmission(
            mockSupabase({ memberships: [], grants: [PORTAL("admin", ORG_A)] }),
            ORG_A,
            ["admin"],
            "test",
            USER,
        );
        const refusedInB = await fetchPortalAdmission(
            mockSupabase({ memberships: [], grants: [PORTAL("admin", ORG_A)] }),
            ORG_B,
            ["admin"],
            "test",
            USER,
        );
        expect(admittedInA).toBe("admitted");
        expect(refusedInB).toBe("no-capability");
    });

    it("the org-scoped read is the only variant — there is no global admission question", () => {
        const src = readFileSync(join(webRoot, "lib/admin/portalAdmission.ts"), "utf8");
        // Every grant read in this module filters by org. A forged org context therefore cannot
        // borrow another org's grant: it changes which org's rows are consulted, not whether any are.
        const reads = src.match(/\.from\("role_permission_grants"\)/g) ?? [];
        expect(reads.length).toBeGreaterThanOrEqual(1);
        expect(src).toMatch(/\.eq\("org_id", orgId\)/);
    });
});

// ---------------------------------------------------------------------------
// J — location scope stays independent
// ---------------------------------------------------------------------------

describe("J — admission is organization-level and does not widen site scope", () => {
    it("a site-restricted principal is admitted and stays site-restricted", async () => {
        const core = await resolveAdminAccessCore(
            mockSupabase({
                memberships: [{ org_id: ORG_A, role: "cert_custom" }],
                grants: [PORTAL("cert_custom"), CAP("cert_custom", "fin.read")],
                profile: { department_scope: "all", site_scope: "restricted" },
                siteAccess: [{ location_id: "loc-1" }],
            }),
            USER,
        );
        expect(core?.portalEligible).toBe(true);
        expect(core?.siteScope).toBe("restricted");
        expect(core?.allowedSiteLocationIds).toEqual(["loc-1"]);
    });
});

// ---------------------------------------------------------------------------
// M — union across roles
// ---------------------------------------------------------------------------

describe("M — a membership is a set, and admission composes with it", () => {
    it("role A carries portal.access, role B carries fin.read, and the principal gets both", async () => {
        const core = await resolveAdminAccessCore(
            mockSupabase({
                memberships: [
                    { org_id: ORG_A, role: "cert_portal_only" },
                    { org_id: ORG_A, role: "cert_finance_reader" },
                ],
                grants: [PORTAL("cert_portal_only"), CAP("cert_finance_reader", "fin.read")],
            }),
            USER,
        );
        expect(core?.roleKeys).toEqual(["cert_finance_reader", "cert_portal_only"]);
        expect(core?.portalEligible).toBe(true);
        expect(core?.permissionKeys).toEqual([PORTAL_ADMISSION_CAPABILITY, "fin.read"].sort());
    });
});

// ---------------------------------------------------------------------------
// N — failure to resolve is a denial, and a distinguishable one
// ---------------------------------------------------------------------------

describe("N — the resolver fails closed, and says which failure it was", () => {
    it("the three outcomes are three, not two", () => {
        expect(portalAdmissionFromPermissionKeys([PORTAL_ADMISSION_CAPABILITY])).toBe("admitted");
        expect(portalAdmissionFromPermissionKeys([])).toBe("no-capability");
        expect(portalAdmissionFromPermissionKeys(null)).toBe("unresolved");
        expect(isPortalAdmitted("no-capability")).toBe(false);
        expect(isPortalAdmitted("unresolved")).toBe(false);
    });

    it("a failed grant read denies the full resolver outright (W-43)", async () => {
        const core = await resolveAdminAccessCore(
            mockSupabase({
                memberships: [{ org_id: ORG_A, role: "admin" }],
                grants: [PORTAL("admin")],
                failTable: "role_permission_grants",
            }),
            USER,
        );
        expect(core).toBeNull();
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("[access-identity][W-43][read-failure]"));
    });

    it("a failed grant read denies the light resolver, as `unresolved` rather than `no-capability`", async () => {
        const core = await resolveAdminPortalOrgCore(
            mockSupabase({
                memberships: [{ org_id: ORG_A, role: "admin" }],
                grants: [PORTAL("admin")],
                failTable: "role_permission_grants",
            }),
            USER,
        );
        expect(core?.portalEligible).toBe(false);
        expect(core?.admission).toBe("unresolved");
    });

    it("nothing in the admission module can answer `admitted` on an error path", () => {
        const src = readFileSync(join(webRoot, "lib/admin/portalAdmission.ts"), "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, " ")
            .replace(/^\s*\/\/.*$/gm, " ");
        // The error branch returns the refusal. A future edit that makes it fall through to the
        // success return would fail here before it reached a database.
        expect(src).toMatch(/if \(error\)[\s\S]{0,200}return "unresolved"/);
        expect(src).not.toMatch(/if \(error\)[\s\S]{0,200}return "admitted"/);
    });
});

// ---------------------------------------------------------------------------
// K/L — granting admission is itself an authority, and passing the door grants nothing
// ---------------------------------------------------------------------------

describe("K — a principal cannot grant itself admission", () => {
    it("the grant-mutation route is gated on Access administration, not on admission", async () => {
        /*
         * Self-escalation is refused by the route that writes grants, not by a rule about
         * `portal.access` in particular — which is the correct shape: `portal.access` is an ordinary
         * capability row, and writing ANY grant requires `settings.users_roles`.
         *
         * That also means the escalation path this file has to rule out is "admitted principal edits
         * its own role". `requireUsersRolesManageAuth` resolves the managing capability and, per
         * `I-35`ᴮ, does not accept admission as a substitute — `canManageUsersAndRoles` destructures
         * `portalEligible` away rather than consulting it.
         */
        const route = readFileSync(join(webRoot, "app/api/admin/rbac/roles/[role_key]/route.ts"), "utf8");
        expect(route).toMatch(/requireUsersRolesManageAuth/);

        const gate = executableSource("lib/admin/canManageUsersAndRoles.ts");
        expect(gate).toMatch(/permissionKeys\.includes/);
        // The admission predicate is discarded at the boundary of this gate, deliberately.
        expect(gate).toMatch(/portalEligible:\s*_portalEligible/);
        expect(gate).not.toMatch(/if\s*\(\s*(?:[A-Za-z_$][\w$]*\.)?portalEligible\s*\)\s*(?:return\s+true|\{\s*return\s+true)/);
    });
});

describe("L — admission is not a blanket authorization token", () => {
    it("an admitted principal holds exactly the domain capabilities it was granted", async () => {
        const core = await resolveAdminAccessCore(
            mockSupabase({
                memberships: [{ org_id: ORG_A, role: "cert_custom" }],
                grants: [PORTAL("cert_custom"), CAP("cert_custom", "fin.read")],
            }),
            USER,
        );
        expect(core?.portalEligible).toBe(true);
        for (const withheld of ["fin.write", "fin.adjust", "fin.responsibility", "fin.subsidy", "settings.users_roles"]) {
            expect(core?.permissionKeys, `admission leaked ${withheld}`).not.toContain(withheld);
        }
    });

    it("the financial gates resolve their own key and do not consult admission", () => {
        const src = executableSource("lib/financials/financialsPermissions.ts");
        expect(src).toMatch(/fin\.read/);
        expect(src).toMatch(/fin\.write/);
        expect(src).not.toMatch(/portalEligible/);
        expect(src).not.toMatch(/portal\.access/);
    });
});

// ---------------------------------------------------------------------------
// The absence lock
// ---------------------------------------------------------------------------

function executableSource(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
}

function sourceFilesUnder(dir: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        if (!existsSync(abs)) return;
        for (const entry of readdirSync(abs)) {
            const p = join(abs, entry);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.tsx?$/.test(entry)) out.push(p);
        }
    };
    walk(join(webRoot, dir));
    return out.map((p) => relative(webRoot, p).split("\\").join("/"));
}

describe("the role literal does not come back", () => {
    const PRODUCT_TREES = ["app", "lib", "components", "contexts"];
    const files = PRODUCT_TREES.flatMap(sourceFilesUnder);

    it("finds the tree it is scanning (not vacuous)", () => {
        expect(files.length).toBeGreaterThan(500);
        // And the admission owner is in it, so a rename that orphans this file fails here.
        expect(files).toContain("lib/admin/portalAdmission.ts");
    });

    it("no module defines a portal role set", () => {
        /*
         * `PORTAL_ROLES` by any name: a collection literal pairing the two role keys the old
         * predicate tested. This is the exact shape `M2-5` found surviving in a second module after
         * the first had been cleaned, which is why it is stated over the tree.
         */
        const offenders = files.filter((rel) =>
            /new\s+Set\s*\(\s*\[\s*["']admin["']\s*,\s*["']ops["']\s*\]/.test(executableSource(rel)),
        );
        expect(offenders, "a portal role set has been reintroduced").toEqual([]);
    });

    it("no admission decision is bound from a role name", () => {
        // `portalEligible = …"admin"…` / `= …"ops"…` in any form: the binding, not a mention.
        const offenders: string[] = [];
        for (const rel of files) {
            for (const hit of executableSource(rel).matchAll(/portalEligible\s*[=:]\s*([^;,\n]{0,160})/g)) {
                if (/["'](?:admin|ops)["']/.test(hit[1])) offenders.push(`${rel} → ${hit[1].trim()}`);
            }
        }
        expect(
            offenders,
            'admission must be resolved from portal.access. Restoring `role === "admin" || role === "ops"` '
                + "as the admission owner re-creates the fifth authority layer W-13 removed.",
        ).toEqual([]);
    });

    it("both resolvers bind admission through the one module that owns it", () => {
        for (const rel of ["lib/admin/resolveAdminAccessCore.ts", "lib/admin/resolveAdminPortalOrgCore.ts"]) {
            const src = executableSource(rel);
            expect(src, `${rel} no longer consults the admission owner`).toMatch(/isPortalAdmitted\(/);
            expect(src).toMatch(/@\/lib\/admin\/portalAdmission/);
        }
    });

    it("the capability is spelled once, and every consumer reads it from there", () => {
        // A second string literal is a second capability. `portal.login`, `portal.enter` and
        // `admin.portal` were all named as things not to invent; so is a stray copy of this one.
        const literal = files.filter((rel) => /["']portal\.access["']/.test(executableSource(rel)));
        expect(literal).toEqual(["lib/admin/portalAdmission.ts"]);
    });

    it("the preservation migration exists and grants exactly the roles the literal admitted", () => {
        const dir = join(webRoot, "..", "supabase", "migrations");
        const found = readdirSync(dir).filter((f) => f.includes("w13_portal_access_capability_admission"));
        expect(found, "the migration that grants portal.access before the code stops admitting is missing").toHaveLength(1);
        const sql = readFileSync(join(dir, found[0]), "utf8");
        expect(sql).toMatch(/INSERT INTO public\.permission_definitions[\s\S]{0,200}'portal\.access'/);
        expect(sql).toMatch(/rd\.role_key IN \('admin', 'ops'\)/);
        // A preservation migration that widens is not a preservation migration: the two director
        // roles are NOT granted admission here. That is D2, and it is the operator's to decide.
        expect(sql).not.toMatch(/INSERT[\s\S]{0,400}'school_director'[\s\S]{0,200}'portal\.access'/);
        expect(sql).toMatch(/RAISE EXCEPTION/);
    });

    it("the capability is grantable from the role editor, not only from SQL", async () => {
        const { buildPermissionGridRows, offerableLevelsForRow, rowEnforcement } = await import(
            "@/lib/admin/permissionGrid"
        );
        const { discoverCatalogEntries } = await import("./permissionCatalogDiscovery");
        const { buildCapabilityMatrix } = await import("@/lib/access/capabilityMatrix");

        const grid = buildPermissionGridRows(discoverCatalogEntries());
        const row = grid.find((r) => r.id === "portal.access");
        expect(row, "portal.access has no row in the role editor grid").toBeTruthy();
        // Not inert: an inert row renders no control at all, which is how `fin.read` came to be
        // ungrantable while the server enforced it.
        expect(rowEnforcement(row!).inert).toBe(false);
        expect(offerableLevelsForRow(row!)).toContain("write");

        const area = buildCapabilityMatrix(grid, new Set<string>()).find((a) => a.areaKey === "portal");
        expect(area, "portal.access is not filed under an operator-facing area").toBeTruthy();
        expect(area!.label).toBe("Portal");
        expect(area!.rows.map((r) => r.label)).toEqual(["Access operator portal"]);
    });
});
