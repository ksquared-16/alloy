/**
 * W-5 / RL-4 — membership creation writes an access profile atomically (G4).
 *
 * Real apply against Supabase — requires:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MEMBERSHIP_INVARIANT_INTEGRATION_ORG_ID
 * Run (from web/):
 *   MEMBERSHIP_INVARIANT_INTEGRATION_ORG_ID=<org-uuid> npx vitest run tests/access/membershipProfileInvariant.integration.test.ts
 *
 * Guard pattern per tests/admin/verticalBootstrap.integration.test.ts:12-18.
 *
 * What this locks:
 *   1. A membership created through the product path has exactly one profile row.
 *   2. A second membership for the same (user, org) does not add a second profile.
 *   3. A failure inside the atomic block leaves NO orphan membership row.
 *   4. A failure AFTER the profile insert leaves NO orphan profile row either.
 *   5. The W-0 Q4 anti-join returns zero for the org afterwards.
 *
 * Note on (3) and (4): the RPC is a single transaction, so failure is injected by
 * making a write inside it violate a constraint rather than by stubbing the
 * profile insert — there is no seam inside a Postgres function to stub. The two
 * cases inject at different statements on purpose: (3) uses a missing org_id, which
 * fails the FIRST statement (the profile insert, via the profiles→orgs FK); (4)
 * uses an undefined role, which fails the SECOND (the membership insert, via W-16's
 * role FK) once the profile row is already written. Together they cover both sides
 * of the pair — a partial failure leaves neither a membership without a profile nor
 * a profile without a membership.
 */
import { afterAll, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    createMembershipWithAccessProfile,
    replaceMembershipWithAccessProfile,
} from "@/lib/admin/membershipWithProfile";

const orgId = process.env.MEMBERSHIP_INVARIANT_INTEGRATION_ORG_ID;
const hasEnv =
    Boolean(process.env.SUPABASE_URL) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
    Boolean(orgId && orgId.length > 10);

const createdUserIds: string[] = [];

/** A disposable auth user; membership FKs require a real auth.users row. */
async function makeUser(supabase: ReturnType<typeof createAdminClient>, tag: string): Promise<string> {
    const email = `w5-invariant-${tag}-${crypto.randomUUID().slice(0, 8)}@example.invalid`;
    const { data, error } = await supabase.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user?.id) throw new Error(`createUser: ${error?.message ?? "no user"}`);
    createdUserIds.push(data.user.id);
    return data.user.id;
}

/** Two active role_keys for the org, so the test never invents role vocabulary. */
async function activeRoleKeys(supabase: ReturnType<typeof createAdminClient>): Promise<string[]> {
    const { data, error } = await supabase
        .from("role_definitions")
        .select("role_key")
        .eq("org_id", orgId!)
        .eq("is_active", true)
        .order("role_key", { ascending: true })
        .limit(2);
    if (error) throw new Error(`role_definitions: ${error.message}`);
    const keys = (data ?? []).map((r) => (r as { role_key: string }).role_key);
    if (!keys.length) throw new Error("org has no active role_definitions — cannot run invariant test");
    return keys;
}

async function profileCount(supabase: ReturnType<typeof createAdminClient>, userId: string): Promise<number> {
    const { count, error } = await supabase
        .from("user_access_profiles")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("org_id", orgId!);
    if (error) throw new Error(`user_access_profiles: ${error.message}`);
    return count ?? 0;
}

async function membershipCount(supabase: ReturnType<typeof createAdminClient>, userId: string): Promise<number> {
    const { count, error } = await supabase
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("org_id", orgId!);
    if (error) throw new Error(`user_roles: ${error.message}`);
    return count ?? 0;
}

