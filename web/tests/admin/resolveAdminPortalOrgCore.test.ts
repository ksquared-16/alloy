import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chooseOrgAndRoleKeysFromMembershipRows } from "@/lib/admin/resolveAdminAccessCore";
import { resolveAdminPortalOrgCore } from "@/lib/admin/resolveAdminPortalOrgCore";

describe("resolveAdminPortalOrgCore (org pick parity)", () => {
    it("W-22 — the two resolvers refuse an ambiguous membership identically", () => {
        // Parity is the point of this file, and W-22 changed what parity means: both resolvers call
        // the same helper, so both now REFUSE a membership spanning two orgs rather than both
        // sorting to `org-a`. Same fixture as before the inversion.
        expect(
            chooseOrgAndRoleKeysFromMembershipRows([
                { org_id: "org-b", role: "ops" },
                { org_id: "org-a", role: "admin" },
                { org_id: "org-a", role: "viewer" },
            ]),
        ).toBeNull();

        // …and the unambiguous case still resolves every role held there, so the refusal is not a
        // resolver that stopped working.
        expect(
            chooseOrgAndRoleKeysFromMembershipRows([
                { org_id: "org-a", role: "admin" },
                { org_id: "org-a", role: "viewer" },
            ]),
        ).toEqual({ orgId: "org-a", roleKeys: ["admin", "viewer"] });
    });

    /**
     * The light path's contract, restated by W-13.
     *
     * It used to read `user_roles` and nothing else, because a role literal needs no grant to answer.
     * Capability admission does, so this path now reads ONE grant row — `portal.access` for the
     * resolved org and role keys — and still skips the grant UNION and the two scope tables, which
     * is the expensive part it exists to avoid. Leaving it on the literal would have made admission
     * mean two different things in one product (`M2-13`).
     */
    function lightSupabase(rows: { org_id: string; role: string }[], grants: { permission_key: string }[]) {
        const seen: string[] = [];
        const from = vi.fn((table: string) => {
            seen.push(table);
            if (table === "user_roles") {
                return {
                    select: () => ({ eq: () => Promise.resolve({ data: rows, error: null }) }),
                };
            }
            if (table === "role_permission_grants") {
                const b: Record<string, unknown> = {};
                b.select = () => b;
                b.eq = () => b;
                b.in = () => b;
                b.limit = () => Promise.resolve({ data: grants, error: null });
                return b;
            }
            throw new Error(`unexpected table ${table}`);
        });
        return { sb: { from } as unknown as SupabaseClient, from, seen };
    }

    it("resolves org and admission from one grant row, and touches no scope table", async () => {
        const { sb, from, seen } = lightSupabase(
            [{ org_id: "org-x", role: "ops" }],
            [{ permission_key: "portal.access" }],
        );
        const core = await resolveAdminPortalOrgCore(sb, "user-1");
        expect(core).toEqual({
            orgId: "org-x",
            roleKeys: ["ops"],
            portalEligible: true,
            admission: "admitted",
        });
        expect(from).toHaveBeenCalledTimes(2);
        expect(seen).toEqual(["user_roles", "role_permission_grants"]);
        // The tables this path exists NOT to read.
        for (const skipped of ["user_access_profiles", "user_department_access", "user_site_access"]) {
            expect(seen).not.toContain(skipped);
        }
    });

    it("refuses a role that holds no portal.access — including one named admin", async () => {
        for (const role of ["school_director", "admin"]) {
            const { sb } = lightSupabase([{ org_id: "org-x", role }], []);
            const core = await resolveAdminPortalOrgCore(sb, "user-1");
            expect(core?.portalEligible, role).toBe(false);
            expect(core?.admission, role).toBe("no-capability");
        }
    });

    it("admits a custom role that holds it — the name is not consulted in either direction", async () => {
        const { sb } = lightSupabase(
            [{ org_id: "org-x", role: "cert_custom" }],
            [{ permission_key: "portal.access" }],
        );
        const core = await resolveAdminPortalOrgCore(sb, "user-1");
        expect(core?.portalEligible).toBe(true);
    });
});
