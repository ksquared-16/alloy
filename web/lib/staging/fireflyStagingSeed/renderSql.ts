/**
 * Firefly staging seed — renders the dataset to one self-contained psql script (ALY-14 E2).
 *
 * The script is the unit of review: `supabase/seed/firefly_staging_seed.sql` is this function's
 * output, committed, and a test fails if the two ever differ.
 *
 * WHERE IT WRITES. Into the existing Firefly Early Learning org (FIREFLY_ORG_ID) — the only staging
 * school. It creates no org and no tenant: a database without that org is refused. Inside the org it
 * writes only rows in its own id namespace, and never updates or deletes a row it did not write.
 *
 * CONFIGURATION IS THE TENANT'S. Each configuration area is gated on what the org already holds:
 *   campuses   the org has no active site of its own → the seed's campuses, rooms and programs;
 *              otherwise families are placed at the tenant's own sites and program categories.
 *   enrollment the org has no `lead_management` department of its own → the seed's department, process
 *              and work units; otherwise each open family case joins that department's active
 *              `lifecycle_wu_<stage>`, and the seed refuses unless the department's active process is
 *              `enrollment` and every open seeded stage has its queue (lifecycleTarget.ts). Firefly's
 *              process-less `enrollment` department is never bound to.
 *   catalog    the org has no offering and no charge template of its own → the seed's rate card.
 *   roles      the org has none of the household role keys → the seed's vocabulary.
 * On hosted staging every gate is closed and only synthetic families are written; on a bare Firefly
 * shell (a local throwaway) every gate is open. Gates are decided in-transaction, so a re-run takes
 * the same branch.
 *
 * SAFETY, IN THE ORDER IT RUNS
 *   1. Refuses unless the runner set `seed_target` (local | staging) — psql -v seed_target=…
 *   2. One REPEATABLE READ transaction. Nothing is visible to anyone until every check below passes.
 *   3. Preflight refusals: the role must bypass RLS (so the fence counts every row); the Firefly org
 *      must exist; the retired separate staging org must not; no seed id may sit in another org.
 *   4. THE FENCE. Before writing, it counts every row in every table of the public, auth and storage
 *      schemas that is NOT a seed row (a seed row = a write-set table, org_id = Firefly, id in the seed
 *      namespace). After writing it counts again, and counts rows this transaction wrote
 *      (`age(xmin) <= 0`) among them. Any difference raises and the whole seed rolls back. So "no
 *      write to the tenant's own rows, any other org, or any global row" is measured in the database
 *      on every run, triggers included.
 *   5. Writes: upserts keyed on fixed ids, with fixed values (no now(), no random), so a re-run
 *      converges every seeded row back to its known state. Record numbers are left to the platform's
 *      own allocator (MAX + 1 per org), so the tenant's numbering continues normally afterwards.
 *
 * NOT WRITTEN: identities (auth.users, user_roles, access profiles) — E3 — and no DELETE anywhere.
 * No `\ir`: the script is fed on stdin when the only psql is the stack's own container.
 */

import { buildSeedLifecycleBuilder } from "./builder";
import {
    addDays,
    buildSeedFamilies,
    SEED_ANCHOR_DATE,
    SEED_CHARGE_TEMPLATES,
    SEED_OFFERINGS,
    SEED_PROGRAM_CATEGORIES,
    SEED_ROLE_TYPES,
    SEED_ROOMS,
    SEED_SITES,
    SEED_VARIANTS,
    seedCaseTitle,
    seedChildDisplayName,
    seedHouseholdName,
    seedIds,
    type SeedSite,
} from "./dataset";
import {
    FIREFLY_ORG_ID,
    RETIRED_SEPARATE_ORG_ID,
    SEED_DEPARTMENT_ID,
    SEED_ID_PREFIX,
    SEED_PROCESS_ID,
    SEED_SOURCE,
    SEED_WORK_UNIT_IDS,
} from "./ids";
import { SEED_WRITE_SET } from "./auditSql";
import { FIREFLY_ACTIVE_PROCESS_KEY, FIREFLY_LIFECYCLE_DEPARTMENT_KEY } from "./lifecycleTarget";
import WORK_UNIT_QUEUE_DEFINITIONS from "./workUnitQueueDefinitions.json";

/** Fixed write timestamp for config rows: the anchor day, 08:00 UTC. */
const CONFIG_AT = `${SEED_ANCHOR_DATE}T08:00:00Z`;
const RATES_EFFECTIVE_FROM = "2026-07-01";

export const FENCE_SCHEMAS = ["public", "auth", "storage"] as const;

/** Fence predicate for a write-set table: the row is not a seed row ($1 Firefly org, $2 namespace). */
const FENCE_OUTSIDE = "org_id IS DISTINCT FROM $1 OR id::text NOT LIKE $2";

/** psql variables the gates set with \gset; each is `true` when the seed authors that area. */
export const SEED_GATES = ["seed_campuses", "seed_enrollment", "seed_catalog", "seed_role_types"] as const;


