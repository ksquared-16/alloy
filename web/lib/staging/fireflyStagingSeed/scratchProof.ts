/**
 * Firefly staging seed — the in-database proof, against a THROWAWAY database only (ALY-14 E2).
 *
 * The offline suite proves what the script is; this proves what it does. `scripts/fireflyStagingSeedProof.ts`
 * runs the real command twice against a migrated scratch database and checks that it converges to one
 * fingerprint, writes exactly the dataset's rows with intact relationships, heals drift on re-apply, and
 * leaves every ZZ Alloy QA fixture row byte-identical.
 *
 * Why a command and not a vitest live suite: web/vitest.config.ts excludes every live suite unless the
 * governed isolated executor admits it (tests/harness/liveSuiteAuthority.mjs), and this proof is not one
 * of those. It is an operator command whose only target is a database the operator made to throw away.
 *
 * Everything here is pure — SQL text and the target refusal — so the offline suite covers it.
 */

import { QA_ORGS, QA_STRUCTURE } from "@/lib/qa/sharedQaRegistry";

import { expectedSeedCounts } from "./dataset";
import { SEED_ID_PREFIX, SEED_ORG_ID } from "./ids";

export const SCRATCH_DATABASE_PREFIX = "firefly_seed_scratch" as const;

const ORG = `'${SEED_ORG_ID}'::uuid`;
const SEEDED = `id::text LIKE '${SEED_ID_PREFIX}%'`;
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The two ZZ Alloy QA orgs: cross-organization and permission fixtures, never seeded into. */
export const ZZ_QA_ORGS = Object.freeze([QA_ORGS.qa_shared, QA_ORGS.qa_secondary]);
const ZZ_IN = `(${ZZ_QA_ORGS.map((o) => `${q(o.id)}::uuid`).join(", ")})`;

/**
 * The proof writes into the database it is given (it plants ZZ fixtures and hand-edits a seeded row),
 * so it accepts nothing but a loopback database named `firefly_seed_scratch*`. Not the shared stack's
 * `postgres`, not staging.
 */
export function scratchProofRefusal(raw: string | null | undefined): string | null {
    const text = String(raw ?? "").trim();
    if (!text) return "FIREFLY_STAGING_SEED_SCRATCH_DATABASE_URL is not set";
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return "the scratch database URL does not parse";
    }
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") return "the scratch database URL is not postgresql://";
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname.toLowerCase())) {
        return `the scratch database must be on loopback, got ${url.hostname}`;
    }
    const db = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!db.startsWith(SCRATCH_DATABASE_PREFIX)) {
        return `database "${db || "<default>"}" is not a ${SCRATCH_DATABASE_PREFIX}* throwaway`;
    }
    return null;
}

/** Plant the ZZ Alloy QA orgs and their registry sites by their real ids, if absent. Scratch only. */
export function plantZzFixturesSql(): string {
    const orgs = ZZ_QA_ORGS.map((o) => `(${q(o.id)}::uuid, ${q(o.name)}, ${q(o.slug)})`).join(", ");
    const sites = Object.values(QA_STRUCTURE.sites)
        .map((s, i) => `(${q(s.id)}::uuid, ${q(QA_ORGS[s.org].id)}::uuid, ${q(s.name)}, 'site', ${900001 + i})`)
        .join(", ");
    return [
        `INSERT INTO public.orgs (id, name, slug) VALUES ${orgs} ON CONFLICT (id) DO NOTHING;`,
        `INSERT INTO public.locations (id, org_id, label, location_type, location_number) VALUES ${sites} ON CONFLICT (id) DO NOTHING;`,
    ].join("\n");
}

export const ORG_SCOPED_TABLES_SQL = `SELECT c.table_name FROM information_schema.columns c
  JOIN information_schema.tables t USING (table_schema, table_name)
 WHERE c.table_schema = 'public' AND c.column_name = 'org_id' AND t.table_type = 'BASE TABLE'
 ORDER BY 1;`;

/** `<rows>|<md5>` over every row, in every given org-scoped table, owned by a ZZ Alloy QA org. */
export function zzSnapshotSql(orgScopedTables: string[]): string {
    const parts = orgScopedTables.map(
        (t) => `SELECT ${q(t)} AS t, to_jsonb(x)::text AS j FROM public.${quoteIdent(t)} x WHERE x.org_id IN ${ZZ_IN}`,
    );
    parts.push(`SELECT 'orgs', to_jsonb(o)::text FROM public.orgs o WHERE o.id IN ${ZZ_IN}`);
    return `SELECT count(*) || '|' || md5(coalesce(string_agg(t || ':' || j, E'\\n' ORDER BY t, j), ''))
  FROM (${parts.join("\nUNION ALL\n")}) s;`;
}

function quoteIdent(name: string): string {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`unexpected table name ${name}`);
    return `"${name}"`;
}

export type CountCheck = { name: string; expected: number; sql: string };

