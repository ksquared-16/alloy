/**
 * Firefly staging seed — the in-database proof, against a THROWAWAY database only (ALY-14 E2).
 *
 * The offline suite proves what the script is; this proves what it does. `scripts/fireflyStagingSeedProof.ts`
 * runs the real command against a migrated scratch database and checks that it refuses a database without
 * the Firefly org, converges to one fingerprint over two applies, writes exactly the dataset's rows with
 * intact relationships, heals drift on re-apply, and leaves every ZZ Alloy QA fixture row AND every row of
 * the Firefly tenant's own byte-identical.
 *
 * The seed creates no org, so the proof plants what hosted staging already has: the Firefly org by its
 * real id, in one of two shapes —
 *   bare        the org alone. Every configuration gate opens; the seed authors campuses, process, catalog.
 *   configured  the org with configuration and a household of its own, shaped like the live tenant
 *               (its own sites, `enrollment` department with `lifecycle_wu_<stage>` units and a published
 *               lead → enrolled process, an offering, a charge template, household roles, a family case).
 *               Every gate closes; the seed writes only families, placed in the tenant's configuration.
 * `configured` is the shape of hosted staging; `bare` is the shape of a fresh local database.
 *
 * Why a command and not a vitest live suite: web/vitest.config.ts excludes every live suite unless the
 * governed isolated executor admits it (tests/harness/liveSuiteAuthority.mjs), and this proof is not one
 * of those. It is an operator command whose only target is a database the operator made to throw away.
 *
 * Everything here is pure — SQL text and the target refusal — so the offline suite covers it.
 */

import { QA_ORGS, QA_STRUCTURE } from "@/lib/qa/sharedQaRegistry";

import { expectedSeedCounts } from "./dataset";
import { FIREFLY_ORG_ID, SEED_ID_PREFIX } from "./ids";

export const SCRATCH_DATABASE_PREFIX = "firefly_seed_scratch" as const;

export const TENANT_SHAPES = ["bare", "configured"] as const;
export type TenantShape = (typeof TENANT_SHAPES)[number];

const ORG = `'${FIREFLY_ORG_ID}'::uuid`;
const SEEDED = `id::text LIKE '${SEED_ID_PREFIX}%'`;
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The two ZZ Alloy QA orgs: cross-organization and permission fixtures, never seeded into. */
export const ZZ_QA_ORGS = Object.freeze([QA_ORGS.qa_shared, QA_ORGS.qa_secondary]);
const ZZ_IN = `(${ZZ_QA_ORGS.map((o) => `${q(o.id)}::uuid`).join(", ")})`;

/**
 * The proof writes into the database it is given (it plants fixtures and hand-edits a seeded row),
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

/** The live tenant's published Enrollment stages (docs/sprints/active/assets/firefly-config). */
export const TENANT_PROCESS_STAGES = ["lead", "tour", "decision", "waitlist", "enrolling", "enrolled"] as const;

/**
 * Plant the Firefly org shell by its real id — what hosted staging already holds — and, for
 * `configured`, a tenant's own configuration and one household. Scratch only; idempotent (each part is
 * planted only when absent, so a second proof run on the same database plants nothing).
 */