const HOUSEHOLD_ROLE_KEYS = SEED_ROLE_TYPES.map((r) => r.key);

function lit(value: string | number | boolean | null): string {
    if (value === null) return "NULL";
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error("non-finite number in seed");
        return String(value);
    }
    if (typeof value === "boolean") return value ? "true" : "false";
    return `'${value.replace(/'/g, "''")}'`;
}

const uuid = (id: string) => `${lit(id)}::uuid`;
const F = () => uuid(FIREFLY_ORG_ID);
/** A row the tenant (or anyone but the seed) owns: its id is outside the seed namespace. */
const tenant = (alias: string) => `${alias}.id::text NOT LIKE '${SEED_ID_PREFIX}%'`;
const date = (d: string) => `${lit(d)}::date`;
const ts = (t: string) => `${lit(t)}::timestamptz`;

function jsonb(value: unknown): string {
    const text = JSON.stringify(value);
    if (text.includes("$json$")) throw new Error("seed JSON contains the dollar-quote tag");
    return `$json$${text}$json$::jsonb`;
}

const marker = (extra: Record<string, unknown> = {}) => jsonb({ seed: SEED_SOURCE, ...extra });

function rows(values: string[][]): string {
    return values.map((v) => `    (${v.join(", ")})`).join(",\n");
}

const siteN = (key: SeedSite["key"]) => SEED_SITES.find((s) => s.key === key)!.n;

function section(title: string): string {
    if (title.includes("'")) throw new Error(`section title "${title}" would break psql \\echo quoting`);
    return `\n\\echo '== ${title} =='\n`;
}

function preamble(): string {
    return `-- =============================================================================
-- Alloy — Firefly staging seed (SYNTHETIC, deterministic, idempotent) — ALY-14 E2
-- =============================================================================
-- GENERATED by web/lib/staging/fireflyStagingSeed/renderSql.ts. Do not edit by hand:
--   cd web && npm run staging:seed:firefly -- render
-- and commit the result. A test fails when this file and the renderer disagree.
--
-- Run it ONLY through the seed command, which resolves and refuses targets:
--   cd web && npm run staging:seed:firefly -- apply --target local
-- See docs/platform/governance/firefly-staging-seed.md.
--
-- Writes into the existing Firefly Early Learning org (${FIREFLY_ORG_ID}), the only staging school.
-- Creates no org. Writes only rows in the seed id namespace (${SEED_ID_PREFIX}…) and never changes a
-- row it did not write — the tenant's own rows, every other org, every global row — the fence proves it.
-- Configuration the org already has is used as is; the seed authors only what a bare org lacks.
-- Every person is synthetic.
-- =============================================================================

\\set ON_ERROR_STOP on

\\if :{?seed_target}
\\else
DO $refuse$ BEGIN
    RAISE EXCEPTION 'firefly_staging_seed: refused — seed_target is unset; run it through npm run staging:seed:firefly';
END $refuse$;
\\endif

BEGIN ISOLATION LEVEL REPEATABLE READ;

-- Assign this transaction its id now, so age(xmin) <= 0 means "written by this transaction".
SELECT txid_current() IS NOT NULL AS transaction_id_assigned;
SELECT set_config('firefly_seed.target', :'seed_target', true) AS seed_target;
`;
}

function preflight(): string {
    const F = uuid(FIREFLY_ORG_ID);
    const seedIdsInOtherOrgs = SEED_WRITE_SET.map(
        (t) => `(SELECT count(*) FROM public.${t} WHERE id::text LIKE '${SEED_ID_PREFIX}%' AND org_id IS DISTINCT FROM ${F})`,
    ).join("\n        + ");
    return `${section("Preflight refusals")}
DO $preflight$
DECLARE
    v_target text := current_setting('firefly_seed.target');
    v_org_name text;
    v_stray bigint;
BEGIN
    IF v_target NOT IN ('local', 'staging') THEN
        RAISE EXCEPTION 'firefly_staging_seed: refused — seed_target % is not a designated target', v_target;
    END IF;

    -- The fence counts rows. A role that RLS filters would count only what it can see.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolbypassrls)) THEN
        RAISE EXCEPTION 'firefly_staging_seed: refused — role % does not bypass RLS, so the fence could not see every row', current_user;
    END IF;

    -- The seed creates no tenant: Firefly must already be here.
    SELECT name INTO v_org_name FROM public.orgs WHERE id = ${F};
    IF v_org_name IS NULL THEN
        RAISE EXCEPTION 'firefly_staging_seed: refused — the Firefly org ${FIREFLY_ORG_ID} is not in this database, and this seed creates no org';
    END IF;

    -- The first version of this seed made a separate staging org. No additional tenants: report it.
    IF EXISTS (SELECT 1 FROM public.orgs WHERE id = ${uuid(RETIRED_SEPARATE_ORG_ID)}) THEN
        RAISE EXCEPTION 'firefly_staging_seed: refused — the retired separate staging org ${RETIRED_SEPARATE_ORG_ID} exists here; it must not, and this seed will not write beside it';
    END IF;

    -- Every seed id belongs to Firefly. One anywhere else is not this seed's to overwrite.
    v_stray := ${seedIdsInOtherOrgs};
    IF v_stray > 0 THEN
        RAISE EXCEPTION 'firefly_staging_seed: refused — % row(s) in the seed id namespace belong to another org', v_stray;
    END IF;

    RAISE NOTICE 'firefly_staging_seed: seeding into % (${FIREFLY_ORG_ID})', v_org_name;
END $preflight$;
`;
}

