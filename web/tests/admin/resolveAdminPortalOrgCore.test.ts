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

    it("resolves org and portalEligible without querying grants or scope tables", async () => {
        const from = vi.fn((table: string) => {
            if (table === "user_roles") {
                return {
                    select: () => ({
                        eq: () => Promise.resolve({ data: [{ org_id: "org-x", role: "ops" }], error: null }),
                    }),
                };
            }
            throw new Error(`unexpected table ${table}`);
        });
        const sb = { from } as unknown as SupabaseClient;
        const core = await resolveAdminPortalOrgCore(sb, "user-1");
        expect(core).toEqual({ orgId: "org-x", roleKeys: ["ops"], portalEligible: true });
        expect(from).toHaveBeenCalledTimes(1);
        expect(from.mock.calls[0]?.[0]).toBe("user_roles");
    });

    it("returns null portal ineligible for custom role only", async () => {
        const from = vi.fn((table: string) => {
            if (table === "user_roles") {
                return {
                    select: () => ({
                        eq: () =>
                            Promise.resolve({
                                data: [{ org_id: "org-x", role: "school_director" }],
                                error: null,
                            }),
                    }),
                };
            }
            throw new Error(`unexpected table ${table}`);
        });
        const sb = { from } as unknown as SupabaseClient;
        const core = await resolveAdminPortalOrgCore(sb, "user-1");
        expect(core?.portalEligible).toBe(false);
    });
});
