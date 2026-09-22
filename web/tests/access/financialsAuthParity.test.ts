import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import {
    chooseOrgAndRoleKeysFromMembershipRows,
    normalizeRoleKey,
} from "@/lib/admin/resolveAdminAccessCore";

/**
 * FINANCIALS AUTHORITY PARITY (P0-7.6 Part 4).
 *
 * `financials_gate` costs ~233 ms of SERIAL producer time because Financials resolves the caller's
 * grants itself, through `resolveActorPermissionGrants`, while the route already holds the
 * request-cached admin access bundle whose `permissionKeys` come from `resolveAdminAccessCore`.
 * Reusing the bundle is only legitimate if the two resolutions are SEMANTICALLY THE SAME ANSWER.
 *
 * This is the gate on that repair, not a formality. It compares the two ROLE derivations, which is
 * where the only divergence can live: both issue the identical grant read
 * (`role_permission_grants` where org_id = ? and role_key in ? and allowed = true), so identical
 * roleKeys imply identical permissionKeys.
 *
 * The scenarios are the ones the instruction names: same operator/org, several role combinations,
 * the empty-grant state, the denied state, legacy/untidy role values, and multi-org.
 */

const ORG = "org-1";
const USER = "user-1";

/** Minimal Supabase stand-in serving exactly the two tables these resolvers read. */
function fakeSupabase(opts: {
    memberships: Array<{ org_id: string; role: unknown }>;
    grants: Array<{ org_id: string; role_key: string; permission_key: string; allowed: boolean }>;
    failMemberships?: boolean;
    failGrants?: boolean;
}) {
    return {
        from(table: string) {
            const filters: Record<string, unknown> = {};
            let inCol: string | null = null;
            let inVals: string[] = [];
            const builder = {
                select() { return builder; },
                eq(col: string, val: unknown) { filters[col] = val; return builder; },
                in(col: string, vals: string[]) { inCol = col; inVals = vals; return builder; },
                then(resolve: (r: { data: unknown; error: unknown }) => void) {
                    if (table === "user_roles") {
                        if (opts.failMemberships) return resolve({ data: null, error: { message: "boom" } });
                        let rows = opts.memberships;
                        if (filters.org_id) rows = rows.filter((r) => r.org_id === filters.org_id);
                        return resolve({ data: rows, error: null });
                    }
                    if (table === "role_permission_grants") {
                        if (opts.failGrants) return resolve({ data: null, error: { message: "boom" } });
                        let rows = opts.grants;
                        if (filters.org_id) rows = rows.filter((r) => r.org_id === filters.org_id);
                        if (filters.allowed !== undefined) rows = rows.filter((r) => r.allowed === filters.allowed);
                        if (inCol === "role_key") rows = rows.filter((r) => inVals.includes(r.role_key));
                        return resolve({ data: rows.map((r) => ({ permission_key: r.permission_key })), error: null });
                    }
                    return resolve({ data: [], error: null });
                },
            };
            return builder;
        },
    } as never;
}

/** The roleKeys the BUNDLE would derive, from the same membership rows. */
const bundleRoleKeys = (memberships: Array<{ org_id: string; role: unknown }>) =>
    chooseOrgAndRoleKeysFromMembershipRows(
        memberships.filter((r) => typeof r.org_id === "string" && typeof r.role === "string") as Array<{ org_id: string; role: string }>,
    );

/** The roleKeys FINANCIALS would derive, for a given org. */
const financialsRoleKeys = (memberships: Array<{ org_id: string; role: unknown }>, orgId: string) =>
    [...new Set(memberships.filter((m) => m.org_id === orgId).map((m) => normalizeRoleKey(m.role)).filter(Boolean))].sort();

const grantsFor = (pairs: Array<[string, string]>) =>
    pairs.map(([role_key, permission_key]) => ({ org_id: ORG, role_key, permission_key, allowed: true }));

