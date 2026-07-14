#!/usr/bin/env node
/**
 * Generate docs/schema/*.md from docs/supabase/reference/*.csv
 * Run: node scripts/generate-schema-docs.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const REF = path.join(ROOT, "docs/supabase/reference");
const OUT = path.join(ROOT, "docs/schema");

function parseCsv(text) {
  const rows = [];
  const headers = [];
  let cur = "";
  let inQuotes = false;
  let row = [];
  const pushCell = () => {
    row.push(cur);
    cur = "";
  };
  const pushRow = () => {
    if (headers.length === 0) {
      headers.push(...row);
    } else if (row.length) {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] ?? "";
      });
      rows.push(obj);
    }
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      pushCell();
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      pushCell();
      pushRow();
    } else {
      cur += c;
    }
  }
  if (cur.length || row.length) {
    pushCell();
    pushRow();
  }
  return rows;
}

function readCsv(name) {
  return parseCsv(fs.readFileSync(path.join(REF, name), "utf8"));
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function write(name, body) {
  fs.writeFileSync(path.join(OUT, name), body, "utf8");
  console.log("wrote", name);
}

const generatedAt = new Date().toISOString().slice(0, 10);

ensureDir(OUT);

const tables = readCsv("supabase_tables.csv");
const columns = readCsv("supabase_schema_columns.csv");
const constraints = readCsv("supabase_constraints.csv");
const indexes = readCsv("supabase_indexes.csv");
const functions = readCsv("supabase_functions.csv");
const triggers = readCsv("supabase_triggers.csv");
const policies = readCsv("supabase_rls_policies.csv");
const views = readCsv("supabase_views.csv");

const baseTables = tables.filter((t) => t.table_kind === "BASE TABLE");
const viewRows = views.filter((v) => v.table_name);

// --- schema-tables.md ---
const tablesByName = baseTables
  .slice()
  .sort((a, b) => a.table_name.localeCompare(b.table_name));

let tablesMd = `# Schema — tables and views

**Status:** Generated reference (staging export). **Do not edit by hand.**

**Regenerate:** \`npm run export:supabase-schema\` then \`node scripts/generate-schema-docs.mjs\`

**Generated:** ${generatedAt}

## Summary

| Kind | Count |
|------|------:|
| Base tables (\`public\`) | ${baseTables.length} |
| Views (\`public\`) | ${viewRows.length} |
| Tables with RLS enabled | ${baseTables.filter((t) => t.rls_enabled === "true").length} |

## Base tables

| Table | RLS | Forced RLS | Policies |
|-------|-----|------------|----------|
`;
for (const t of tablesByName) {
  const polCount = policies.filter((p) => p.tablename === t.table_name).length;
  tablesMd += `| \`${t.table_name}\` | ${t.rls_enabled} | ${t.rls_forced} | ${polCount} |\n`;
}

tablesMd += `\n## Views\n\n| View | Definition (truncated) |\n|------|------------------------|\n`;
for (const v of viewRows.sort((a, b) => a.table_name.localeCompare(b.table_name))) {
  const def = (v.view_definition || "").replace(/\s+/g, " ").slice(0, 120);
  tablesMd += `| \`${v.table_name}\` | ${def}${def.length >= 120 ? "…" : ""} |\n`;
}

tablesMd += `\n## Domain groupings (conceptual)\n\nThese groupings are documentation-only — not separate schemas.\n\n`;
const domains = {
  "Identity & access": ["persons", "customer_persons", "contacts", "customers", "user_roles", "user_profiles", "role_definitions", "role_permission_grants", "user_access_profiles", "user_department_access", "user_site_access"],
  "Business processes & workspace": ["lifecycles", "work_units", "departments", "locations", "orgs", "org_settings"],
  "CRM & enrollment": ["opportunities", "opportunity_customer_members", "tour_bookings"],
  "Events & workflows": ["workflow_events", "workflows", "workflow_runs", "action_definitions", "action_links", "action_placements"],
  "Communications": ["communication_threads", "communication_messages", "communication_provider_bindings", "communication_message_reads", "communication_scheduled_sends", "messages", "messages_outbox"],
  "Forms & documents": ["form_definitions", "form_versions", "form_submissions", "packet_sessions"],
  "Scheduling & jobs": ["jobs", "schedules", "schedule_instances"],
};
for (const [domain, names] of Object.entries(domains)) {
  const present = names.filter((n) => baseTables.some((t) => t.table_name === n));
  if (present.length) tablesMd += `- **${domain}:** ${present.map((n) => `\`${n}\``).join(", ")}\n`;
}

tablesMd += `\n## Related docs\n\n- Column detail: \`schema-columns.md\`\n- Constraints: \`schema-constraints.md\`\n- Indexes: \`schema-indexes.md\`\n- RLS: \`schema-policies-and-security.md\`\n- Entity model (conceptual): \`../platform/core/entity-model.md\`\n`;

write("schema-tables.md", tablesMd);

// --- schema-columns.md ---
const colsByTable = {};
for (const c of columns) {
  if (c.table_schema !== "public") continue;
  if (!colsByTable[c.table_name]) colsByTable[c.table_name] = [];
  colsByTable[c.table_name].push(c);
}
let colsMd = `# Schema — columns

**Status:** Generated reference. **Do not edit by hand.**

**Generated:** ${generatedAt} · **Column count:** ${columns.filter((c) => c.table_schema === "public").length}

Columns for \`public\` schema tables, grouped alphabetically by table.

`;
for (const tableName of Object.keys(colsByTable).sort()) {
  colsMd += `## \`${tableName}\`\n\n| Column | Type | Nullable | Default |\n|--------|------|----------|--------|\n`;
  for (const c of colsByTable[tableName].sort((a, b) => Number(a.ordinal_position) - Number(b.ordinal_position))) {
    const def = (c.column_default || "").replace(/\|/g, "\\|").slice(0, 60);
    colsMd += `| \`${c.column_name}\` | ${c.data_type} | ${c.is_nullable} | ${def || "—"} |\n`;
  }
  colsMd += "\n";
}
write("schema-columns.md", colsMd);

// --- schema-constraints.md ---
let conMd = `# Schema — constraints

**Status:** Generated reference. **Do not edit by hand.**

**Generated:** ${generatedAt} · **Constraint count:** ${constraints.length}

| Table | Name | Type | Definition |
|-------|------|------|------------|
`;
for (const c of constraints.sort((a, b) => `${a.table_name}${a.constraint_name}`.localeCompare(`${b.table_name}${b.constraint_name}`))) {
  const def = (c.constraint_definition || "").replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 100);
  conMd += `| \`${c.table_name}\` | \`${c.constraint_name}\` | ${c.constraint_type} | ${def || "—"} |\n`;
}
write("schema-constraints.md", conMd);

// --- schema-indexes.md ---
let idxMd = `# Schema — indexes

**Status:** Generated reference. **Do not edit by hand.**

**Generated:** ${generatedAt} · **Index count:** ${indexes.length}

| Table | Index | Unique | Definition |
|-------|-------|--------|------------|
`;
for (const i of indexes.sort((a, b) => `${a.tablename}${a.indexname}`.localeCompare(`${b.tablename}${b.indexname}`))) {
  const def = (i.indexdef || "").replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 120);
  idxMd += `| \`${i.tablename}\` | \`${i.indexname}\` | ${i.is_unique || "—"} | ${def} |\n`;
}
write("schema-indexes.md", idxMd);

// --- schema-functions.md ---
let fnMd = `# Schema — functions

**Status:** Generated reference. **Do not edit by hand.**

**Generated:** ${generatedAt} · **Function count:** ${functions.length}

| Schema | Function | Return type | Security |
|--------|----------|-------------|----------|
`;
for (const f of functions.sort((a, b) => `${a.routine_name}`.localeCompare(b.routine_name))) {
  fnMd += `| \`${f.routine_schema || "public"}\` | \`${f.routine_name}\` | ${f.result_data_type || "—"} | ${f.security_definer || "—"} |\n`;
}
fnMd += `\n> Full argument lists and bodies: inspect \`docs/supabase/reference/supabase_functions.csv\` or Supabase SQL editor.\n`;
write("schema-functions.md", fnMd);

// --- schema-triggers.md ---
let trMd = `# Schema — triggers

**Status:** Generated reference. **Do not edit by hand.**

**Generated:** ${generatedAt} · **Trigger count:** ${triggers.length}

| Table | Trigger | Event | Function |
|-------|---------|-------|----------|
`;
for (const t of triggers.sort((a, b) => `${a.event_object_table}${a.trigger_name}`.localeCompare(`${b.event_object_table}${b.trigger_name}`))) {
  const trigDef = (t.full_trigger_definition || "").replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 80);
  trMd += `| \`${t.event_object_table}\` | \`${t.trigger_name}\` | ${t.event_manipulation || "—"} ${t.action_timing || ""} | ${trigDef || "—"} |\n`;
}
write("schema-triggers.md", trMd);

// --- schema-policies-and-security.md ---
let polMd = `# Schema — policies and security

**Status:** Generated reference. **Do not edit by hand.**

**Generated:** ${generatedAt} · **RLS policy count:** ${policies.length}

## Posture

- **Org scoping:** Most tenant tables include \`org_id\` or resolve org through FK chains.
- **Service role writes:** Communications V1 canonical tables and several mutation paths require \`service_role\` for INSERT/UPDATE.
- **Deny-by-default:** Tables with RLS enabled and zero policies deny access for subject roles.

## Policies by table

`;
const polByTable = {};
for (const p of policies) {
  if (!polByTable[p.tablename]) polByTable[p.tablename] = [];
  polByTable[p.tablename].push(p);
}
for (const tableName of Object.keys(polByTable).sort()) {
  polMd += `### \`${tableName}\`\n\n| Policy | Command | Roles | USING / WITH CHECK (truncated) |\n|--------|---------|-------|--------------------------------|\n`;
  for (const p of polByTable[tableName]) {
    const using = (p.qual || "").replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 80);
    const check = (p.with_check || "").replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 40);
    polMd += `| \`${p.policyname}\` | ${p.cmd} | ${p.roles || "—"} | ${using || check || "—"} |\n`;
  }
  polMd += "\n";
}
polMd += `\n## Living audit\n\nSee \`docs/audits/supabase-schema-alignment-audit.md\` for risk classification and migration proposals.\n`;
write("schema-policies-and-security.md", polMd);

console.log("Done.");
