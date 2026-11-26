import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal(path) {
  const raw = readFileSync(path, "utf8");
  const out = {};
  for (const line of raw.split("\n")) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i <= 0) continue;
    const k = l.slice(0, i).trim();
    const v = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    out[k] = v;
  }
  return out;
}

const ORG_ID = process.env.ORG_ID || "93667019-bd28-49b5-a688-acc9bb1e0a19";

const DO_NOT_TOUCH = new Set([
  "field_definitions",
  "field_values",
  "option_sets",
  "option_set_items",
  "status_definitions",
  "record_layouts",
  "record_drawer_layouts",
  "record_actions",
]);

// Safe FK-ish order (child → parent). Only org-scoped deletes.
// process_instances + operational_tasks must go before opportunities: dashboard
// Family Leads / Pipeline Children metrics read enrollment process_instances, while
// Work View Today's Work counts opportunities — leaving orphans makes those diverge.
const DELETE_ORDER = [
  "operational_tasks",
  "process_instances",
  "opportunity_customer_members",
  "customer_members",
  "customer_persons",
  "person_relationships",
  "jobs",
  "schedules",
  "payments",
  // "charges", // not present in all schemas; handled via optional list below
  "opportunities",
  "persons",
  "customers",
];

// Optional extra tables that may or may not exist in a given branch/schema.
const OPTIONAL_TABLES = ["charges"];

function sqlPreview(table) {
  return `DELETE FROM public.${table} WHERE org_id = '${ORG_ID}'::uuid;`;
}

async function countRows(sb, table) {
  const res = await sb.from(table).select("*", { count: "exact", head: true }).eq("org_id", ORG_ID);
  return res;
}

async function deleteRows(sb, table) {
  const res = await sb.from(table).delete().eq("org_id", ORG_ID);
  return res;
}

async function main() {
  for (const t of DELETE_ORDER) {
    if (DO_NOT_TOUCH.has(t)) throw new Error(`Refusing to operate on protected table: ${t}`);
  }

  const env = loadEnvLocal(".env.local");
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const results = {
    org_id: ORG_ID,
    sql_used: [...DELETE_ORDER, ...OPTIONAL_TABLES].map(sqlPreview),
    deleted: {},
    skipped: {},
  };

  const allTables = [...DELETE_ORDER, ...OPTIONAL_TABLES];

  for (const table of allTables) {
    if (DO_NOT_TOUCH.has(table)) {
      results.skipped[table] = { reason: "protected_do_not_touch" };
      continue;
    }
    const before = await countRows(sb, table);
    if (before.error) {
      // Missing table or permission issue.
      results.skipped[table] = { error: before.error.message, code: before.error.code ?? null };
      continue;
    }
    const beforeCount = before.count ?? 0;

    const del = await deleteRows(sb, table);
    if (del.error) {
      results.skipped[table] = { error: del.error.message, code: del.error.code ?? null, before: beforeCount };
      continue;
    }

    const after = await countRows(sb, table);
    const afterCount = after.error ? null : after.count ?? 0;
    results.deleted[table] = { before: beforeCount, after: afterCount };
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(String(e?.stack ?? e));
  process.exitCode = 1;
});