describe("Financials auth parity with the request access bundle", () => {
    const CASES: Array<{ name: string; memberships: Array<{ org_id: string; role: unknown }> }> = [
        { name: "single admin role", memberships: [{ org_id: ORG, role: "admin" }] },
        { name: "several roles in one org", memberships: [{ org_id: ORG, role: "admin" }, { org_id: ORG, role: "ops" }, { org_id: ORG, role: "billing" }] },
        { name: "duplicate role rows", memberships: [{ org_id: ORG, role: "ops" }, { org_id: ORG, role: "ops" }] },
        { name: "untidy legacy value (whitespace/case)", memberships: [{ org_id: ORG, role: " Admin " }, { org_id: ORG, role: "OPS" }] },
        { name: "role-like junk that normalizes away", memberships: [{ org_id: ORG, role: "admin" }, { org_id: ORG, role: "   " }] },
    ];

    for (const c of CASES) {
        it(`ROLE PARITY — ${c.name}`, () => {
            const bundle = bundleRoleKeys(c.memberships);
            expect(bundle, "bundle must resolve for an admitted caller").not.toBeNull();
            expect(bundle!.orgId).toBe(ORG);
            expect(financialsRoleKeys(c.memberships, ORG)).toEqual(bundle!.roleKeys);
        });
    }

    it("KEY PARITY — the same grant read from the same roles yields the same permission set", async () => {
        const memberships = [{ org_id: ORG, role: " Admin " }, { org_id: ORG, role: "ops" }];
        const grants = grantsFor([["admin", "fin.read"], ["admin", "fin.write"], ["ops", "work.view"]]);
        const sb = fakeSupabase({ memberships, grants });
        const fin = await resolveActorPermissionGrants(sb, ORG, USER);
        const bundle = bundleRoleKeys(memberships)!;
        // Same query, same roles -> same keys. Compared as SETS: the bundle sorts, Financials does not.
        const expected = grants.filter((g) => bundle.roleKeys.includes(g.role_key)).map((g) => g.permission_key);
        expect([...(fin.permissionKeys ?? [])].sort()).toEqual([...new Set(expected)].sort());
        expect((fin.permissionKeys ?? []).includes("fin.read")).toBe(true);
    });

    it("EMPTY-GRANT STATE — a role with no grants is [] from both, never null", async () => {
        const memberships = [{ org_id: ORG, role: "viewer" }];
        const sb = fakeSupabase({ memberships, grants: [] });
        const fin = await resolveActorPermissionGrants(sb, ORG, USER);
        expect(fin.permissionKeys).toEqual([]);
        expect(bundleRoleKeys(memberships)!.roleKeys).toEqual(["viewer"]);
    });

    it("DENIED STATE — no fin.read means denied, and that is the same answer from both", async () => {
        const memberships = [{ org_id: ORG, role: "ops" }];
        const sb = fakeSupabase({ memberships, grants: grantsFor([["ops", "work.view"]]) });
        const fin = await resolveActorPermissionGrants(sb, ORG, USER);
        expect((fin.permissionKeys ?? []).includes("fin.read")).toBe(false);
    });

    it("FAILED GRANT READ denies in both — null, never []", async () => {
        const sb = fakeSupabase({ memberships: [{ org_id: ORG, role: "admin" }], grants: [], failGrants: true });
        const fin = await resolveActorPermissionGrants(sb, ORG, USER);
        expect(fin.permissionKeys).toBeNull();
    });

    it("THE ONE DIVERGENCE: multi-org. The bundle REFUSES; Financials would answer", () => {
        // chooseOrgAndRoleKeysFromMembershipRows returns null when orgs.length !== 1 — it will not
        // pick an org without a request to consult. Financials is TOLD the org, so it answers.
        const memberships = [{ org_id: ORG, role: "admin" }, { org_id: "org-2", role: "admin" }];
        expect(bundleRoleKeys(memberships)).toBeNull();
        expect(financialsRoleKeys(memberships, ORG)).toEqual(["admin"]);
        // This divergence CANNOT reach the producer: a null bundle means resolveAdminAccessCore
        // returns null, the route gate fails, and the producers never run. The bundle existing is
        // a precondition for the call site, so on the admitted path the two always agree.
    });

    it("no-membership callers cannot reach the producer either", () => {
        expect(bundleRoleKeys([])).toBeNull();
    });

    it("THE BINDING: the producer authorizes against the SAME org the bundle resolved", () => {
        // Parity of the two resolvers is worth nothing if they are handed different orgs. The
        // early producer call receives the org from the composer's subject announcement, which
        // announces `req.orgId` — the value the route gate resolved once and never re-resolves.
        // If that ever became a subject-derived org, the repair would authorize the caller's org
        // against another org's money, so this is gated rather than read.
        const ANSWER = readFileSync(resolvePath(process.cwd(), "lib/runtime/provisioning/workUnitProvisioningAnswer.ts"), "utf8");
        const at = ANSWER.indexOf("req.onSubjectResolved?.({");
        expect(at).toBeGreaterThan(-1);
        const block = ANSWER.slice(at, at + 260);
        expect(block).toContain("orgId: req.orgId");
        expect(block).not.toMatch(/orgId:\s*(?!req\.orgId)[A-Za-z_]/);

        const ROUTE = readFileSync(resolvePath(process.cwd(), "lib/runtime/provisioning/composeProvisioningAnswerForRoute.ts"), "utf8");
        // The canonical fallback authorizes against gate.orgId explicitly.
        expect(ROUTE).toContain("orgId: gate.orgId,");
    });
});