export function plantFireflySql(shape: TenantShape): string {
    const shell = `INSERT INTO public.orgs (id, name, slug) VALUES (${ORG}, 'Firefly Early Learning', 'firefly-early-learning') ON CONFLICT (id) DO NOTHING;`;
    if (shape === "bare") return shell;
    const builder = {
        lifecycle_builder_v1: {
            version: 1,
            active_process_id: "tenant-enrollment",
            processes: [{
                id: "tenant-enrollment", key: "enrollment", name: "Enrollment", is_active: true,
                stages: TENANT_PROCESS_STAGES.map((key, i) => ({ id: `tenant-stage-${key}`, key, label: key, sort_order: i })),
            }],
        },
    };
    const tenant = `id::text NOT LIKE '${SEED_ID_PREFIX}%'`;
    return `${shell}
DO $plant$
BEGIN
    IF EXISTS (SELECT 1 FROM public.departments WHERE org_id = ${ORG} AND key = 'enrollment' AND ${tenant}) THEN
        RETURN;
    END IF;
    INSERT INTO public.locations (org_id, label, location_type, is_primary, is_active)
    VALUES (${ORG}, 'Firefly Main', 'site', true, true), (${ORG}, 'Firefly East', 'site', false, true);
    INSERT INTO public.location_program_categories (org_id, location_id, key, label, sort_order, is_active)
    SELECT ${ORG}, l.id, k.key, k.label, k.n, true
    FROM public.locations l, (VALUES ('infant', 'Infant', 1), ('toddler', 'Toddler', 2), ('preschool', 'Preschool', 3)) k(key, label, n)
    WHERE l.org_id = ${ORG} AND l.location_type = 'site' AND l.${tenant};
    INSERT INTO public.departments (org_id, key, name, is_active, metadata)
    VALUES (${ORG}, 'enrollment', 'Enrollment', true, ${q(JSON.stringify(builder))}::jsonb);
    INSERT INTO public.work_units (org_id, department_id, key, name, is_active)
    SELECT ${ORG}, d.id, 'lifecycle_wu_' || s, initcap(s), true
    FROM public.departments d, unnest(ARRAY[${TENANT_PROCESS_STAGES.map(q).join(", ")}]) s
    WHERE d.org_id = ${ORG} AND d.key = 'enrollment' AND d.${tenant};
    INSERT INTO public.program_offerings (org_id, program_key, label, attendance_type, is_active, status)
    VALUES (${ORG}, 'infant', 'Infant', 'full_time', true, 'active');
    INSERT INTO public.financial_charge_templates (org_id, template_key, label, charge_category, trigger_type, amount_strategy, amount_cents, effective_start)
    VALUES (${ORG}, 'registration_fee', 'Registration Fee', 'fee', 'manual', 'fixed', 5000, '2026-01-01');
    INSERT INTO public.customer_person_role_types (org_id, key, label, sort_order, is_system, is_active)
    VALUES (${ORG}, 'parent', 'Parent', 20, false, true), (${ORG}, 'guardian', 'Guardian', 25, false, true);
    INSERT INTO public.customers (org_id, name, customer_type, status_key) VALUES (${ORG}, 'Tenant Household', 'residential', 'active');
    INSERT INTO public.persons (org_id, first_name, last_name, status_key) VALUES (${ORG}, 'Tenant', 'Guardian', 'active');
    INSERT INTO public.opportunities (org_id, customer_id, name, title, status_key, stage_key)
    SELECT ${ORG}, c.id, 'Tenant Household', 'Tenant Household', 'open', 'lead'
    FROM public.customers c WHERE c.org_id = ${ORG} AND c.name = 'Tenant Household';
END $plant$;`;
}

export const FIREFLY_PRESENT_SQL = `SELECT count(*) FROM public.orgs WHERE id = ${ORG};`;

export const ORG_SCOPED_TABLES_SQL = `SELECT c.table_name FROM information_schema.columns c
  JOIN information_schema.tables t USING (table_schema, table_name)
 WHERE c.table_schema = 'public' AND c.column_name = 'org_id' AND t.table_type = 'BASE TABLE'
 ORDER BY 1;`;

function snapshotSql(orgScopedTables: string[], orgIn: string, rowFilter: string): string {
    const parts = orgScopedTables.map(
        (t) => `SELECT ${q(t)} AS t, to_jsonb(x)::text AS j FROM public.${quoteIdent(t)} x WHERE x.org_id IN ${orgIn}${rowFilter}`,
    );
    parts.push(`SELECT 'orgs', to_jsonb(o)::text FROM public.orgs o WHERE o.id IN ${orgIn}`);
    return `SELECT count(*) || '|' || md5(coalesce(string_agg(t || ':' || j, E'\\n' ORDER BY t, j), ''))
  FROM (${parts.join("\nUNION ALL\n")}) s;`;
}

/** `<rows>|<md5>` over every row, in every given org-scoped table, owned by a ZZ Alloy QA org. */
export function zzSnapshotSql(orgScopedTables: string[]): string {
    return snapshotSql(orgScopedTables, ZZ_IN, "");
}

/**
 * `<rows>|<md5>` over every row of the Firefly tenant's OWN — every org-scoped row in the Firefly org
 * whose id is outside the seed namespace (a row with no `id` counts as the tenant's), plus the org row.
 */
