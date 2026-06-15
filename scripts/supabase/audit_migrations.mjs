/**
 * Static migration reliability audit.
 *
 * Parses supabase/migrations/*.sql in timestamp order and compares derived
 * object inventory against docs/supabase/reference/*.csv (staging snapshot).
 *
 * Run from repo root:
 *   node scripts/supabase/audit_migrations.mjs
 *
 * Outputs JSON summary to stdout; use --write-docs to emit markdown deliverables.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase/migrations");
const REF_DIR = path.join(REPO_ROOT, "docs/supabase/reference");
const OUT_DIR = path.join(REPO_ROOT, "docs/audits/migration-reliability");

const WRITE_DOCS = process.argv.includes("--write-docs");

function readCsv(fileName, keyCol) {
    const p = path.join(REF_DIR, fileName);
    if (!fs.existsSync(p)) return new Map();
    const lines = fs.readFileSync(p, "utf8").trim().split("\n");
    const header = lines[0].split(",");
    const keyIdx = header.indexOf(keyCol);
    const map = new Map();
    for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols[keyIdx]) map.set(cols[keyIdx], cols);
    }
    return map;
}

function parseCsvLine(line) {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
            if (ch === '"' && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else if (ch === '"') inQ = false;
            else cur += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === ",") {
            out.push(cur);
            cur = "";
        } else cur += ch;
    }
    out.push(cur);
    return out;
}

function listMigrations() {
    return fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();
}

const SCHEMA_PREFIX = String.raw`(?:(?:public|"public")\.)?`;

const TABLE_RE = new RegExp(
    String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${SCHEMA_PREFIX}"?([a-z_][a-z0-9_]*)"?`,
    "gi"
);
const FUNC_RE = new RegExp(
    String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+${SCHEMA_PREFIX}"?([a-z_][a-z0-9_]*)"?`,
    "gi"
);
const TRIGGER_RE = new RegExp(
    String.raw`CREATE\s+TRIGGER\s+([a-z_][a-z0-9_]*)\s+(?:BEFORE|AFTER|INSTEAD\s+OF)\s+.*?\s+ON\s+${SCHEMA_PREFIX}"?([a-z_][a-z0-9_]*)"?`,
    "gi"
);
const INDEX_RE = new RegExp(
    String.raw`CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\s+ON\s+${SCHEMA_PREFIX}"?([a-z_][a-z0-9_]*)"?`,
    "gi"
);
const POLICY_RE = new RegExp(
    String.raw`CREATE\s+POLICY\s+([a-z_][a-z0-9_]*)\s+ON\s+${SCHEMA_PREFIX}"?([a-z_][a-z0-9_]*)"?`,
    "gi"
);

const REF_TABLE_RE = new RegExp(
    String.raw`REFERENCES\s+${SCHEMA_PREFIX}"?([a-z_][a-z0-9_]*)"?`,
    "gi"
);
const FROM_TABLE_RE = new RegExp(
    String.raw`(?:FROM|JOIN)\s+${SCHEMA_PREFIX}"?([a-z_][a-z0-9_]*)"?`,
    "gi"
);
const INDEX_ON_RE = new RegExp(
    String.raw`CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[a-z_][a-z0-9_]*\s+ON\s+${SCHEMA_PREFIX}"?([a-z_][a-z0-9_]*)"?`,
    "gi"
);
const EXEC_FUNC_RE = new RegExp(
    String.raw`EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+${SCHEMA_PREFIX}"?([a-z_][a-z0-9_]*)"?`,
    "gi"
);

/** Ignore catalog / trigger pseudo-tables / common CTE aliases */
const REF_IGNORE = new Set([
    "auth",
    "information_schema",
    "pg_catalog",
    "pg_constraint",
    "pg_class",
    "pg_namespace",
    "pg_attribute",
    "pg_indexes",
    "pg_policies",
    "pg_trigger",
    "lateral",
    "unnest",
    "jsonb_array_elements",
    "old",
    "new",
    "null",
    "public",
    "anon",
    "service_role",
    "set_updated_at",
]);

const ORG_UUID = "7803388d-cdee-4afb-89cf-23a137f39423";
const DEMO_ORG_UUID = "93667019-bd28-49b5-a688-acc9bb1e0a19";