function fenceOpen(): string {
    return `${section("Fence: count every row that is not a seed row")}
CREATE TEMP TABLE firefly_seed_fence (
    schema_name  text   NOT NULL,
    table_name   text   NOT NULL,
    scope_column text,
    outside_rows bigint NOT NULL,
    PRIMARY KEY (schema_name, table_name)
) ON COMMIT DROP;

DO $fence_open$
DECLARE
    r record;
    v_scope text;
    v_count bigint;
BEGIN
    FOR r IN
        SELECT n.nspname AS schema_name, c.relname AS table_name, c.oid AS rel
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname IN (${FENCE_SCHEMAS.map(lit).join(", ")})
        ORDER BY 1, 2
    LOOP
        -- Only the write-set tables hold seed rows; in every other table, every row is outside.
        v_scope := CASE
            WHEN r.schema_name = 'public' AND r.table_name IN (${SEED_WRITE_SET.map(lit).join(", ")}) THEN 'seed_rows'
            ELSE NULL
        END;
        IF v_scope IS NULL THEN
            EXECUTE format('SELECT count(*) FROM %I.%I', r.schema_name, r.table_name) INTO v_count;
        ELSE
            EXECUTE format('SELECT count(*) FROM %I.%I WHERE ${FENCE_OUTSIDE}', r.schema_name, r.table_name)
                INTO v_count USING ${uuid(FIREFLY_ORG_ID)}, ${lit(`${SEED_ID_PREFIX}%`)};
        END IF;
        INSERT INTO firefly_seed_fence VALUES (r.schema_name, r.table_name, v_scope, v_count);
    END LOOP;
END $fence_open$;
`;
}

function fenceClose(): string {
    return `${section("Fence: prove no row but the seed rows changed")}
DO $fence_close$
DECLARE
    f record;
    v_count bigint;
    v_written bigint;
    v_violations text[] := ARRAY[]::text[];
    v_tables int := 0;
BEGIN
    FOR f IN SELECT * FROM firefly_seed_fence ORDER BY schema_name, table_name LOOP
        v_tables := v_tables + 1;
        IF f.scope_column IS NULL THEN
            EXECUTE format('SELECT count(*), count(*) FILTER (WHERE age(xmin) <= 0) FROM %I.%I', f.schema_name, f.table_name)
                INTO v_count, v_written;
        ELSE
            EXECUTE format(
                'SELECT count(*), count(*) FILTER (WHERE age(xmin) <= 0) FROM %I.%I WHERE ${FENCE_OUTSIDE}',
                f.schema_name, f.table_name
            ) INTO v_count, v_written USING ${uuid(FIREFLY_ORG_ID)}, ${lit(`${SEED_ID_PREFIX}%`)};
        END IF;
        IF v_count <> f.outside_rows OR v_written > 0 THEN
            v_violations := v_violations || format('%I.%I (outside rows %s -> %s, written %s)',
                f.schema_name, f.table_name, f.outside_rows, v_count, v_written);
        END IF;
    END LOOP;
    -- A table created during the run is a write outside the seed rows by definition.
    IF EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname IN (${FENCE_SCHEMAS.map(lit).join(", ")})
          AND NOT EXISTS (SELECT 1 FROM firefly_seed_fence x WHERE x.schema_name = n.nspname AND x.table_name = c.relname)
    ) THEN
        v_violations := v_violations || 'a table appeared during the seed'::text;
    END IF;
    IF array_length(v_violations, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'firefly_staging_seed: FENCE — rows that are not seed rows changed; rolled back: %',
            array_to_string(v_violations, '; ');
    END IF;
    RAISE NOTICE 'firefly_staging_seed: fence held — % tables, 0 rows changed outside the seed rows', v_tables;
END $fence_close$;
`;
}

/** The family stages, each bound to a work unit in whichever Enrollment department is the org's. */
const FAMILY_STAGES = [...new Set(buildSeedFamilies().map((f) => f.stage))];
/** The stages of open seeded cases: each must bind to a tenant queue, or the seed refuses. */
export const OPEN_FAMILY_STAGES = [...new Set(buildSeedFamilies().filter((f) => f.status === "open").map((f) => f.stage))];

