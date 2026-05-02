/**
 * Export Postgres catalog metadata for public schema to CSV files under docs/supabase/reference/.
 *
 * Requirements: DATABASE_URL (or SUPABASE_DB_URL) pointing at the Supabase Postgres database.
 *
 * Run from repo root:
 *   DATABASE_URL='postgresql://...' node scripts/supabase/export_schema_reference.mjs
 *
 * Optional:
 *   SCHEMA_REFERENCE_OUT=/absolute/or/relative/path   (default: docs/supabase/reference)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const DATABASE_URL =
    process.env.DATABASE_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    "";

const rawOut = process.env.SCHEMA_REFERENCE_OUT?.trim();
const OUT_DIR = rawOut
    ? path.isAbsolute(rawOut)
        ? rawOut
        : path.join(REPO_ROOT, rawOut)
    : path.join(REPO_ROOT, "docs/supabase/reference");

/** Stable CSV: RFC 4180-style escaping */
function escapeCell(value) {
    if (value === null || value === undefined) return "";
    const s = String(value);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function writeCsv(fileName, columns, rows) {
    const filePath = path.join(OUT_DIR, fileName);
    const header = columns.map(escapeCell).join(",");
    const lines = [header];
    for (const row of rows) {
        lines.push(columns.map((c) => escapeCell(row[c])).join(","));
    }
    fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
    return filePath;
}

const QUERIES = {
    supabase_schema_columns: {
        columns: [
            "table_catalog",
            "table_schema",
            "table_name",
            "column_name",
            "ordinal_position",
            "column_default",
            "is_nullable",
            "data_type",
            "udt_schema",
            "udt_name",
            "character_maximum_length",
            "numeric_precision",
            "numeric_scale",
            "datetime_precision",
            "is_generated",
            "generation_expression",
        ],
        sql: `
SELECT
  c.table_catalog::text,
  c.table_schema::text,
  c.table_name::text,
  c.column_name::text,
  c.ordinal_position::integer,
  c.column_default::text,
  c.is_nullable::text,
  c.data_type::text,
  c.udt_schema::text,
  c.udt_name::text,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale,
  c.datetime_precision,
  COALESCE(c.is_generated::text, ''),
  COALESCE(c.generation_expression::text, '')
FROM information_schema.columns c
WHERE c.table_schema = 'public'
ORDER BY c.table_catalog, c.table_schema, c.table_name, c.ordinal_position
`,
    },

    supabase_constraints: {
        columns: [
            "constraint_schema",
            "constraint_name",
            "constraint_type",
            "table_schema",
            "table_name",
            "constraint_definition",
            "is_deferrable",
            "initially_deferred",
        ],
        sql: `
SELECT
  n.nspname::text AS constraint_schema,
  con.conname::text AS constraint_name,
  CASE con.contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'c' THEN 'CHECK'
    WHEN 'x' THEN 'EXCLUDE'
    WHEN 't' THEN 'TRIGGER_CONSTRAINT' -- rare
    ELSE con.contype::text
  END AS constraint_type,
  relnamespace.nspname::text AS table_schema,
  rel.relname::text AS table_name,
  pg_get_constraintdef(con.oid, true)::text AS constraint_definition,
  con.condeferrable::text AS is_deferrable,
  con.condeferred::text AS initially_deferred
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace relnamespace ON relnamespace.oid = rel.relnamespace
JOIN pg_namespace n ON n.oid = con.connamespace
WHERE relnamespace.nspname = 'public'
ORDER BY table_schema, table_name, constraint_name
`,
    },

    supabase_indexes: {
        columns: [
            "schemaname",
            "tablename",
            "indexname",
            "is_unique",
            "is_primary",
            "index_method",
            "indexdef",
        ],
        sql: `
SELECT
      n.nspname::text AS schemaname,
      c.relname::text AS tablename,
      i.relname::text AS indexname,
      ix.indisunique::text AS is_unique,
      ix.indisprimary::text AS is_primary,
      am.amname::text AS index_method,
      pg_get_indexdef(i.oid, 0, true)::text AS indexdef
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class c ON c.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_am am ON am.oid = i.relam
    WHERE n.nspname = 'public'
      AND ix.indisvalid
    ORDER BY schemaname, tablename, indexname
`,
    },

    supabase_rls_policies: {
        columns: ["schemaname", "tablename", "policyname", "permissive", "roles", "cmd", "qual", "with_check"],
        sql: `
SELECT
  pol.schemaname::text,
  pol.tablename::text,
  pol.policyname::text,
  pol.permissive::text,
  pol.roles::text,
  pol.cmd::text,
  COALESCE(pol.qual::text, ''),
  COALESCE(pol.with_check::text, '')
FROM pg_policies pol
WHERE pol.schemaname = 'public'
ORDER BY pol.schemaname, pol.tablename, pol.policyname
`,
    },

    supabase_triggers: {
        columns: [
            "trigger_catalog",
            "trigger_schema",
            "event_object_schema",
            "event_object_table",
            "trigger_name",
            "event_manipulation",
            "action_timing",
            "action_orientation",
            "action_condition",
            "action_order",
            "full_trigger_definition",
        ],
        sql: `
SELECT
  tr.trigger_catalog::text AS trigger_catalog,
  tr.trigger_schema::text AS trigger_schema,
  tr.event_object_schema::text AS event_object_schema,
  tr.event_object_table::text AS event_object_table,
  tr.trigger_name::text AS trigger_name,
  tr.event_manipulation::text AS event_manipulation,
  tr.action_timing::text AS action_timing,
  tr.action_orientation::text AS action_orientation,
  COALESCE(tr.action_condition::text, '') AS action_condition,
  tr.action_order::text AS action_order,
  COALESCE(pg_get_triggerdef(t.oid, true)::text, '') AS full_trigger_definition
FROM information_schema.triggers tr
JOIN pg_namespace n ON n.nspname = tr.event_object_schema
JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = tr.event_object_table AND c.relkind IN ('r', 'p', 'v', 'm')
JOIN pg_trigger t ON t.tgrelid = c.oid AND t.tgname = tr.trigger_name AND NOT t.tgisinternal
WHERE tr.trigger_schema = 'public'
ORDER BY tr.event_object_schema, tr.event_object_table, tr.trigger_name, tr.event_manipulation, tr.action_timing
`,
    },

    supabase_functions: {
    columns: [
        "routine_schema",
        "routine_name",
        "routine_kind",
        "language",
        "volatility",
        "security_definer",
        "identity_args",
        "result_data_type",
        "definition",
    ],
    sql: `
SELECT
  n.nspname::text AS routine_schema,
  p.proname::text AS routine_name,
  CASE p.prokind
    WHEN 'f' THEN 'function'
    WHEN 'p' THEN 'procedure'
    WHEN 'a' THEN 'aggregate'
    WHEN 'w' THEN 'window'
    ELSE p.prokind::text
  END AS routine_kind,
  l.lanname::text AS language,
  CASE p.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' WHEN 'v' THEN 'VOLATILE' ELSE p.provolatile::text END AS volatility,
  p.prosecdef::text AS security_definer,
  pg_get_function_identity_arguments(p.oid)::text AS identity_args,
  pg_catalog.format_type(p.prorettype, NULL)::text AS result_data_type,
  CASE
    WHEN p.prokind IN ('f', 'p') THEN pg_get_functiondef(p.oid)::text
    ELSE ''
  END AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
ORDER BY routine_schema, routine_name, identity_args
`,
    },

    supabase_tables: {
    columns: [
        "table_schema",
        "table_name",
        "table_kind",
        "rls_enabled",
        "rls_forced",
        "has_row_level_security_policy",
    ],
    sql: `
SELECT
  n.nspname::text AS table_schema,
  c.relname::text AS table_name,
  CASE c.relkind
    WHEN 'r' THEN 'BASE TABLE'
    WHEN 'p' THEN 'PARTITIONED TABLE'
    WHEN 'm' THEN 'MATERIALIZED VIEW'
    ELSE c.relkind::text
  END AS table_kind,
  c.relrowsecurity::text AS rls_enabled,
  c.relforcerowsecurity::text AS rls_forced,
  EXISTS (
    SELECT 1 FROM pg_policies pol
    WHERE pol.schemaname = n.nspname AND pol.tablename = c.relname
  )::text AS has_row_level_security_policy
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'm')
ORDER BY table_schema, table_name
`,
    },

    supabase_views: {
    columns: ["table_schema", "table_name", "view_definition"],
    sql: `
SELECT
  n.nspname::text AS table_schema,
  c.relname::text AS table_name,
  pg_get_viewdef(c.oid, true)::text AS view_definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
ORDER BY table_schema, table_name
`,
    },
};

const TABLES_WITHOUT_RLS_SQL = `
SELECT c.relname::text AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND NOT c.relrowsecurity
ORDER BY c.relname
`;

async function main() {
    if (!DATABASE_URL) {
        console.error(
            "Missing connection string. Set DATABASE_URL (or SUPABASE_DB_URL / POSTGRES_URL) to your Supabase Postgres URI."
        );
        process.exit(1);
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });

    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();

    const updated = [];
    const risks = [];
    let noRls = [];

    try {
        for (const baseName of Object.keys(QUERIES).sort()) {
            const { columns, sql } = QUERIES[baseName];
            const fileName = `${baseName}.csv`;
            const res = await client.query(sql);
            const rows = res.rows.map((row) => {
                const out = {};
                for (const col of columns) {
                    let v = row[col];
                    if (v !== null && v !== undefined && typeof v === "object" && !(v instanceof Date)) {
                        v = JSON.stringify(v);
                    }
                    out[col] = v;
                }
                return out;
            });
            writeCsv(fileName, columns, rows);
            updated.push(fileName);
        }

        const noRlsRes = await client.query(TABLES_WITHOUT_RLS_SQL);
        noRls = noRlsRes.rows;
        if (noRls.length > 0) {
            risks.push(
                `${noRls.length} public base/partitioned table(s) have RLS disabled (relrowsecurity = false): ${noRls
                    .map((r) => r.table_name)
                    .join(", ")}`
            );
        }

        // Obvious schema hygiene signals
        const { rows: matViewsNoData } = await client.query(`
          SELECT c.relname::text AS name
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'm' AND NOT c.relispopulated
          ORDER BY 1
        `);
        if (matViewsNoData.length > 0) {
            risks.push(
                `Unpopulated materialized views: ${matViewsNoData.map((r) => r.name).join(", ")}`
            );
        }

        const { rows: secDefiners } = await client.query(`
          SELECT p.proname::text AS name, pg_get_function_identity_arguments(p.oid)::text AS args
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.prosecdef
          ORDER BY 1, 2
        `);
        if (secDefiners.length > 0) {
            risks.push(
                `${secDefiners.length} SECURITY DEFINER routine(s) in public — review privileges: e.g. ${secDefiners
                    .slice(0, 5)
                    .map((r) => `${r.name}(${r.args})`)
                    .join("; ")}${secDefiners.length > 5 ? " …" : ""}`
            );
        }

        console.log("Schema reference CSVs written to:", OUT_DIR);
        console.log("Files:", updated.sort().join(", "));
        if (risks.length) {
            console.log("\nNotes / potential risks:");
            for (const r of risks) console.log(`- ${r}`);
        }
        if (noRls.length) {
            console.log("\nTables without RLS enabled:");
            for (const r of noRls) console.log(`- ${r.table_name}`);
        }
    } finally {
        await client.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