describe.skipIf(!hasEnv)("W-5 — membership + access profile are atomic (integration)", () => {
    afterAll(async () => {
        if (!hasEnv) return;
        const supabase = createAdminClient();
        for (const id of createdUserIds) {
            await supabase.from("user_roles").delete().eq("user_id", id);
            await supabase.from("user_access_profiles").delete().eq("user_id", id);
            await supabase.auth.admin.deleteUser(id).catch(() => undefined);
        }
    });

    it("creates exactly one profile row with a new membership", async () => {
        const supabase = createAdminClient();
        const [role] = await activeRoleKeys(supabase);
        const userId = await makeUser(supabase, "create");

        expect(await profileCount(supabase, userId)).toBe(0);

        const res = await createMembershipWithAccessProfile(supabase, { userId, orgId: orgId!, role });
        expect(res.ok).toBe(true);
        if (!res.ok) return;

        expect(res.row.user_id).toBe(userId);
        expect(res.row.role).toBe(role);
        expect(await membershipCount(supabase, userId)).toBe(1);
        expect(await profileCount(supabase, userId)).toBe(1);

        // The profile must be created at the scope the resolver already infers,
        // or W-5 becomes a silent behaviour change instead of an invariant fix.
        const { data: profile } = await supabase
            .from("user_access_profiles")
            .select("department_scope, site_scope")
            .eq("user_id", userId)
            .eq("org_id", orgId!)
            .maybeSingle();
        expect(profile).toMatchObject({ department_scope: "all", site_scope: "all" });
    });

    it("a second membership for the same pair does not add a second profile", async () => {
        const supabase = createAdminClient();
        const roles = await activeRoleKeys(supabase);
        if (roles.length < 2) return; // org has only one role vocabulary entry
        const userId = await makeUser(supabase, "second");

        const first = await createMembershipWithAccessProfile(supabase, { userId, orgId: orgId!, role: roles[0] });
        expect(first.ok).toBe(true);
        const second = await createMembershipWithAccessProfile(supabase, { userId, orgId: orgId!, role: roles[1] });
        expect(second.ok).toBe(true);

        expect(await membershipCount(supabase, userId)).toBe(2);
        expect(await profileCount(supabase, userId)).toBe(1);
    });

    it("reports a duplicate membership rather than writing it twice", async () => {
        const supabase = createAdminClient();
        const [role] = await activeRoleKeys(supabase);
        const userId = await makeUser(supabase, "dup");

        expect((await createMembershipWithAccessProfile(supabase, { userId, orgId: orgId!, role })).ok).toBe(true);
        const again = await createMembershipWithAccessProfile(supabase, { userId, orgId: orgId!, role });

        expect(again.ok).toBe(false);
        if (again.ok) return;
        expect(again.kind).toBe("duplicate");
        expect(await membershipCount(supabase, userId)).toBe(1);
    });

    it("leaves no orphan membership when a write inside the transaction fails", async () => {
        const supabase = createAdminClient();
        const [role] = await activeRoleKeys(supabase);
        const userId = await makeUser(supabase, "orphan");
        const missingOrgId = crypto.randomUUID();

        const res = await createMembershipWithAccessProfile(supabase, { userId, orgId: missingOrgId, role });
        expect(res.ok).toBe(false);

        // The membership must not exist for the failed org — nothing half-landed.
        const { count, error } = await supabase
            .from("user_roles")
            .select("user_id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("org_id", missingOrgId);
        expect(error).toBeNull();
        expect(count ?? 0).toBe(0);
    });

    /**
     * The other direction, and the one the orphan test above cannot reach.
     *
     * `user_access_profiles.org_id` references `orgs(id)`, so passing a missing
     * org makes the PROFILE insert — the first statement in the function — fail.
     * That proves a membership is never left behind, but it says nothing about
     * the profile insert being inside the transaction, because it never lands.
     *
     * W-16 (`20260818190000`, added after W-5's last issuance) constrains
     * `user_roles (org_id, role)` to `role_definitions (org_id, role_key)`. A
     * real org with an undefined role therefore fails at the SECOND statement,
     * after the profile row has already been written. Without a transaction the
     * profile survives with no membership — which is `q4_profiles_without_membership`,
     * the orphan count W-0 measured at zero. Nothing else in this suite covers it.
     *
     * The assertion is on the invariant, not on the SQLSTATE: whatever makes the
     * membership insert fail, the profile written moments earlier must be gone.
     */
    it("leaves no orphan profile when the membership insert fails after it", async () => {
        const supabase = createAdminClient();
        const userId = await makeUser(supabase, "orphan-profile");
        const undefinedRole = `w5-no-such-role-${crypto.randomUUID().slice(0, 8)}`;

        // Nothing pre-exists, so anything found afterwards was written by this call.
        expect(await profileCount(supabase, userId)).toBe(0);
        expect(await membershipCount(supabase, userId)).toBe(0);

        const res = await createMembershipWithAccessProfile(supabase, {
            userId,
            orgId: orgId!,
            role: undefinedRole,
        });
        expect(res.ok).toBe(false);

        expect(await membershipCount(supabase, userId)).toBe(0);
        expect(
            await profileCount(supabase, userId),
            "the profile insert ran before the failing membership insert and must have rolled back with it"
        ).toBe(0);
    });

    it("replace keeps the profile and never drops the membership on failure", async () => {
        const supabase = createAdminClient();
        const roles = await activeRoleKeys(supabase);
        const userId = await makeUser(supabase, "replace");

        expect((await createMembershipWithAccessProfile(supabase, { userId, orgId: orgId!, role: roles[0] })).ok).toBe(true);

        const target = roles[1] ?? roles[0];
        const replaced = await replaceMembershipWithAccessProfile(supabase, { userId, orgId: orgId!, role: target });
        expect(replaced.ok).toBe(true);
        if (!replaced.ok) return;
        expect(replaced.row.role).toBe(target);
        expect(await membershipCount(supabase, userId)).toBe(1);
        expect(await profileCount(supabase, userId)).toBe(1);

        // Replacing a pair that holds no membership is 404, not a silent create.
        const strangerId = await makeUser(supabase, "stranger");
        const missing = await replaceMembershipWithAccessProfile(supabase, { userId: strangerId, orgId: orgId!, role: target });
        expect(missing.ok).toBe(false);
        if (missing.ok) return;
        expect(missing.kind).toBe("not_found");
        expect(await membershipCount(supabase, strangerId)).toBe(0);
    });

    it("W-0 Q4 anti-join returns zero for this org", async () => {
        const supabase = createAdminClient();

        const { data: memberships, error: mErr } = await supabase.from("user_roles").select("user_id").eq("org_id", orgId!);
        expect(mErr).toBeNull();
        const { data: profiles, error: pErr } = await supabase.from("user_access_profiles").select("user_id").eq("org_id", orgId!);
        expect(pErr).toBeNull();

        const profiled = new Set((profiles ?? []).map((r) => (r as { user_id: string }).user_id));
        const uncovered = [...new Set((memberships ?? []).map((r) => (r as { user_id: string }).user_id))].filter(
            (id) => !profiled.has(id)
        );

        // Pre-existing uncovered pairs are W-6's backfill, not W-5's — but no pair
        // this test created may appear here.
        expect(uncovered.filter((id) => createdUserIds.includes(id))).toEqual([]);
    });
});