/** Firefly's lifecycle department by key, whoever wrote it (the key is unique per org), on `alias`. */
export const lifecycleDepartmentKeySql = (alias: string) =>
    `${alias}.org_id = ${F()} AND ${alias}.key = ${lit(FIREFLY_LIFECYCLE_DEPARTMENT_KEY)}`;
/** The same department, only when it is the tenant's own (outside the seed namespace). */
const lifecycleDepartmentSql = (alias: string) => `${lifecycleDepartmentKeySql(alias)} AND ${tenant(alias)}`;

/** The id a gate bound for (kind, key) — the seed's own row or the tenant's; NULL when unbound. */
const bound = (kind: "site" | "category" | "work_unit", key: string) =>
    `(SELECT id FROM firefly_seed_binding WHERE kind = ${lit(kind)} AND key = ${lit(key)})`;

/**
 * Each gate, as a boolean SQL expression: true when the Firefly org has none of that configuration of
 * its own, so the seed authors it. The verification census evaluates the same expressions.
 */
export const SEED_GATE_SQL: Readonly<Record<(typeof SEED_GATES)[number], string>> = Object.freeze({
    seed_campuses: `NOT EXISTS (SELECT 1 FROM public.locations l WHERE l.org_id = ${F()} AND l.location_type = 'site' AND l.is_active AND ${tenant("l")})`,
    seed_enrollment: `NOT EXISTS (SELECT 1 FROM public.departments d WHERE ${lifecycleDepartmentSql("d")})`,
    seed_catalog: `(NOT EXISTS (SELECT 1 FROM public.program_offerings o WHERE o.org_id = ${F()} AND ${tenant("o")})
     AND NOT EXISTS (SELECT 1 FROM public.financial_charge_templates t WHERE t.org_id = ${F()} AND ${tenant("t")}))`,
    seed_role_types: `NOT EXISTS (SELECT 1 FROM public.customer_person_role_types r WHERE r.org_id = ${F()} AND ${tenant("r")}
        AND r.key IN (${HOUSEHOLD_ROLE_KEYS.map(lit).join(", ")}))`,
});

function gates(): string {
    return `${section("Gates: which configuration the Firefly org already has")}
-- true = the org has none of its own, so the seed authors it; false = the seed uses the tenant's.
SELECT
${SEED_GATES.map((g) => `    (${SEED_GATE_SQL[g]})::text AS ${g}`).join(",\n")}
\\gset
\\echo '   seed authors — campuses:' :seed_campuses ' enrollment:' :seed_enrollment ' catalog:' :seed_catalog ' roles:' :seed_role_types

-- What each family is placed at / routed to. Session-local; dropped at COMMIT.
CREATE TEMP TABLE firefly_seed_binding (
    kind text NOT NULL,
    key  text NOT NULL,
    id   uuid NOT NULL,
    PRIMARY KEY (kind, key)
) ON COMMIT DROP;
`;
}

function roleTypes(): string {
    return `${section("Household role vocabulary")}
\\if :seed_role_types
INSERT INTO public.customer_person_role_types (id, org_id, key, label, description, sort_order, is_system, is_active, metadata)
VALUES
${rows(SEED_ROLE_TYPES.map((r) => [uuid(seedIds.roleType(r.n)), F(), lit(r.key), lit(r.label), lit(r.description), lit(r.sort_order), "false", "true", marker()]))}
ON CONFLICT DO NOTHING;
\\else
\\echo '   the org has its own household roles — none written'
\\endif
`;
}