export function fireflyTenantSnapshotSql(orgScopedTables: string[]): string {
    return snapshotSql(orgScopedTables, `(${ORG})`, ` AND coalesce(to_jsonb(x)->>'id', '') NOT LIKE '${SEED_ID_PREFIX}%'`);
}

function quoteIdent(name: string): string {
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`unexpected table name ${name}`);
    return `"${name}"`;
}

/**
 * `expected` is how many rows the seed adds to that count on a database it has never run on. The proof
 * measures the count before the first apply and after the second and compares the difference — so a
 * duplicate cannot hide, and the tenant's own rows do not have to be known. `seededSql` counts the seed
 * rows already there before the first apply (a re-run of the proof on one database), which the
 * expectation then discounts.
 */
export type CountCheck = { name: string; expected: number; sql: string; seededSql?: string };

/** Every row the Firefly org holds — seeded or not — per table, with what the seed adds for `shape`. */
export function scratchCountChecks(shape: TenantShape): CountCheck[] {
    const c = expectedSeedCounts();
    const config = (n: number) => (shape === "bare" ? n : 0);
    const all = (table: string, expected: number, name = table): CountCheck => ({
        name,
        expected,
        sql: `SELECT count(*) FROM public.${table} WHERE org_id = ${ORG};`,
        seededSql: `SELECT count(*) FROM public.${table} WHERE org_id = ${ORG} AND ${SEEDED};`,
    });
    return [
        { name: "orgs_total", expected: 0, sql: "SELECT count(*) FROM public.orgs;" },
        { name: "orgs_in_seed_namespace", expected: 0, sql: `SELECT count(*) FROM public.orgs WHERE ${SEEDED};` },
        all("departments", config(1)),
        all("work_units", config(c.work_units)),
        all("locations", config(c.locations)),
        all("location_program_categories", config(c.program_categories)),
        all("program_offerings", config(c.offerings)),
        all("program_offering_variants", config(c.variants)),
        all("commercial_tuition_rates", config(c.tuition_rates)),
        all("financial_charge_templates", config(c.charge_templates)),
        all("customer_person_role_types", config(c.role_types)),
        all("customers", c.customers),
        all("persons", c.persons),
        all("customer_persons", c.customer_persons),
        all("customer_members", c.children),
        all("person_child_relationships", c.child_relationships),
        all("opportunities", c.opportunities),
        all("opportunity_persons", c.opportunity_persons),
        all("opportunity_customer_members", c.opportunity_children),
        ...Object.entries(c.opportunities_by_stage).map(([stage, n]) => ({
            name: `opportunities_stage_${stage}`,
            expected: n,
            sql: `SELECT count(*) FROM public.opportunities WHERE org_id = ${ORG} AND stage_key = ${q(stage)};`,
            seededSql: `SELECT count(*) FROM public.opportunities WHERE org_id = ${ORG} AND stage_key = ${q(stage)} AND ${SEEDED};`,
        })),
    ];
}

