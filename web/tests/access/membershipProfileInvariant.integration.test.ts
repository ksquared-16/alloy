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
 *   6. A writer that SKIPS the RPC still produces the fail-open — the
 *      complementary fact, which turns W-0 run 4's count-reasoning into
 *      attribution.
 *
 * The final describe block is NOT env-guarded and DOES run: it locks the SQL
 * layer, which tier B cannot see and which no test in this workstream has ever
 * covered. See its own header for why it lives in this file.
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
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * Pairs this suite creates ON PURPOSE without a profile, to prove the
 * complementary fact (see "a writer that skips the RPC…" below). The Q4
 * anti-join at the end of the suite subtracts exactly these and asserts the set
 * stays small, so the exclusion cannot quietly become a place to hide a real
 * uncovered pair.
 */
const deliberatelyUncovered = new Set<string>();

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
        const replaced = await replaceMembershipWithAccessProfile(supabase, { userId, orgId: orgId!, role: target , audit: { actorUserId: "test-actor", origin: "operator" as const, correlationId: "test-corr" }});
        expect(replaced.ok).toBe(true);
        if (!replaced.ok) return;
        expect(replaced.row.role).toBe(target);
        expect(await membershipCount(supabase, userId)).toBe(1);
        expect(await profileCount(supabase, userId)).toBe(1);

        // Replacing a pair that holds no membership is 404, not a silent create.
        const strangerId = await makeUser(supabase, "stranger");
        const missing = await replaceMembershipWithAccessProfile(supabase, { userId: strangerId, orgId: orgId!, role: target , audit: { actorUserId: "test-actor", origin: "operator" as const, correlationId: "test-corr" }});
        expect(missing.ok).toBe(false);
        if (missing.ok) return;
        expect(missing.kind).toBe("not_found");
        expect(await membershipCount(supabase, strangerId)).toBe(0);
    });

    /**
     * The complementary fact — the one case here that tests W-5's SCOPE rather
     * than its mechanism, and the reason this suite can settle an argument the
     * census cannot.
     *
     * Every case above proves the RPC is atomic. None proves that a writer which
     * SKIPS the RPC still produces the fail-open, and that is the fact W-0 run 4
     * needed: it attributed three new profile-less pairs to seed/QA tooling by
     * reasoning over counts, because Q4 returns counts and not rows.
     *
     * This is a bare insert in the shape of `seedRealisticChildcareDemoData.ts`
     * — no RPC, no profile. It asserts the database does NOT stop it, which is
     * the current, deliberate state of the world: W-5 put the invariant in the
     * RPC, not in a constraint or trigger, so a caller that goes around the RPC
     * still lands an uncovered pair.
     *
     * If this case ever goes red because a profile appeared, the invariant has
     * moved into the database and W-5's open scope question is settled. INVERT
     * the assertion then; do not delete the case.
     */
    it("a writer that skips the RPC still produces the fail-open", async () => {
        const supabase = createAdminClient();
        const [role] = await activeRoleKeys(supabase);
        const userId = await makeUser(supabase, "bypass");

        const { error } = await supabase.from("user_roles").insert({ user_id: userId, org_id: orgId!, role });
        expect(
            error,
            "a direct insert is not refused today — the invariant lives in the RPC, not in a constraint"
        ).toBeNull();
        deliberatelyUncovered.add(userId);

        expect(await membershipCount(supabase, userId)).toBe(1);
        expect(
            await profileCount(supabase, userId),
            "a bypassing writer leaves exactly the uncovered pair Q4 counts"
        ).toBe(0);
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
        // this test created may appear here, EXCEPT the one the bypass case above
        // created on purpose.
        expect(
            deliberatelyUncovered.size,
            "only the bypass negative control may be exempt from the anti-join"
        ).toBeLessThanOrEqual(1);
        expect(
            uncovered.filter((id) => createdUserIds.includes(id) && !deliberatelyUncovered.has(id))
        ).toEqual([]);
    });
});

/* ------------------------------------------------------------------------- *
 * The SQL layer — the half of W-5 that nothing has ever guarded.
 *
 * Tier B (`membershipAtomicWiring.test.ts`) walks `web/app` and `web/lib`, so it
 * can only ever see TypeScript callers. `supabase/migrations/` has never been in
 * any lock's subject in this workstream, and the only thing standing in for one
 * has been a COUNT re-derived by hand at each issuance — the 2026-09-06 record
 * reads "across all 373 there are exactly two INSERT INTO … user_roles and both
 * are inside W-5's own migration".
 *
 * Forty migrations later that sentence is false. There are now six such sites
 * across four files, and two membership-writing functions authored by OTHER
 * workstreams (D2's audited `replace_membership_with_access_profile` overload
 * and W-17's `assign_member_role_audited`). Both are correct — each writes the
 * access profile in the same function body. Neither calls W-5's function; both
 * re-implement the profile insert by copy, and nothing would have said a word if
 * one of them had forgotten.
 *
 * A hand-count is a measurement. This is the guard. It runs WITHOUT env — it
 * reads files — so unlike the integration cases above it actually executes.
 *
 * Scope note: this lock's natural home is the tier B file, which is not among
 * this assignment's deliverables and has been declined on scope grounds twice.
 * It is placed here, in scope, rather than left unwritten for a fifth issuance.
 * ------------------------------------------------------------------------- */

const migrationsDir = join(__dirname, "..", "..", "..", "supabase", "migrations");