function enrollment(): string {
    const builder = buildSeedLifecycleBuilder();
    const wu = WORK_UNIT_QUEUE_DEFINITIONS as Record<keyof typeof SEED_WORK_UNIT_IDS, unknown>;
    const builderOwned = (stageKey: string, stageLabel: string) => ({
        lifecycle_builder_owned_v1: { builder_owned: true },
        lifecycle_stage_key: stageKey,
        lifecycle_stage_label: stageLabel,
        lifecycle_process_id: SEED_PROCESS_ID,
        seed: SEED_SOURCE,
    });
    const leadLabel = builder.processes[0].stages.find((s) => s.key === "lead")?.label ?? "Lead";
    const tourLabel = builder.processes[0].stages.find((s) => s.key === "tour")?.label ?? "Tour";
    const seedWorkUnitByStage = new Map(buildSeedFamilies().map((f) => [f.stage, f.work_unit_id]));

    return `${section("Enrollment department + business process")}
\\if :seed_enrollment
-- departments.metadata.lifecycle_builder_v1: the platform's Enrollment template with fixed stage ids
-- (web/lib/staging/fireflyStagingSeed/builder.ts); validated for publish by the seed's tests.
INSERT INTO public.departments (id, org_id, key, name, description, sort_order, is_active, metadata, updated_at)
VALUES (
    ${uuid(SEED_DEPARTMENT_ID)}, ${F()}, ${lit(FIREFLY_LIFECYCLE_DEPARTMENT_KEY)}, 'Enrollment',
    'Lead to enrolled — inquiry, tour, decision, placement.', 0, true,
    ${jsonb({ lifecycle_builder_v1: builder })},
    ${ts(CONFIG_AT)}
)
ON CONFLICT (id) DO UPDATE SET
    key = EXCLUDED.key, name = EXCLUDED.name, description = EXCLUDED.description,
    is_active = true, metadata = EXCLUDED.metadata, updated_at = EXCLUDED.updated_at;

-- Queue definitions are the representative seed's, verbatim (workUnitQueueDefinitions.json).
INSERT INTO public.work_units (id, org_id, department_id, key, name, description, sort_order, is_active, queue_definition, metadata, updated_at)
VALUES
    (${uuid(SEED_WORK_UNIT_IDS.new_leads)}, ${F()}, ${uuid(SEED_DEPARTMENT_ID)}, 'new_leads', 'New Leads',
     'First-touch intake for new family inquiries.', 0, true, ${jsonb(wu.new_leads)},
     ${jsonb(builderOwned("lead", leadLabel))}, ${ts(CONFIG_AT)}),
    (${uuid(SEED_WORK_UNIT_IDS.enrollment_pipeline)}, ${F()}, ${uuid(SEED_DEPARTMENT_ID)}, 'enrollment_pipeline', 'Enrollment Pipeline',
     'Full enrollment pipeline across every lane.', 1, true, ${jsonb(wu.enrollment_pipeline)},
     ${marker()}, ${ts(CONFIG_AT)}),
    (${uuid(SEED_WORK_UNIT_IDS.tours)}, ${F()}, ${uuid(SEED_DEPARTMENT_ID)}, 'tours', 'Tours',
     'Scheduled visits and post-tour decisions.', 2, true, ${jsonb(wu.tours)},
     ${jsonb(builderOwned("tour", tourLabel))}, ${ts(CONFIG_AT)})
ON CONFLICT (id) DO UPDATE SET
    department_id = EXCLUDED.department_id, key = EXCLUDED.key, name = EXCLUDED.name, description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order, is_active = true, queue_definition = EXCLUDED.queue_definition,
    metadata = EXCLUDED.metadata, updated_at = EXCLUDED.updated_at;

INSERT INTO firefly_seed_binding (kind, key, id)
VALUES
${rows(FAMILY_STAGES.map((stage) => ["'work_unit'", lit(stage), uuid(seedWorkUnitByStage.get(stage)!)]))};
\\else
-- The org's own lifecycle department (key ${FIREFLY_LIFECYCLE_DEPARTMENT_KEY}) is used untouched. It must hold an
-- active ${FIREFLY_ACTIVE_PROCESS_KEY} process and an active lifecycle_wu_<stage> for every open seeded stage;
-- otherwise the seed refuses rather than write cases no lane shows. Closed cases bind only if a queue exists.
DO $lifecycle$
DECLARE
    v_builder jsonb;
    v_missing text;
BEGIN
    SELECT d.metadata->'lifecycle_builder_v1' INTO v_builder FROM public.departments d WHERE ${lifecycleDepartmentSql("d")};
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(v_builder->'processes', '[]'::jsonb)) p
        WHERE p->>'id' = v_builder->>'active_process_id' AND p->>'key' = ${lit(FIREFLY_ACTIVE_PROCESS_KEY)}
    ) THEN
        RAISE EXCEPTION 'firefly_staging_seed: refused — department ${FIREFLY_LIFECYCLE_DEPARTMENT_KEY} has no active ${FIREFLY_ACTIVE_PROCESS_KEY} process in lifecycle_builder_v1';
    END IF;
    SELECT string_agg(s.stage, ',' ORDER BY s.stage) INTO v_missing
    FROM (VALUES ${OPEN_FAMILY_STAGES.map((stage) => `(${lit(stage)})`).join(", ")}) AS s(stage)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.departments d
        JOIN public.work_units w ON w.department_id = d.id AND w.key = 'lifecycle_wu_' || s.stage AND w.is_active
        WHERE ${lifecycleDepartmentSql("d")}
    );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'firefly_staging_seed: refused — department ${FIREFLY_LIFECYCLE_DEPARTMENT_KEY} has no active queue for open seeded stage(s) %', v_missing;
    END IF;
END $lifecycle$;
INSERT INTO firefly_seed_binding (kind, key, id)
SELECT 'work_unit', s.stage, w.id
FROM (VALUES ${FAMILY_STAGES.map((stage) => `(${lit(stage)})`).join(", ")}) AS s(stage)
JOIN public.departments d ON ${lifecycleDepartmentSql("d")}
JOIN public.work_units w ON w.department_id = d.id AND w.key = 'lifecycle_wu_' || s.stage AND w.is_active;
\\endif
`;
}