/** Each check counts broken links among the seeded rows; every one must be zero. */
export function scratchRelationshipChecks(): CountCheck[] {
    const zero = (name: string, sql: string): CountCheck => ({ name, expected: 0, sql: `SELECT count(*) FROM ${sql};` });
    return [
        zero("room_without_seed_site", `public.locations r
            LEFT JOIN public.locations s ON s.id = r.parent_location_id AND s.org_id = ${ORG} AND s.location_type = 'site'
            WHERE r.org_id = ${ORG} AND r.${SEEDED} AND r.location_type = 'unit' AND s.id IS NULL`),
        zero("room_under_zz_site", `public.locations r JOIN public.locations s ON s.id = r.parent_location_id
            WHERE r.org_id = ${ORG} AND s.org_id IN ${ZZ_IN}`),
        zero("case_not_at_firefly_site", `public.opportunities o
            LEFT JOIN public.locations s ON s.id = o.location_id AND s.org_id = ${ORG} AND s.location_type = 'site'
            WHERE o.org_id = ${ORG} AND o.${SEEDED} AND s.id IS NULL`),
        zero("case_work_unit_not_firefly_enrollment", `public.opportunities o
            JOIN public.work_units w ON w.id = o.work_unit_id
            LEFT JOIN public.departments d ON d.id = w.department_id AND d.org_id = ${ORG} AND d.key = 'enrollment'
            WHERE o.org_id = ${ORG} AND o.${SEEDED} AND d.id IS NULL`),
        zero("guardian_link_cross_org", `public.customer_persons cp
            JOIN public.persons p ON p.id = cp.person_id JOIN public.customers c ON c.id = cp.customer_id
            WHERE cp.org_id = ${ORG} AND cp.${SEEDED} AND (p.org_id <> ${ORG} OR c.org_id <> ${ORG})`),
        zero("seed_row_links_tenant_household", `public.customer_persons cp
            WHERE cp.org_id = ${ORG} AND cp.${SEEDED}
              AND (cp.customer_id::text NOT LIKE '${SEED_ID_PREFIX}%' OR cp.person_id::text NOT LIKE '${SEED_ID_PREFIX}%')`),
        zero("child_without_household", `public.customer_members m
            LEFT JOIN public.customers c ON c.id = m.customer_id AND c.org_id = ${ORG}
            WHERE m.org_id = ${ORG} AND m.${SEEDED} AND c.id IS NULL`),
        zero("child_guardian_not_in_household", `public.person_child_relationships r
            JOIN public.customer_members m ON m.id = r.customer_member_id
            LEFT JOIN public.customer_persons cp ON cp.person_id = r.person_id AND cp.customer_id = m.customer_id
            WHERE r.org_id = ${ORG} AND r.${SEEDED} AND (r.customer_id <> m.customer_id OR cp.id IS NULL)`),
        zero("case_household_not_seeded", `public.opportunities o
            LEFT JOIN public.customers c ON c.id = o.customer_id AND c.org_id = ${ORG} AND c.${SEEDED}
            WHERE o.org_id = ${ORG} AND o.${SEEDED} AND c.id IS NULL`),
        zero("case_contact_not_household_guardian", `public.opportunity_persons op
            JOIN public.opportunities o ON o.id = op.opportunity_id
            LEFT JOIN public.customer_persons cp ON cp.person_id = op.person_id AND cp.customer_id = o.customer_id
            WHERE op.org_id = ${ORG} AND op.${SEEDED} AND cp.id IS NULL`),
        zero("participation_child_other_household", `public.opportunity_customer_members ocm
            JOIN public.opportunities o ON o.id = ocm.opportunity_id
            JOIN public.customer_members m ON m.id = ocm.customer_member_id
            WHERE ocm.org_id = ${ORG} AND ocm.${SEEDED} AND m.customer_id <> o.customer_id`),
        zero("household_without_case", `public.customers c
            LEFT JOIN public.opportunities o ON o.customer_id = c.id
            WHERE c.org_id = ${ORG} AND c.${SEEDED} AND o.id IS NULL`),
    ];
}

/** The first seeded household — the row the drift check hand-edits and expects re-apply to restore. */
export const DRIFT_TARGET_SQL = `SELECT id::text || '|' || name FROM public.customers WHERE org_id = ${ORG} AND ${SEEDED} ORDER BY id LIMIT 1;`;

export function driftEditSql(customerId: string): string {
    if (!customerId.startsWith(SEED_ID_PREFIX)) throw new Error("the drift edit only touches a seeded row");
    return `UPDATE public.customers SET name = 'Drifted Family' WHERE id = ${q(customerId)}::uuid AND org_id = ${ORG};`;
}

/**
 * Fence sensitivity: the committed seed with one write to the Firefly org row — the tenant's own, and
 * present in every shape — spliced in just before the fence closes. Run against a scratch database it must roll back with a FENCE error.
 */
export function fenceTamperedSeedSql(seedSql: string): string {
    const marker = "DO $fence_close$";
    if (seedSql.split(marker).length !== 2) throw new Error("the seed must close its fence exactly once");
    // A no-op on its value, but a new row version — exactly the write the seed must never make.
    const tamper = `UPDATE public.orgs SET name = name WHERE id = ${ORG};`;
    return seedSql.replace(marker, `${tamper}\n${marker}`);
}

/** The Firefly org row, as text — unchanged by the seed, and by a rolled-back tampered seed. */
export const FIREFLY_ORG_ROW_SQL = `SELECT md5(to_jsonb(o)::text) || '|' || o.xmin::text FROM public.orgs o WHERE o.id = ${ORG};`;