/** A membership landing in the database. */
const MEMBERSHIP_INSERT = /INSERT\s+INTO\s+(?:public\.)?user_roles\b/gi;
/** Its access profile, which must land in the same unit of work. */
const PROFILE_INSERT = /INSERT\s+INTO\s+(?:public\.)?user_access_profiles\b/i;
/**
 * The boundaries of a unit of work: a function body, or a top-level DO block.
 * Anything between two boundaries executes together or not at all.
 */
const UNIT_BOUNDARY = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b|^DO\s*\$/gim;

/**
 * Units that write a membership with NO profile ON PURPOSE, and survive review
 * only because nothing they write outlives the migration. The exemption is not
 * granted, it is CHECKED — "the rolled-back exemptions still roll back" below
 * re-proves the property that earns it.
 */
const ROLLED_BACK_SELFTESTS: Record<string, string> = {
    "20260911260000_d2_no_self_inflicted_access_lockout.sql":
        "D2's lockout self-test writes memberships inside a DO block that always RAISEs, so nothing it writes is committed.",
};

function migrationFiles(): string[] {
    return readdirSync(migrationsDir)
        .filter((n) => n.endsWith(".sql"))
        .sort();
}

/** The function body or DO block containing `idx`. */
function enclosingUnit(sql: string, idx: number): string {
    const bounds: number[] = [];
    for (const m of sql.matchAll(UNIT_BOUNDARY)) bounds.push(m.index!);
    const start = bounds.filter((b) => b <= idx).pop() ?? 0;
    const end = bounds.find((b) => b > idx) ?? sql.length;
    return sql.slice(start, end);
}

/** Every membership-insert site in `sql`, paired with the unit it executes in. */
function membershipInsertUnits(sql: string): { index: number; unit: string }[] {
    return [...sql.matchAll(MEMBERSHIP_INSERT)].map((m) => ({
        index: m.index!,
        unit: enclosingUnit(sql, m.index!),
    }));
}

describe("W-5 — the atomic invariant holds in the SQL layer too", () => {
    /**
     * The load-bearing lock. A migration that inserts a membership without
     * writing the access profile in the same unit of work re-opens G4 below the
     * level every existing W-5 test can see.
     */
    it("no migration inserts a membership without its access profile", () => {
        const violations: string[] = [];

        for (const name of migrationFiles()) {
            if (name in ROLLED_BACK_SELFTESTS) continue;
            const sql = readFileSync(join(migrationsDir, name), "utf8");
            for (const { index, unit } of membershipInsertUnits(sql)) {
                if (PROFILE_INSERT.test(unit)) continue;
                violations.push(`${name}:${sql.slice(0, index).split("\n").length}`);
            }
        }

        expect(
            violations,
            "each of these inserts a membership with no access profile in the same transaction — " +
                "write the profile in the same function, or call create_membership_with_access_profile"
        ).toEqual([]);
    });

    it("the rolled-back exemptions still roll back", () => {
        for (const [name, reason] of Object.entries(ROLLED_BACK_SELFTESTS)) {
            const sql = readFileSync(join(migrationsDir, name), "utf8");
            const units = membershipInsertUnits(sql);
            expect(units.length, `${name} no longer inserts a membership — drop its exemption`).toBeGreaterThan(0);

            for (const { unit } of units) {
                // A DO block that always raises commits nothing. A FUNCTION does not
                // have that property, so an exemption must not migrate into one.
                expect(unit.startsWith("DO"), `${name}: exemption is no longer a DO block — ${reason}`).toBe(true);
                expect(
                    /RAISE\s+EXCEPTION/i.test(unit),
                    `${name}: exemption no longer forces a rollback — ${reason}`
                ).toBe(true);
            }
        }
    });

    it("the scan is not vacuous", () => {
        const files = migrationFiles();
        expect(files.length, "the migrations directory did not resolve").toBeGreaterThan(400);

        // W-5's own migration must be found, and must pass for the right reason.
        const w5 = "20260807090001_membership_profile_atomic_create.sql";
        expect(files).toContain(w5);
        const w5Units = membershipInsertUnits(readFileSync(join(migrationsDir, w5), "utf8"));
        expect(w5Units.length, "W-5's create and replace functions both insert a membership").toBe(2);
        for (const { unit } of w5Units) expect(PROFILE_INSERT.test(unit)).toBe(true);

        // Across the tree the scan must still be finding real sites; if this drops
        // to zero the lock above passes because it looked at nothing.
        const total = files.reduce(
            (n, f) => n + membershipInsertUnits(readFileSync(join(migrationsDir, f), "utf8")).length,
            0
        );
        expect(total, "no membership inserts found at all — the pattern has stopped matching").toBeGreaterThanOrEqual(
            5
        );
    });

    it("a unit that writes a membership with no profile is reported", () => {
        // The negative fixture, built in memory rather than staged in the repo — a
        // lock that has never been seen to fail is not known to work.
        const fabricated = [
            "CREATE OR REPLACE FUNCTION public.grant_membership_unsafe(p_user uuid, p_org uuid)",
            "RETURNS void LANGUAGE plpgsql AS $$",
            "BEGIN",
            "    INSERT INTO public.user_roles (user_id, org_id, role) VALUES (p_user, p_org, 'admin');",
            "END;",
            "$$;",
        ].join("\n");

        const units = membershipInsertUnits(fabricated);
        expect(units.length).toBe(1);
        expect(PROFILE_INSERT.test(units[0].unit)).toBe(false);
    });
});