function campuses(): string {
    const siteRows = SEED_SITES.map((s) => [
        uuid(seedIds.site(s.n)), F(), lit(s.label), "'site'", "NULL", lit(s.is_primary), "true",
        lit(s.address1), lit(s.city), lit(s.state), lit(s.postal_code), "'US'", "'active'", marker({ site_key: s.key }),
    ]);
    const roomRows = SEED_ROOMS.map((r) => [
        uuid(seedIds.room(r.n)), F(), lit(r.label), "'unit'", uuid(seedIds.site(siteN(r.site))), "false", "true",
        "NULL", "NULL", "NULL", "NULL", "NULL", "'active'",
        marker({ capacity: r.capacity, ratio: r.ratio, classroom_age_group: r.age_group }),
    ]);
    return `${section("Campuses, rooms, programs")}
\\if :seed_campuses
-- A room is a \`unit\` location parented to its campus. Capacity lives in metadata, as on the live tenant.
-- location_number is left to the platform's allocator.
INSERT INTO public.locations (id, org_id, label, location_type, parent_location_id, is_primary, is_active,
                              address1, city, state, postal_code, country, status_key, metadata)
VALUES
${rows([...siteRows, ...roomRows])}
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label, location_type = EXCLUDED.location_type, parent_location_id = EXCLUDED.parent_location_id,
    is_primary = EXCLUDED.is_primary, is_active = true, address1 = EXCLUDED.address1, city = EXCLUDED.city,
    state = EXCLUDED.state, postal_code = EXCLUDED.postal_code,
    status_key = EXCLUDED.status_key, metadata = EXCLUDED.metadata;

INSERT INTO public.location_program_categories (id, org_id, location_id, key, label, sort_order, is_active)
VALUES
${rows(SEED_PROGRAM_CATEGORIES.map((c) => [uuid(seedIds.programCategory(c.n)), F(), uuid(seedIds.site(siteN(c.site))), lit(c.key), lit(c.label), lit(c.n), "true"]))}
ON CONFLICT (id) DO UPDATE SET key = EXCLUDED.key, label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = true;

INSERT INTO firefly_seed_binding (kind, key, id)
VALUES
${rows([
    ...SEED_SITES.map((s) => ["'site'", lit(s.key), uuid(seedIds.site(s.n))]),
    ...SEED_PROGRAM_CATEGORIES.map((c) => ["'category'", lit(`${c.site}:${c.key}`), uuid(seedIds.programCategory(c.n))]),
])};
\\else
-- The org's own campuses and programs are used untouched. Its active sites, in a fixed order, take
-- the seed's north / south / west in turn (wrapping when it has fewer than three); a child's program
-- is the tenant's category of that key at that site, or none.
INSERT INTO firefly_seed_binding (kind, key, id)
SELECT 'site', k.site_key, s.id
FROM (VALUES ${SEED_SITES.map((s, i) => `(${lit(s.key)}, ${i})`).join(", ")}) AS k(site_key, ord)
JOIN (
    SELECT l.id,
           row_number() OVER (ORDER BY l.is_primary DESC NULLS LAST, l.location_number NULLS LAST, l.label, l.id) - 1 AS rn,
           count(*) OVER () AS n
    FROM public.locations l
    WHERE l.org_id = ${F()} AND l.location_type = 'site' AND l.is_active AND ${tenant("l")}
) s ON s.rn = k.ord % s.n;

INSERT INTO firefly_seed_binding (kind, key, id)
SELECT 'category', b.key || ':' || c.key, c.id
FROM firefly_seed_binding b
JOIN public.location_program_categories c ON c.org_id = ${F()} AND c.location_id = b.id AND c.is_active
WHERE b.kind = 'site';
\\endif
`;
}

