/**
 * Phase 0 behavioral test harness — real-database fixtures.
 *
 * WHY THIS EXISTS
 * Communications had zero DB-backed tests. Every claim about concurrency,
 * RLS, migration shape, trigger behavior, or "this row is now blocked" was
 * unverifiable. Phase 0 makes production-safety claims, so it needs a harness
 * that talks to a real Postgres.
 *
 * SAFETY — READ BEFORE EXTENDING
 * Every managed Alloy worktree writes the SAME live Supabase tenant. A test
 * that creates or deletes rows in a shared org would corrupt other workers'
 * state and could destroy real configuration.
 *
 * Therefore this harness:
 *   1. Is OFF unless P0_DB_TESTS_ENABLED=true is set explicitly.
 *   2. Creates its OWN disposable org per run, prefixed `zz-p0-test-`.
 *   3. REFUSES to operate on any org id it did not itself create.
 *   4. Tears down in reverse dependency order in afterAll.
 *
 * Follows the established env-gated pattern from tests/admin/tenantEndToEnd.ts.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ENV_FLAG = "P0_DB_TESTS_ENABLED";
const ORG_NAME_PREFIX = "zz-p0-test-";

/** Orgs the harness created this process. Nothing else may be written or deleted. */
const ownedOrgIds = new Set<string>();

export function dbTestsEnabled(): boolean {
    return (
        process.env[ENV_FLAG] === "true" &&
        Boolean(process.env.SUPABASE_URL?.trim()) &&
        Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
    );
}

export function serviceClient(): SupabaseClient {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) throw new Error(`[p0-harness] ${ENV_FLAG} set but SUPABASE_URL/SERVICE_ROLE_KEY missing`);
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Guard every mutation. A test that tries to write outside a harness-created
 * org is a bug that could damage the shared tenant, so it throws rather than
 * failing softly.
 */
export function assertOwnedOrg(orgId: string): void {
    if (!ownedOrgIds.has(orgId)) {
        throw new Error(
            `[p0-harness] refusing to mutate org ${orgId}: not created by this harness. ` +
                `All worktrees share one live tenant — only disposable orgs may be written.`
        );
    }
}

export type DisposableOrg = {
    orgId: string;
    /** Rows to remove in afterAll, deleted in reverse insertion order. */
    track: (table: string, id: string) => void;
    cleanup: () => Promise<void>;
};

/** Create a disposable org and return a tracker for everything created under it. */
export async function createDisposableOrg(sb: SupabaseClient, label: string): Promise<DisposableOrg> {
    const suffix = `${label}-${process.pid}-${ownedOrgIds.size}`;
    const name = `${ORG_NAME_PREFIX}${suffix}`;

    const { data, error } = await sb.from("orgs").insert({ name, slug: name }).select("id").single();
    if (error || !data?.id) throw new Error(`[p0-harness] could not create disposable org: ${error?.message}`);

    const orgId = data.id as string;
    ownedOrgIds.add(orgId);

    const created: Array<{ table: string; id: string }> = [];

    return {
        orgId,
        track(table, id) {
            created.push({ table, id });
        },
        async cleanup() {
            assertOwnedOrg(orgId);
            for (const row of [...created].reverse()) {
                const { error: delErr } = await sb.from(row.table).delete().eq("id", row.id);
                if (delErr) console.warn(`[p0-harness] cleanup ${row.table}/${row.id}: ${delErr.message}`);
            }
            const { error: orgErr } = await sb.from("orgs").delete().eq("id", orgId);
            if (orgErr) console.warn(`[p0-harness] cleanup org ${orgId}: ${orgErr.message}`);
            ownedOrgIds.delete(orgId);
        },
    };
}

/** Insert a person into a disposable org. `person_number` is NOT NULL with no default. */
export async function createPerson(
    sb: SupabaseClient,
    org: DisposableOrg,
    fields: { first_name?: string; last_name?: string; email?: string; phone?: string; person_number?: number } = {}
): Promise<string> {
    assertOwnedOrg(org.orgId);
    const { data, error } = await sb
        .from("persons")
        .insert({
            org_id: org.orgId,
            person_number: fields.person_number ?? Math.floor(Math.random() * 1_000_000_000),
            first_name: fields.first_name ?? "P0",
            last_name: fields.last_name ?? "Harness",
            email: fields.email ?? null,
            phone: fields.phone ?? null,
        })
        .select("id")
        .single();
    if (error || !data?.id) throw new Error(`[p0-harness] createPerson failed: ${error?.message}`);
    org.track("persons", data.id as string);
    return data.id as string;
}

/**
 * Does `table` have `column`, live?
 *
 * PostgREST rejects a select naming an unknown column, so this is a non-mutating
 * probe that works on an empty table — which matters because the tables P0-4
 * asserts against have zero rows. Selecting `*` and reading keys would report
 * nothing at all for an empty table.
 */
export async function hasColumn(sb: SupabaseClient, table: string, column: string): Promise<boolean> {
    const { error } = await sb.from(table).select(column).limit(0);
    if (!error) return true;
    // PostgREST 42703 = undefined_column. Anything else is a real failure.
    if (error.code === "42703" || /column .* does not exist/i.test(error.message)) return false;
    throw new Error(`[p0-harness] hasColumn(${table}.${column}) failed: ${error.message}`);
}

/** Assert a table's exact expected column set is present. Returns the missing ones. */
export async function missingColumns(sb: SupabaseClient, table: string, expected: string[]): Promise<string[]> {
    const results = await Promise.all(expected.map(async (c) => ({ c, ok: await hasColumn(sb, table, c) })));
    return results.filter((r) => !r.ok).map((r) => r.c);
}
