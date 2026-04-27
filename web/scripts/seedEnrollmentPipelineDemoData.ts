#!/usr/bin/env npx tsx
/**
 * Dev/staging-safe seed: populate realistic enrollment opportunities for the configured Enrollment pipeline.
 *
 * Idempotency: uses `metadata.seed_key` to avoid duplicates.
 *
 * Target (defaults):
 * - org:       7803388d-cdee-4afb-89cf-23a137f39423
 * - work unit: c2b640e5-e09a-4319-9d1b-d752ebb80122
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const DEFAULT_ORG_ID = "7803388d-cdee-4afb-89cf-23a137f39423";
const DEFAULT_WORK_UNIT_ID = "c2b640e5-e09a-4319-9d1b-d752ebb80122";

type SeedSpec = {
  seed_key: string;
  name: string;
  status_key: "new" | "contacted" | "qualified" | "scheduled" | "booked" | "won" | "lost";
  updated_at_iso: string;
  created_at_iso: string;
  customer_mode: "reuse" | "null";
  contact_mode: "reuse" | "null";
  note: string;
};

function iso(d: Date): string {
  return d.toISOString();
}

function subDays(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function pick<T>(arr: T[], idx: number): T | null {
  if (!arr.length) return null;
  return arr[idx % arr.length] ?? null;
}

async function main() {
  const orgId = (process.env.DEV_QUEUE_ORG_ID?.trim() || DEFAULT_ORG_ID).trim();
  const workUnitId = (process.env.DEV_QUEUE_WORK_UNIT_ID?.trim() || DEFAULT_WORK_UNIT_ID).trim();
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

  const supabaseUrlRaw = process.env.SUPABASE_URL?.trim() || "";
  let supabaseHost = "—";
  try {
    supabaseHost = supabaseUrlRaw ? new URL(supabaseUrlRaw).host : "—";
  } catch {
    supabaseHost = supabaseUrlRaw ? "(invalid SUPABASE_URL)" : "—";
  }

  console.log("--- Enrollment pipeline demo seed (preflight) ---");
  console.log("SUPABASE_URL host:", supabaseHost);
  console.log("org_id target:", orgId);
  console.log("work_unit_id target:", workUnitId);
  console.log("");

  const supabase = createAdminClient();

  // Detect whether opportunities.work_unit_id exists (explicit probe; avoids relying on sample row keys / cached schema).
  const workUnitProbe = await supabase
    .from("opportunities")
    .select("work_unit_id")
    .eq("org_id", orgId)
    .limit(1);
  const hasWorkUnitIdCol = !workUnitProbe.error;
  const workUnitProbeErr =
    workUnitProbe.error != null
      ? { message: workUnitProbe.error.message, code: (workUnitProbe.error as any).code ?? null }
      : null;

  // Inspect opportunity columns via one sample row (best-effort, no raw SQL).
  const { data: sampleOpp } = await supabase
    .from("opportunities")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sampleKeys = sampleOpp && typeof sampleOpp === "object" ? Object.keys(sampleOpp as Record<string, unknown>).sort() : [];

  // Reuse a handful of existing customers when available (keeps seed lightweight).
  const [{ data: custs }] = await Promise.all([
    supabase.from("customers").select("id, name").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20),
  ]);

  const customerIds = (custs ?? []).map((r) => (r as any).id).filter((x): x is string => typeof x === "string");

  // `opportunities.primary_contact_id` is FK-constrained in this DB; the referenced table varies by schema.
  // Best-effort: prefer `contacts` table when present; otherwise reuse existing opportunity primary_contact_id values.
  let contactIds: string[] = [];
  const contactsRes = await supabase
    .from("contacts")
    .select("id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!contactsRes.error) {
    contactIds = (contactsRes.data ?? []).map((r: any) => r.id).filter((x: any): x is string => typeof x === "string");
  } else {
    const { data: oppContacts } = await supabase
      .from("opportunities")
      .select("primary_contact_id")
      .eq("org_id", orgId)
      .not("primary_contact_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);
    contactIds = (oppContacts ?? [])
      .map((r: any) => r.primary_contact_id)
      .filter((x: any): x is string => typeof x === "string" && x.trim() !== "");
    contactIds = [...new Set(contactIds)].slice(0, 20);
  }

  const now = new Date();

  // Build seed specs. Some records intentionally overlap queues and needs-attention predicates.
  const specs: SeedSpec[] = [
    // New & contacted (4)
    { seed_key: "enroll_demo_new_1", name: "Enrollment — Rivera Family", status_key: "new", created_at_iso: iso(subDays(now, 0.2)), updated_at_iso: iso(subDays(now, 0.2)), customer_mode: "reuse", contact_mode: "reuse", note: "New inquiry" },
    { seed_key: "enroll_demo_new_2", name: "Enrollment — Chen Family", status_key: "new", created_at_iso: iso(subDays(now, 0.6)), updated_at_iso: iso(subDays(now, 0.6)), customer_mode: "reuse", contact_mode: "reuse", note: "New inquiry" },
    { seed_key: "enroll_demo_contacted_1", name: "Enrollment — Patel Family", status_key: "contacted", created_at_iso: iso(subDays(now, 1.2)), updated_at_iso: iso(subDays(now, 0.4)), customer_mode: "reuse", contact_mode: "reuse", note: "Contacted" },
    { seed_key: "enroll_demo_contacted_2", name: "Enrollment — Johnson Family", status_key: "contacted", created_at_iso: iso(subDays(now, 2.0)), updated_at_iso: iso(subDays(now, 0.8)), customer_mode: "reuse", contact_mode: "reuse", note: "Contacted" },

    // Tours / qualified (4) mix qualified/scheduled
    { seed_key: "enroll_demo_qualified_1", name: "Enrollment — Garcia Family", status_key: "qualified", created_at_iso: iso(subDays(now, 4.2)), updated_at_iso: iso(subDays(now, 1.0)), customer_mode: "reuse", contact_mode: "reuse", note: "Qualified" },
    { seed_key: "enroll_demo_qualified_stale", name: "Enrollment — O’Neil Family", status_key: "qualified", created_at_iso: iso(subDays(now, 6.0)), updated_at_iso: iso(subDays(now, 2.2)), customer_mode: "reuse", contact_mode: "reuse", note: "Qualified but stale >2d (needs attention: value/readiness)" },
    { seed_key: "enroll_demo_scheduled_1", name: "Enrollment — Kim Family", status_key: "scheduled", created_at_iso: iso(subDays(now, 3.5)), updated_at_iso: iso(subDays(now, 0.3)), customer_mode: "reuse", contact_mode: "reuse", note: "Scheduled" },
    { seed_key: "enroll_demo_scheduled_stale", name: "Enrollment — Nguyen Family", status_key: "scheduled", created_at_iso: iso(subDays(now, 7.0)), updated_at_iso: iso(subDays(now, 2.5)), customer_mode: "reuse", contact_mode: "reuse", note: "Scheduled but stale >2d (needs attention: value/readiness)" },

    // Booked / enrolling (3)
    { seed_key: "enroll_demo_booked_1", name: "Enrollment — Williams Family", status_key: "booked", created_at_iso: iso(subDays(now, 1.5)), updated_at_iso: iso(subDays(now, 0.2)), customer_mode: "reuse", contact_mode: "reuse", note: "Booked" },
    { seed_key: "enroll_demo_booked_2", name: "Enrollment — Brown Family", status_key: "booked", created_at_iso: iso(subDays(now, 2.5)), updated_at_iso: iso(subDays(now, 0.9)), customer_mode: "reuse", contact_mode: "reuse", note: "Booked" },
    { seed_key: "enroll_demo_booked_stale", name: "Enrollment — Davis Family", status_key: "booked", created_at_iso: iso(subDays(now, 8.0)), updated_at_iso: iso(subDays(now, 2.1)), customer_mode: "reuse", contact_mode: "reuse", note: "Booked but stale >2d (needs attention: value/readiness)" },

    // Closed (3)
    { seed_key: "enroll_demo_won_1", name: "Enrollment — Martinez Family", status_key: "won", created_at_iso: iso(subDays(now, 10)), updated_at_iso: iso(subDays(now, 1.1)), customer_mode: "reuse", contact_mode: "reuse", note: "Won" },
    { seed_key: "enroll_demo_lost_1", name: "Enrollment — Thompson Family", status_key: "lost", created_at_iso: iso(subDays(now, 12)), updated_at_iso: iso(subDays(now, 0.7)), customer_mode: "reuse", contact_mode: "reuse", note: "Lost" },
    { seed_key: "enroll_demo_lost_2", name: "Enrollment — Anderson Family", status_key: "lost", created_at_iso: iso(subDays(now, 13)), updated_at_iso: iso(subDays(now, 0.5)), customer_mode: "reuse", contact_mode: "reuse", note: "Lost" },

    // Needs attention boosters (ensure >=5 hit):
    { seed_key: "enroll_demo_stale_3d", name: "Enrollment — Stale Case", status_key: "contacted", created_at_iso: iso(subDays(now, 9)), updated_at_iso: iso(subDays(now, 3.2)), customer_mode: "reuse", contact_mode: "reuse", note: "Stale >3d (needs attention: stale)" },
    { seed_key: "enroll_demo_missing_contact", name: "Enrollment — Missing Contact", status_key: "new", created_at_iso: iso(subDays(now, 0.9)), updated_at_iso: iso(subDays(now, 0.9)), customer_mode: "reuse", contact_mode: "null", note: "Missing primary_contact_id (needs attention: missing data)" },
    { seed_key: "enroll_demo_missing_customer", name: "Enrollment — Missing Customer", status_key: "new", created_at_iso: iso(subDays(now, 0.9)), updated_at_iso: iso(subDays(now, 0.9)), customer_mode: "null", contact_mode: "reuse", note: "Missing customer_id (needs attention: missing data)" },
  ];

  const seedKeys = specs.map((s) => s.seed_key);
  const { data: existing } = await supabase
    .from("opportunities")
    .select("id, status_key, metadata")
    .eq("org_id", orgId)
    .in("metadata->>seed_key", seedKeys as any);

  const existingBySeed = new Map<string, string>();
  for (const row of existing ?? []) {
    const r = row as any;
    const sk = r?.metadata?.seed_key;
    if (typeof sk === "string" && typeof r?.id === "string") existingBySeed.set(sk, r.id);
  }

  let inserted = 0;
  let skipped = 0;
  const insertedIds: Array<{ seed_key: string; id: string; status_key: string; note: string }> = [];

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    if (existingBySeed.has(spec.seed_key)) {
      skipped++;
      continue;
    }

    const customer_id = spec.customer_mode === "reuse" ? pick(customerIds, i) : null;
    const primary_contact_id = spec.contact_mode === "reuse" ? pick(contactIds, i) : null;

    const payload: Record<string, unknown> = {
      org_id: orgId,
      name: spec.name,
      status_key: spec.status_key,
      status: "open", // existing table appears to use `status` string; safe default for demo
      customer_id,
      primary_contact_id,
      created_at: spec.created_at_iso,
      updated_at: spec.updated_at_iso,
      metadata: {
        seed_key: spec.seed_key,
        demo_seed_package: "enrollment_pipeline_demo_v1",
        demo_note: spec.note,
      },
    };
    if (hasWorkUnitIdCol) payload.work_unit_id = workUnitId;

    const { data: created, error } = await supabase.from("opportunities").insert(payload).select("id, status_key").single();
    if (error) throw new Error(`insert ${spec.seed_key}: ${error.message}`);
    inserted++;
    insertedIds.push({ seed_key: spec.seed_key, id: (created as any).id, status_key: (created as any).status_key ?? spec.status_key, note: spec.note });
  }

  // Safe backfill for existing seeded records once opportunities.work_unit_id exists.
  let backfilled = 0;
  if (hasWorkUnitIdCol) {
    const { count: beforeCount } = await supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .like("metadata->>seed_key", "enroll_demo_%")
      .is("work_unit_id", null);

    const { error: backfillErr } = await supabase
      .from("opportunities")
      .update({ work_unit_id: workUnitId, updated_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .like("metadata->>seed_key", "enroll_demo_%");
    if (backfillErr) {
      throw new Error(`backfill work_unit_id failed: ${backfillErr.message}`);
    }

    const { count: afterCount } = await supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .like("metadata->>seed_key", "enroll_demo_%")
      .eq("work_unit_id", workUnitId);

    backfilled = typeof beforeCount === "number" ? beforeCount : 0;
    const confirmed = typeof afterCount === "number" ? afterCount : 0;
    console.log("backfill_work_unit_id_attempted:", backfilled);
    console.log("backfill_work_unit_id_confirmed:", confirmed);
  }

  // Recount seeded rows by status
  const { data: seededRows } = await supabase
    .from("opportunities")
    .select("id, status_key, updated_at, customer_id, primary_contact_id, metadata")
    .eq("org_id", orgId)
    .in("metadata->>seed_key", seedKeys as any);

  const seeded = (seededRows ?? []) as any[];
  const byStatus = new Map<string, number>();
  const needsAttentionExpected: Array<{ id: string; seed_key: string; reason: string }> = [];

  for (const r of seeded) {
    const sk = String(r.status_key ?? "").trim() || "—";
    byStatus.set(sk, (byStatus.get(sk) ?? 0) + 1);

    const seedKey = r?.metadata?.seed_key;
    const updatedAt = r.updated_at ? new Date(r.updated_at) : null;
    const nowMs = now.getTime();
    const stale3d = updatedAt != null && !Number.isNaN(updatedAt.getTime()) && updatedAt.getTime() < subDays(now, 3).getTime();
    const stale2d = updatedAt != null && !Number.isNaN(updatedAt.getTime()) && updatedAt.getTime() < subDays(now, 2).getTime();
    const missing = r.primary_contact_id == null || r.customer_id == null;
    const highValue = ["qualified", "scheduled", "booked"].includes(String(r.status_key ?? "").trim().toLowerCase()) && stale2d;
    if (stale3d || missing || highValue) {
      const reason = stale3d ? "stale_3d" : missing ? "missing_data" : "high_value_stale_2d";
      if (typeof r.id === "string" && typeof seedKey === "string") {
        needsAttentionExpected.push({ id: r.id, seed_key: seedKey, reason });
      }
    }
  }

  const byStatusSorted = [...byStatus.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  console.log("--- Enrollment pipeline demo seed ---");
  console.log("org_id:", orgId);
  console.log("work_unit_id target:", workUnitId);
  console.log("opportunities columns (sample):", sampleKeys.length ? sampleKeys.join(", ") : "— (no sample row)");
  console.log("opportunities scoped by work_unit_id column:", hasWorkUnitIdCol ? "YES (seed sets it)" : "NO (seed cannot set it)");
  if (!hasWorkUnitIdCol && workUnitProbeErr) {
    console.log("work_unit_id_probe_error:", `${workUnitProbeErr.message}${workUnitProbeErr.code ? ` (code ${workUnitProbeErr.code})` : ""}`);
  }
  if (!hasWorkUnitIdCol) {
    console.log("NOTE: Apply migration adding opportunities.work_unit_id, then re-run this script to backfill seeded records.");
    console.log(
      "NOTE: Check that Supabase CLI project and .env.local SUPABASE_URL point to the same project, or refresh PostgREST schema cache."
    );
  }
  console.log("");
  console.log("inserted:", inserted, "skipped(existing):", skipped, "total_seed_keys:", seedKeys.length);
  console.log("seeded counts by status:", byStatusSorted.map(([k, v]) => `${k}:${v}`).join(", "));
  console.log("");
  console.log("needs_attention expected (>=5 target):", needsAttentionExpected.length);
  for (const r of needsAttentionExpected.slice(0, 20)) {
    console.log(`- ${r.seed_key} (${r.id}) — ${r.reason}`);
  }
  if (needsAttentionExpected.length > 20) console.log(`... (${needsAttentionExpected.length - 20} more)`);
  console.log("");
  console.log("Manual URLs:");
  console.log(`- ${baseUrl}/adminV2/workspace/dept/<departmentId>/work-unit/${workUnitId}`);
  console.log(`- ${baseUrl}/api/admin/work-units/${workUnitId}/queues`);
}

main().catch((e) => {
  console.error(String((e as any)?.stack ?? e));
  process.exit(1);
});