function catalog(): string {
    return `${section("Offerings, tuition, charge templates")}
\\if :seed_catalog
INSERT INTO public.program_offerings (id, org_id, program_key, label, attendance_type, is_active, status)
VALUES
${rows(SEED_OFFERINGS.map((o) => [uuid(seedIds.offering(o.n)), F(), lit(o.program_key), lit(o.label), lit(o.attendance_type), "true", "'active'"]))}
ON CONFLICT (id) DO UPDATE SET
    program_key = EXCLUDED.program_key, label = EXCLUDED.label, attendance_type = EXCLUDED.attendance_type,
    is_active = true, status = 'active';

INSERT INTO public.program_offering_variants (id, org_id, offering_id, label, quantity_type, quantity_value, is_active, status)
VALUES
${rows(SEED_VARIANTS.map((v) => [uuid(seedIds.variant(v.n)), F(), uuid(seedIds.offering(v.offering)), lit(v.label), "'days'", lit(v.days), "true", "'active'"]))}
ON CONFLICT (id) DO UPDATE SET
    offering_id = EXCLUDED.offering_id, label = EXCLUDED.label, quantity_value = EXCLUDED.quantity_value,
    is_active = true, status = 'active';

-- One monthly private-pay org-default rate per variant (no site overrides).
INSERT INTO public.commercial_tuition_rates
    (id, org_id, location_id, variant_id, cadence_key, payer_type, rate_cents, is_active, not_offered, effective_start)
VALUES
${rows(SEED_VARIANTS.map((v) => [uuid(seedIds.tuitionRate(v.n)), F(), "NULL", uuid(seedIds.variant(v.n)), "'monthly'", "'private_pay'", lit(v.rate_cents), "true", "false", date(RATES_EFFECTIVE_FROM)]))}
ON CONFLICT (id) DO UPDATE SET
    variant_id = EXCLUDED.variant_id, rate_cents = EXCLUDED.rate_cents, is_active = true,
    not_offered = false, effective_start = EXCLUDED.effective_start;

INSERT INTO public.financial_charge_templates
    (id, org_id, template_key, label, charge_category, trigger_type, amount_strategy, amount_cents,
     currency_code, occurs_on_strategy, billable_on_strategy, effective_start, review_required, is_active)
VALUES
${rows(SEED_CHARGE_TEMPLATES.map((t) => [uuid(seedIds.chargeTemplate(t.n)), F(), lit(t.template_key), lit(t.label), lit(t.charge_category), lit(t.trigger_type), lit(t.amount_strategy), lit(t.amount_cents), "'USD'", lit(t.occurs_on_strategy), "'immediate'", date(RATES_EFFECTIVE_FROM), "false", "true"]))}
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label, amount_strategy = EXCLUDED.amount_strategy, amount_cents = EXCLUDED.amount_cents,
    occurs_on_strategy = EXCLUDED.occurs_on_strategy, billable_on_strategy = EXCLUDED.billable_on_strategy,
    effective_start = EXCLUDED.effective_start, is_active = true;
\\else
\\echo '   the org has its own offerings / charge templates — none written'
\\endif
`;
}