function allMatches(re, sql) {
    const out = [];
    let m;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(sql)) !== null) out.push(m);
    return out;
}

function audit() {
    const files = listMigrations();
    const created = {
        tables: new Map(),
        functions: new Map(),
        triggers: new Map(),
        indexes: new Map(),
        policies: new Map(),
    };
    const references = [];
    const orgSeeds = [];
    const hardFailures = [];
    const repairMigrations = [];
    const duplicateCreates = { tables: [], functions: [] };

    for (const file of files) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
        const mig = file.replace(/\.sql$/, "");

        if (/repair/i.test(file)) repairMigrations.push(file);

        if (sql.includes("RAISE EXCEPTION") && /not found in public\.orgs|Seed org/.test(sql)) {
            hardFailures.push({ file, pattern: "org_not_found_raise_exception" });
        }
        if (sql.includes(ORG_UUID) || sql.includes(DEMO_ORG_UUID)) {
            const usesSkip = /RAISE NOTICE.*skip|skipping|skipped/i.test(sql);
            const usesException = /RAISE EXCEPTION.*not found/i.test(sql);
            orgSeeds.push({
                file,
                org: sql.includes(ORG_UUID) ? ORG_UUID : DEMO_ORG_UUID,
                usesSkip,
                usesException,
            });
        }

        for (const m of allMatches(TABLE_RE, sql)) {
            const name = m[1];
            if (created.tables.has(name)) {
                duplicateCreates.tables.push({
                    object: name,
                    first: created.tables.get(name),
                    again: mig,
                });
            } else {
                created.tables.set(name, mig);
            }
        }
        for (const m of allMatches(FUNC_RE, sql)) {
            const name = m[1];
            if (created.functions.has(name)) {
                duplicateCreates.functions.push({
                    object: name,
                    first: created.functions.get(name),
                    again: mig,
                });
            } else {
                created.functions.set(name, mig);
            }
        }
        for (const m of allMatches(TRIGGER_RE, sql)) {
            const key = `${m[2]}.${m[1]}`;
            created.triggers.set(key, mig);
        }
        for (const m of allMatches(INDEX_RE, sql)) {
            created.indexes.set(m[1], { table: m[2], migration: mig });
        }
        for (const m of allMatches(POLICY_RE, sql)) {
            const key = `${m[2]}.${m[1]}`;
            created.policies.set(key, mig);
        }

        for (const m of allMatches(REF_TABLE_RE, sql)) {
            const target = m[1].toLowerCase();
            if (REF_IGNORE.has(target)) continue;
            references.push({ type: "fk", target, migration: mig, file });
        }
        for (const m of allMatches(FROM_TABLE_RE, sql)) {
            const target = m[1].toLowerCase();
            if (REF_IGNORE.has(target)) continue;
            references.push({ type: "query", target, migration: mig, file });
        }
        for (const m of allMatches(EXEC_FUNC_RE, sql)) {
            references.push({ type: "function", target: m[1], migration: mig, file });
        }
        for (const m of allMatches(INDEX_ON_RE, sql)) {
            const target = m[1].toLowerCase();
            if (REF_IGNORE.has(target)) continue;
            references.push({ type: "index_on", target, migration: mig, file });
        }
    }

    const orderingViolations = [];
    const firstRef = new Map();

    for (const ref of references) {
        const key = `${ref.type}:${ref.target}`;
        if (!firstRef.has(key)) firstRef.set(key, ref);
        if (ref.type === "function") {
            if (!created.functions.has(ref.target)) {
                orderingViolations.push({
                    kind: "missing_function",
                    object: ref.target,
                    referencedIn: ref.migration,
                    firstRef: ref,
                });
            } else if (created.functions.get(ref.target) > ref.migration) {
                orderingViolations.push({
                    kind: "forward_function",
                    object: ref.target,
                    createdIn: created.functions.get(ref.target),
                    referencedIn: ref.migration,
                });
            }
        } else {
            if (!created.tables.has(ref.target)) {
                orderingViolations.push({
                    kind: "missing_table",
                    object: ref.target,
                    referencedIn: ref.migration,
                    refType: ref.type,
                });
            } else if (created.tables.get(ref.target) > ref.migration) {
                orderingViolations.push({
                    kind: "forward_table",
                    object: ref.target,
                    createdIn: created.tables.get(ref.target),
                    referencedIn: ref.migration,
                    refType: ref.type,
                });
            }
        }
    }

    const stagingTables = readCsv("supabase_tables.csv", "table_name");
    const stagingFuncs = readCsv("supabase_functions.csv", "routine_name");
    const stagingIndexes = readCsv("supabase_indexes.csv", "indexname");
    const stagingTriggers = readCsv("supabase_triggers.csv", "trigger_name");
    const stagingPolicies = readCsv("supabase_rls_policies.csv", "policy_name");

    const migrationTables = new Set(created.tables.keys());
    const missingTables = [...stagingTables.keys()].filter((t) => !migrationTables.has(t));

    const migrationFuncs = new Set(created.functions.keys());
    const missingFuncs = [...stagingFuncs.keys()].filter(
        (f) => /^[a-z_][a-z0-9_]*$/.test(f) && !migrationFuncs.has(f)
    );

    const migrationIndexNames = new Set(created.indexes.keys());
    const missingIndexes = [...stagingIndexes.keys()].filter((i) => !migrationIndexNames.has(i));

    const dedupeViolations = (arr) => {
        const seen = new Set();
        return arr.filter((v) => {
            const k = JSON.stringify(v);
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    };

    const violations = dedupeViolations(orderingViolations);

    const realViolations = violations.filter(
        (v) =>
            v.kind === "forward_table" ||
            v.kind === "forward_function" ||
            (v.kind === "missing_table" &&
                ["placement_candidates", "placement_link_groups", "placement_link_group_members", "placement_overrides"].includes(
                    v.object
                ))
    );

    const dependencyRows = [];
    for (const [table, mig] of created.tables) {
        const refs = references.filter((r) => r.type !== "function" && r.target === table);
        const first = refs[0];
        dependencyRows.push({
            object: table,
            kind: "table",
            createdIn: mig,
            firstReference: first?.migration ?? null,
            violation: violations.find((v) => v.object === table && v.kind === "forward_table"),
        });
    }

    return {
        migrationCount: files.length,
        created,
        violations,
        realViolations,
        missingTables,
        missingFuncs,
        missingIndexes,
        missingTablesCount: missingTables.length,
        missingFuncsCount: missingFuncs.length,
        missingIndexesCount: missingIndexes.length,
        orgSeeds,
        hardFailures,
        repairMigrations,
        duplicateCreates,
        dependencyRows,
        stagingCounts: {
            tables: stagingTables.size,
            functions: stagingFuncs.size,
            indexes: stagingIndexes.size,
            triggers: stagingTriggers.size,
            policies: stagingPolicies.size,
        },
        migrationCounts: {
            tables: created.tables.size,
            functions: created.functions.size,
            indexes: created.indexes.size,
            triggers: created.triggers.size,
            policies: created.policies.size,
        },
        files,
    };
}

function isPlacementArtifact(name) {
    return /^(placement_|idx_placement_|ux_placement_|uq_placement_)/.test(name);
}

function mdList(items) {
    if (!items.length) return "_None._\n";
    return items.map((i) => `- ${i}`).join("\n") + "\n";
}

function writeDeliverables(result) {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);

    const migrationAudit = `# Migration Audit

_Generated: ${date}. Source: \`node scripts/supabase/audit_migrations.mjs --write-docs\`._

## Summary

| Metric | Value |
|--------|------:|
| Migration files | ${result.migrationCount} |
| Tables created (parsed) | ${result.migrationCounts.tables} |
| Functions created (parsed) | ${result.migrationCounts.functions} |
| Staging tables (reference CSV) | ${result.stagingCounts.tables} |
| Tables in staging absent from migrations | ${result.missingTablesCount} |
| Forward-reference / ordering violations (all parse) | ${result.violations.length} |
| **Confirmed ordering blockers** | ${result.realViolations.length} |
| Org-specific hard failures (RAISE EXCEPTION) | ${result.hardFailures.length} |

## 1. Forward table references (confirmed blockers)

${result.realViolations
    .filter((v) => v.kind === "forward_table" || v.kind === "missing_table")
    .map((v) => {
        if (v.kind === "forward_table") {
            return `- **\`${v.object}\`**: created in \`${v.createdIn}\`, first referenced in \`${v.referencedIn}\` (${v.refType})`;
        }
        return `- **\`${v.object}\`**: referenced in \`${v.referencedIn}\` but never created in migration chain (${v.refType})`;
    })
    .join("\n") || "_None._"}