/** Every row the seed org holds — seeded or not — so a duplicate from a second apply would show. */
export function scratchCountChecks(): CountCheck[] {
    const c = expectedSeedCounts();
    const all = (table: string, expected: number, name = table): CountCheck => ({
        name,
        expected,
        sql: `SELECT count(*) FROM public.${table} WHERE org_id = ${ORG};`,
    });
    return [
        { name: "orgs", expected: 1, sql: `SELECT count(*) FROM public.orgs WHERE id = ${ORG};` },
        {
            name: "orgs_in_seed_namespace_or_slug",
            expected: 1,
            sql: `SELECT count(*) FROM public.orgs WHERE ${SEEDED} OR slug LIKE 'firefly-early-learning-staging%';`,
        },
        all("locations", c.locations),
        all("customers", c.customers),
        all("persons", c.persons),
        all("customer_persons", c.customer_persons),
        all("customer_members", c.children),
        all("person_child_relationships", c.child_relationships),
        all("opportunities", c.opportunities),
        all("opportunity_persons", c.opportunity_persons),
        all("opportunity_customer_members", c.opportunity_children),
        all("program_offerings", c.offerings),
        all("program_offering_variants", c.variants),
        all("commercial_tuition_rates", c.tuition_rates),
        all("financial_charge_templates", c.charge_templates),
        all("work_units", c.work_units),
        ...Object.entries(c.opportunities_by_stage).map(([stage, n]) => ({
            name: `opportunities_stage_${stage}`,
            expected: n,
            sql: `SELECT count(*) FROM public.opportunities WHERE org_id = ${ORG} AND stage_key = ${q(stage)};`,
        })),
    ];
}

/** Each check counts broken links; every one must be zero. */
export function scratchRelationshipChecks(): CountCheck[] {
    const zero = (name: string, sql: string): CountCheck => ({ name, expected: 0, sql: `SELECT count(*) FROM ${sql};` });
    return [
        zero("room_without_seed_site", `public.locations r
            LEFT JOIN public.locations s ON s.id = r.parent_location_id AND s.org_id = ${ORG} AND s.location_type = 'site'
            WHERE r.org_id = ${ORG} AND r.location_type = 'unit' AND s.id IS NULL`),
        zero("room_under_zz_site", `public.locations r JOIN public.locations s ON s.id = r.parent_location_id
            WHERE r.org_id = ${ORG} AND s.org_id IN ${ZZ_IN}`),
        zero("guardian_link_cross_org", `public.customer_persons cp
            JOIN public.persons p ON p.id = cp.person_id JOIN public.customers c ON c.id = cp.customer_id
            WHERE cp.org_id = ${ORG} AND (p.org_id <> ${ORG} OR c.org_id <> ${ORG})`),
        zero("child_without_household", `public.customer_members m
            LEFT JOIN public.customers c ON c.id = m.customer_id AND c.org_id = ${ORG}
            WHERE m.org_id = ${ORG} AND c.id IS NULL`),
        zero("child_guardian_not_in_household", `public.person_child_relationships r
            JOIN public.customer_members m ON m.id = r.customer_member_id
            LEFT JOIN public.customer_persons cp ON cp.person_id = r.person_id AND cp.customer_id = m.customer_id
            WHERE r.org_id = ${ORG} AND (r.customer_id <> m.customer_id OR cp.id IS NULL)`),
        zero("case_household_not_seeded", `public.opportunities o
            LEFT JOIN public.customers c ON c.id = o.customer_id AND c.org_id = ${ORG}
            WHERE o.org_id = ${ORG} AND c.id IS NULL`),
        zero("case_contact_not_household_guardian", `public.opportunity_persons op
            JOIN public.opportunities o ON o.id = op.opportunity_id
            LEFT JOIN public.customer_persons cp ON cp.person_id = op.person_id AND cp.customer_id = o.customer_id
            WHERE op.org_id = ${ORG} AND cp.id IS NULL`),
        zero("participation_child_other_household", `public.opportunity_customer_members ocm
            JOIN public.opportunities o ON o.id = ocm.opportunity_id
            JOIN public.customer_members m ON m.id = ocm.customer_member_id
            WHERE ocm.org_id = ${ORG} AND m.customer_id <> o.customer_id`),
        zero("household_without_case", `public.customers c
            LEFT JOIN public.opportunities o ON o.customer_id = c.id
            WHERE c.org_id = ${ORG} AND o.id IS NULL`),
    ];
}

/** The first seeded household — the row the drift check hand-edits and expects re-apply to restore. */
export const DRIFT_TARGET_SQL = `SELECT id::text || '|' || name FROM public.customers WHERE org_id = ${ORG} AND ${SEEDED} ORDER BY id LIMIT 1;`;

export function driftEditSql(customerId: string): string {
    if (!customerId.startsWith(SEED_ID_PREFIX)) throw new Error("the drift edit only touches a seeded row");
    return `UPDATE public.customers SET name = 'Drifted Family' WHERE id = ${q(customerId)}::uuid AND org_id = ${ORG};`;
}