function households(): string {
    const families = buildSeedFamilies();
    const guardians = families.flatMap((f) => f.guardians.map((g) => ({ f, g })));
    const children = families.flatMap((f) => f.children.map((c) => ({ f, c })));
    const childStage = (stage: string) =>
        ["waitlist", "enrolling", "enrolled", "closed_withdrawn"].includes(stage) ? stage : null;

    return `${section(`Households (${families.length}), guardians (${guardians.length}), children (${children.length})`)}
INSERT INTO public.customers (id, org_id, name, customer_type, status_key, external_source, external_id, created_at, metadata)
VALUES
${rows(families.map((f) => [uuid(seedIds.customer(f.n)), F(), lit(seedHouseholdName(f)), "'residential'", "'active'", lit(SEED_SOURCE), lit(`customer_${f.n}`), ts(f.inquired_at), marker()]))}
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, customer_type = EXCLUDED.customer_type, status_key = EXCLUDED.status_key,
    metadata = EXCLUDED.metadata;

-- full_name is written by trg_set_person_full_name. Record numbers (customer_number, person_number,
-- opportunity_number) are the platform's allocator's, as for any inquiry; an upsert never renumbers.
-- full_name is written by trg_set_person_full_name.
INSERT INTO public.persons (id, org_id, first_name, last_name, email, phone, status_key, external_source, external_id, created_at, metadata)
VALUES
${rows(guardians.map(({ f, g }) => [uuid(seedIds.person(g.n)), F(), lit(g.first_name), lit(g.last_name), lit(g.email), lit(g.phone), "'active'", lit(SEED_SOURCE), lit(`person_${g.n}`), ts(f.inquired_at), marker()]))}
ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, email = EXCLUDED.email,
    phone = EXCLUDED.phone, status_key = EXCLUDED.status_key, metadata = EXCLUDED.metadata;

INSERT INTO public.customer_persons (id, org_id, customer_id, person_id, role_type, is_primary, status, start_date, metadata)
VALUES
${rows(guardians.map(({ f, g }) => [uuid(seedIds.customerPerson(g.n)), F(), uuid(seedIds.customer(f.n)), uuid(seedIds.person(g.n)), lit(g.role_type), lit(g.is_primary), "'active'", date(f.inquired_at.slice(0, 10)), marker()]))}
ON CONFLICT (org_id, customer_id, person_id, role_type) DO NOTHING;

-- A child IS a customer_members row in this schema.
INSERT INTO public.customer_members (id, org_id, customer_id, display_name, relationship, first_name, last_name, dob, is_active, status_key, external_source, external_id, metadata)
VALUES
${rows(children.map(({ f, c }) => [uuid(seedIds.child(c.n)), F(), uuid(seedIds.customer(f.n)), lit(seedChildDisplayName(c)), "'child'", lit(c.first_name), lit(c.last_name), date(c.dob), "true", "'active'", lit(SEED_SOURCE), lit(`child_${c.n}`), marker({ program: c.program })]))}
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
    dob = EXCLUDED.dob, is_active = true, status_key = EXCLUDED.status_key, metadata = EXCLUDED.metadata;

INSERT INTO public.person_child_relationships (id, org_id, customer_id, customer_member_id, person_id, relationship_type, priority, status, metadata)
VALUES
${rows(children.map(({ f, c }) => [uuid(seedIds.childRelationship(c.n)), F(), uuid(seedIds.customer(f.n)), uuid(seedIds.child(c.n)), uuid(seedIds.person(f.guardians[0].n)), "'parent'", "1", "'active'", marker()]))}
ON CONFLICT (id) DO UPDATE SET
    person_id = EXCLUDED.person_id, relationship_type = EXCLUDED.relationship_type,
    priority = EXCLUDED.priority, status = EXCLUDED.status;
${section(`Family cases (${families.length}) and child participation (${children.length})`)}
-- status_key ∈ {open, closed} is durable truth; stage_key is process state.
INSERT INTO public.opportunities (
    id, org_id, customer_id, primary_person_id, location_id, work_unit_id,
    name, title, status_key, stage_key, close_reason_key, source,
    external_source, external_id, created_at, updated_at, metadata
)
VALUES
${rows(
    families.map((f) => {
        const title = seedCaseTitle(f);
        const first = f.children[0];
        return [
            uuid(seedIds.opportunity(f.n)), F(), uuid(seedIds.customer(f.n)), uuid(seedIds.person(f.guardians[0].n)),
            bound("site", f.site), bound("work_unit", f.stage), lit(title), lit(title), lit(f.status), lit(f.stage),
            lit(f.close_reason_key), lit(f.source), lit(SEED_SOURCE), lit(`opportunity_${f.n}`),
            ts(f.inquired_at), ts(f.last_activity_at),
            marker({
                program_type: first.program,
                schedule_type: first.schedule_type,
                inquiry_source: f.source,
                desired_start_date: first.desired_start_date,
                tour_date: f.tour_date,
            }),
        ];
    }),
)}
ON CONFLICT (id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id, primary_person_id = EXCLUDED.primary_person_id,
    location_id = EXCLUDED.location_id, work_unit_id = EXCLUDED.work_unit_id, name = EXCLUDED.name,
    title = EXCLUDED.title, status_key = EXCLUDED.status_key, stage_key = EXCLUDED.stage_key,
    close_reason_key = EXCLUDED.close_reason_key, source = EXCLUDED.source,
    created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at, metadata = EXCLUDED.metadata;

INSERT INTO public.opportunity_persons (id, org_id, opportunity_id, person_id, role_type, metadata)
VALUES
${rows(families.flatMap((f) => f.guardians.map((g) => [uuid(seedIds.opportunityPerson(g.n)), F(), uuid(seedIds.opportunity(f.n)), uuid(seedIds.person(g.n)), "'parent_guardian'", marker({ is_primary: g.is_primary })])))}
ON CONFLICT (opportunity_id, person_id) DO NOTHING;

-- Each child's participation: program at the family's campus (both as bound by the campus gate), schedule, requested days, and the
-- child-track stage once the family case has split at Decision.
INSERT INTO public.opportunity_customer_members (
    id, org_id, opportunity_id, customer_member_id, schedule_type, fit_status,
    outcome_status_key, stage_key, close_reason_key, start_date, location_id, program_category_id, metadata
)
VALUES
${rows(
    children.map(({ f, c }) => [
        uuid(seedIds.opportunityChild(c.n)), F(), uuid(seedIds.opportunity(f.n)), uuid(seedIds.child(c.n)),
        lit(c.schedule_type), "NULL", lit(f.child_outcome_status_key), lit(childStage(f.stage)),
        lit(f.stage === "closed" ? "not_a_fit" : f.stage === "closed_withdrawn" ? "withdrawn" : null),
        date(c.desired_start_date), bound("site", c.site), bound("category", `${c.site}:${c.program}`),
        marker({ requested_days_per_week: c.days_per_week }),
    ]),
)}
ON CONFLICT (org_id, opportunity_id, customer_member_id) DO UPDATE SET
    schedule_type = EXCLUDED.schedule_type, outcome_status_key = EXCLUDED.outcome_status_key,
    stage_key = EXCLUDED.stage_key, close_reason_key = EXCLUDED.close_reason_key,
    start_date = EXCLUDED.start_date, location_id = EXCLUDED.location_id,
    program_category_id = EXCLUDED.program_category_id, metadata = EXCLUDED.metadata;
`;
}

function closing(): string {
    return `${fenceClose()}
COMMIT;

\\echo '== Firefly staging seed complete — verify with: npm run staging:seed:firefly -- verify --target <target> =='
`;
}

export function renderFireflyStagingSeedSql(): string {
    return [preamble(), preflight(), fenceOpen(), gates(), roleTypes(), enrollment(), campuses(), catalog(), households(), closing()].join("");
}

/** Exposed for the verification census and tests. */
export const SEED_RENDER_CONSTANTS = { CONFIG_AT, RATES_EFFECTIVE_FROM, anchorPlus: (d: number) => addDays(SEED_ANCHOR_DATE, d) };