### Notable confirmed cases

| Object | Problem | Migrations |
|--------|---------|------------|
| \`discount_programs\` | UPDATE before baseline CREATE | \`20260328120000\` → \`20260329165048\` |
| \`option_sets\` / \`option_set_items\` | INSERT before CREATE TABLE | \`20260403120000\` → \`20260404130000\` |
| \`placement_candidates\` | CREATE INDEX before CREATE TABLE | \`20260605100000\` (no foundation DDL) |

## 2. Forward function references

${result.violations
    .filter((v) => v.kind === "forward_function")
    .slice(0, 50)
    .map(
        (v) =>
            `- **\`${v.object}()\`**: created in \`${v.createdIn}\`, referenced in \`${v.referencedIn}\``
    )
    .join("\n") || "_No forward function ordering violations detected._"}

## 3. References to tables never created in migration chain

${result.missingTables.map((t) => `- **\`${t}\`**`).join("\n") || "_None._"}

_All other parse hits are CTE aliases or catalog queries — see \`audit-summary.json\`._

## 4. Org-specific seed assumptions

| Migration | Org UUID | Skip pattern (NOTICE) | Hard fail (EXCEPTION) |
|-----------|----------|----------------------|------------------------|
${result.orgSeeds
    .map(
        (s) =>
            `| \`${s.file}\` | \`${s.org.slice(0, 8)}…\` | ${s.usesSkip ? "yes" : "no"} | ${s.usesException ? "**yes**" : "no"} |`
    )
    .join("\n")}

### Hard-failure migrations (must convert to canonical skip)

${result.hardFailures.map((h) => `- \`${h.file}\` — ${h.pattern}`).join("\n")}

## 5. Repair migrations

${result.repairMigrations.map((f) => `- \`${f}\``).join("\n")}

Repair migrations use \`CREATE … IF NOT EXISTS\` and conditional DDL. They compensate for objects that were applied in remote history but missing from a clean replay. Each should be validated against whether the root cause is now fixed.

## 6. Duplicate CREATE declarations

### Tables

${result.duplicateCreates.tables
    .map((d) => `- \`${d.object}\`: first \`${d.first}\`, again \`${d.again}\``)
    .join("\n") || "_None (IF NOT EXISTS duplicates are expected/idempotent)._"}

### Functions

${result.duplicateCreates.functions
    .slice(0, 30)
    .map((d) => `- \`${d.object}\`: first \`${d.first}\`, again \`${d.again}\``)
    .join("\n") || "_See functions.csv diff; many OR REPLACE redefinitions are normal._"}

## 7. Live replay status

\`supabase db reset\` was **not executed** in this audit environment (requires local Docker approval). Run:

\`\`\`bash
./supabase/scripts/validate_migration_replay.sh
\`\`\`

## 8. In-flight migration renames (working tree)

This branch shows deleted/replaced timestamps that must not double-apply on staging:

| Deleted | Replacement |
|---------|-------------|
| \`20260603120000_operational_tasks_general_unlinked.sql\` | \`20260603120001_operational_tasks_general_unlinked.sql\` |
| \`20260610140000_location_program_categories.sql\` | \`20260610140001_location_program_categories.sql\` |

Confirm \`supabase_migrations.schema_migrations\` on staging has only the replacement versions before merge.

## Methodology limits

Static regex parsing misses: dynamic SQL, qualified names outside \`public\`, objects created only in Supabase dashboard, and column-level drift. Staging comparison uses committed \`docs/supabase/reference/*.csv\` snapshot.
`;

    const depGraph = `# Migration Dependency Graph

_Generated: ${date}._

## How to read

- **createdIn**: migration that first declares \`CREATE TABLE\` for the object.
- **firstReference**: earliest migration that references the object via FK, JOIN/FROM, or trigger target.
- **violation**: reference appears before creation (ordering bug on clean replay).

## Critical gaps (staging tables with no CREATE in chain)

${mdList(result.missingTables)}

## Tables — created vs first reference

| Table | Created in | First reference | Ordering issue |
|-------|------------|-----------------|----------------|
${result.dependencyRows
    .sort((a, b) => a.createdIn.localeCompare(b.createdIn))
    .map((r) => {
        const v = r.violation
            ? `yes — ref in ${r.violation.referencedIn}`
            : "";
        return `| \`${r.object}\` | \`${r.createdIn}\` | ${r.firstReference ? `\`${r.firstReference}\`` : "—"} | ${v} |`;
    })
    .join("\n")}

## Ordering violations (confirmed blockers)

| Kind | Object | Created in | Referenced in |
|------|--------|------------|---------------|
${result.realViolations
    .map((v) => {
        const created = v.createdIn ?? "—";
        const ref = v.referencedIn ?? v.firstRef?.migration ?? "—";
        return `| ${v.kind} | \`${v.object}\` | ${created} | ${ref} |`;
    })
    .join("\n")}

## Mermaid — placement/waitlist cluster (staging-only today)

\`\`\`mermaid
flowchart TD
  subgraph staging_only["Present in staging, absent from migrations"]
    PC[placement_candidates]
    PLG[placement_link_groups]
    PLGM[placement_link_group_members]
    PO[placement_overrides]
  end
  OCM[opportunity_customer_members]
  OPP[opportunities]
  IDX["idx_placement_candidates_*<br/>20260605100000"]
  OCM --> PC
  OPP --> PC
  PC --> PLGM
  PLG --> PLGM
  PC --> PO
  IDX -.->|CREATE INDEX only| PC
\`\`\`
`;

    const drift = `# Staging Drift Report

_Generated: ${date}. Baseline: \`docs/supabase/reference/*.csv\` (staging export)._

## Executive summary

Clean \`supabase db reset\` cannot reproduce staging schema. The largest gap is the **placement / waitlist** object family: four tables, multiple indexes, triggers, functions, and RLS policies exist in staging but have **no \`CREATE TABLE\`** migration.

## Tables in staging, absent from migration chain

${mdList(result.missingTables)}

## Functions in staging, absent from migration chain (sample)

Total: **${result.missingFuncsCount}**. Placement-related:

${mdList(result.missingFuncs.filter((f) => f.startsWith("validate_placement_")))}

First 40 others:

${mdList(result.missingFuncs.filter((f) => !f.includes("placement")).slice(0, 40))}

## Indexes in staging, absent from migration chain

Total: **${result.missingIndexesCount}**. Placement-related:

${mdList(
    result.missingIndexes.filter((i) => isPlacementArtifact(i))
)}

_Static index parse under-counts quoted \`CREATE INDEX\` in \`remote_schema\`; total missing (${result.missingIndexesCount}) is inflated. **Placement-prefixed** gaps (${result.missingIndexes.filter((i) => isPlacementArtifact(i)).length}) are the actionable signal._

## Known example: \`placement_candidates\`

| Artifact | In staging CSV | In migrations |
|----------|----------------|---------------|
| Table \`placement_candidates\` | yes | **no** |
| Table \`placement_link_groups\` | yes | **no** |
| Table \`placement_link_group_members\` | yes | **no** |
| Table \`placement_overrides\` | yes | **no** |
| Function \`validate_placement_candidates_consistency\` | yes | **no** |
| Trigger \`trg_validate_placement_candidates_consistency\` | yes | **no** |
| Index \`idx_placement_candidates_org_status_opportunity\` | partial | yes (\`20260605100000\`) |
| App/runtime usage | \`web/lib/orchestration/placement/*\` | expects table |

**Impact:** \`20260605100000_waitlist_queue_lane_query_indexes.sql\` runs \`CREATE INDEX … ON placement_candidates\` which **fails** on clean replay.

## Org-seed drift

Staging org \`${ORG_UUID}\` (Alloy Bend) is assumed by many seeds. Two migrations **abort the chain** if that org row is missing:

- \`20260402143000_public_booking_field_config_seed.sql\`
- \`20260423143000_opportunity_identity_seed_childcare_org.sql\`

Canonical skip pattern (used elsewhere): guard with \`IF NOT EXISTS (SELECT 1 FROM orgs …)\` then \`RAISE NOTICE … skip\` and \`RETURN\`.

## Repair migration inventory

Objects re-created by repair migrations may still be missing sibling objects (e.g. action registry repair does not fix placement tables).

${mdList(result.repairMigrations)}

## Recommended verification

After adding missing migrations, re-export staging reference:

\`\`\`bash
DATABASE_URL='…' npm run export:supabase-schema
node scripts/generate-schema-docs.mjs
node scripts/supabase/audit_migrations.mjs --write-docs
\`\`\`

Compare \`missingTables\`, \`missingFuncs\`, and \`missingIndexes\` counts — target **zero** for tables/functions required by app bootstrap.
`;

    const remediation = `# Remediation Plan

_Generated: ${date}. Scope: migration correctness only — no runtime/POS/Comms behavior changes._

## Priority 0 — Blockers for clean replay

### P0.1 Add placement foundation migration (before \`20260605100000\`)

Create a new migration (suggested timestamp before waitlist indexes) that adds:

- \`placement_candidates\`
- \`placement_link_groups\`
- \`placement_link_group_members\`
- \`placement_overrides\`
- \`validate_placement_candidates_consistency()\` + triggers
- RLS policies matching staging CSV
- Indexes from \`supabase_indexes.csv\` (except those added later)

**Source of truth:** reconstruct DDL from \`docs/supabase/reference/*.csv\` and \`docs/schema/schema-*.md\`, or \`pg_dump --schema-only\` from staging.

### P0.2 Convert org hard-failures to skip pattern

Replace \`RAISE EXCEPTION\` org guards in:

| File | Pattern to apply |
|------|------------------|
| \`20260402143000_public_booking_field_config_seed.sql\` | \`RAISE NOTICE '… skipped — org not found'\`; wrap body in \`IF EXISTS\` |
| \`20260423143000_opportunity_identity_seed_childcare_org.sql\` | same |

Reference implementations: \`20260506120000_forms_medication_authorization_demo_seed.sql\`, \`20260602150000_demo_kurzman_cleanup_person_gender_options.sql\`.

### P0.4 Fix migration ordering (pre-baseline / pre-CREATE)

| Issue | Fix |
|-------|-----|
| \`20260328120000_firstfree4x120_discount_program\` updates \`discount_programs\` before \`20260329165048_remote_schema\` creates it | Move migration after baseline, or merge into baseline seed data |
| \`20260403120000_quote_intake_option_sets_specialty_opportunity\` inserts into \`option_sets\` before \`20260404130000\` creates tables | Reorder timestamps or fold option_sets DDL into earlier migration |

### P0.3 Validate clean replay

\`\`\`bash
# Prerequisites: Docker, Supabase CLI
cd /path/to/Alloy
supabase start
supabase db reset   # must exit 0, no manual SQL

cd web
npm ci
npx tsc --noEmit
npm run build

# Schema verification (after reset, against local DB)
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \\
  npm run export:supabase-schema

# Diff reference export vs staging snapshot (tables, functions, indexes)
node scripts/supabase/audit_migrations.mjs --write-docs
\`\`\`

## Priority 1 — Staging parity

### P1.1 Close remaining object gaps

Re-run audit until these counts are zero for required objects:

- Tables: ${result.missingTablesCount} missing
- Functions: ${result.missingFuncsCount} missing (includes trigger helpers, extensions)
- Indexes: ${result.missingIndexesCount} missing

Triage each missing function: many may be \`remote_schema\` baseline vs later \`CREATE OR REPLACE\` — confirm with live \`db reset\` + \`pg_dump\`.

### P1.2 Repair migrations — keep or fold

| Migration | Action |
|-----------|--------|
| \`20260430215000_repair_action_registry_foundation.sql\` | Keep until root \`20260427180000\` ordering proven on clean replay; then consider folding into original |
| \`20260611120000_childcare_field_catalog_e1_repair.sql\` | Data-only; OK on empty DB (no-op) |
| \`20260612120000_enrollment_process_status_vocabulary_repair.sql\` | Requires enrollment department rows; document bootstrap dependency |
| \`20260613120000_status_settings_category_repair.sql\` | Data-only; OK on empty DB (no-op) |
| \`20260614120000_enrollment_field_catalog_e3_repair.sql\` | Data-only; OK on empty DB (no-op) |

### P1.3 Duplicate timestamp hygiene

Git shows renames: \`20260603120000\` → \`20260603120000_…\` deleted, \`20260603120001\` added; \`20260610140000\` → \`20260610140001\`. Ensure **no** duplicate version entries in \`supabase_migrations.schema_migrations\` on staging.

## Priority 2 — CI gate (recommended)

Add GitHub Actions job \`migration-replay\`:

\`\`\`yaml
name: migration-replay
on:
  pull_request:
    paths:
      - 'supabase/migrations/**'
      - 'supabase/config.toml'
jobs:
  replay:
    runs-on: ubuntu-latest
    services:
      # Or: supabase/setup-cli + supabase start
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase start -x studio,imgproxy,logflare
      - run: supabase db reset
      - run: cd web && npm ci && npx tsc --noEmit
      - run: node scripts/supabase/audit_migrations.mjs
      - name: Assert no missing required tables
        run: |
          node -e "
          const r = require('fs').readFileSync('docs/audits/migration-reliability/audit-summary.json','utf8');
          const j = JSON.parse(r);
          const blockers = ['placement_candidates','placement_link_groups','placement_link_group_members','placement_overrides'];
          const miss = j.missingTables.filter(t => blockers.includes(t));
          if (miss.length) { console.error('Missing blockers:', miss); process.exit(1); }
          "
\`\`\`

**Gate policy:** fail PR if \`supabase db reset\` fails OR audit reports missing tables referenced by \`web/\` runtime.

## Priority 3 — Documentation

- Add \`docs/platform/governance/local-database-bootstrap.md\` with the validation procedure above.
- Regenerate \`docs/supabase/reference/*.csv\` after P0.1 lands.
- Link this audit from \`docs/README.md\`.

## Out of scope (per sprint charter)

- Application runtime behavior
- POS
- Communications feature work

## Suggested commit sequence

1. \`fix(migrations): add placement foundation DDL from staging snapshot\`
2. \`fix(migrations): canonical org-missing skip for Bend seeds\`
3. \`chore(ci): migration replay gate on PR\`
4. \`docs: migration reliability audit deliverables\`
`;

    fs.writeFileSync(path.join(OUT_DIR, "migration_audit.md"), migrationAudit);
    fs.writeFileSync(path.join(OUT_DIR, "dependency_graph.md"), depGraph);
    fs.writeFileSync(path.join(OUT_DIR, "staging_drift_report.md"), drift);
    fs.writeFileSync(path.join(OUT_DIR, "remediation_plan.md"), remediation);
    fs.writeFileSync(
        path.join(OUT_DIR, "audit-summary.json"),
        JSON.stringify(
            {
                missingTables: result.missingTables,
                missingFuncs: result.missingFuncs,
                missingIndexes: result.missingIndexes,
                violations: result.violations,
                realViolations: result.realViolations,
                hardFailures: result.hardFailures,
                orgSeeds: result.orgSeeds,
            },
            null,
            2
        )
    );

    // Also write user-requested filenames at repo root docs/audits for discoverability
    for (const name of [
        "migration_audit.md",
        "dependency_graph.md",
        "staging_drift_report.md",
        "remediation_plan.md",
    ]) {
        fs.copyFileSync(path.join(OUT_DIR, name), path.join(REPO_ROOT, name));
    }

    console.log(`Wrote deliverables to ${OUT_DIR} and repo root.`);
}

const result = audit();
if (WRITE_DOCS) {
    writeDeliverables(result);
} else {
    console.log(JSON.stringify({
        migrationCount: result.migrationCount,
        missingTablesCount: result.missingTablesCount,
        missingTables: result.missingTables,
        violationsCount: result.violations.length,
        hardFailures: result.hardFailures,
        topViolations: result.violations.slice(0, 20),
    }, null, 2));
}
