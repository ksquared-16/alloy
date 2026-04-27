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
import { getWorkUnitQueueItems, getWorkUnitQueueSummaries } from "@/lib/queues/QueueService";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const DEFAULT_ORG_ID = "7803388d-cdee-4afb-89cf-23a137f39423";
const DEFAULT_WORK_UNIT_KEY = "enrollment_pipeline";

type SeedSpec = {
  seed_key: string;
  name: string;
  status_key: string;
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
  console.log("");

  const supabase = createAdminClient();

  // Resolve target work unit (do NOT hardcode ids).
  const envWorkUnitId = process.env.DEV_QUEUE_WORK_UNIT_ID?.trim() || "";
  const envWorkUnitKey = (process.env.DEV_QUEUE_WORK_UNIT_KEY?.trim() || DEFAULT_WORK_UNIT_KEY).trim();

  const wuLookup = envWorkUnitId
    ? await supabase
        .from("work_units")
        .select("id, org_id, key, name")
        .eq("id", envWorkUnitId)
        .maybeSingle()
    : await supabase
        .from("work_units")
        .select("id, org_id, key, name")
        .eq("org_id", orgId)
        .eq("key", envWorkUnitKey)
        .maybeSingle();

  if (wuLookup.error) {
    throw new Error(`work_units lookup failed: ${wuLookup.error.message}`);
  }
  const wu = wuLookup.data as { id: string; org_id: string; key?: string | null; name?: string | null } | null;
  if (!wu?.id) {
    throw new Error(
      envWorkUnitId
        ? `Work unit not found: DEV_QUEUE_WORK_UNIT_ID=${envWorkUnitId}`
        : `Work unit not found in org: key=${envWorkUnitKey} org_id=${orgId}`
    );
  }
  if (wu.org_id !== orgId) {
    throw new Error(
      `Work unit org mismatch: work_unit.org_id=${wu.org_id} but DEV_QUEUE_ORG_ID=${orgId}. Refusing to seed.`
    );
  }

  const workUnitId = wu.id;
  const workUnitKey = (wu.key ?? null) as string | null;
  const workUnitName = (wu.name ?? null) as string | null;

  console.log("resolved work unit:");
  console.log("- org_id:", orgId);
  console.log("- work_unit_id:", workUnitId);
  console.log("- work_unit_key:", workUnitKey ?? "—");
  console.log("- work_unit_name:", workUnitName ?? "—");
  console.log("");

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
    { seed_key: "enroll_demo_new_1", name: "Enrollment — Rivera Family", status_key: "new_inquiry", created_at_iso: iso(subDays(now, 0.2)), updated_at_iso: iso(subDays(now, 0.2)), customer_mode: "reuse", contact_mode: "reuse", note: "New inquiry" },
    { seed_key: "enroll_demo_new_2", name: "Enrollment — Chen Family", status_key: "new_inquiry", created_at_iso: iso(subDays(now, 0.6)), updated_at_iso: iso(subDays(now, 0.6)), customer_mode: "reuse", contact_mode: "reuse", note: "New inquiry" },
    { seed_key: "enroll_demo_contacted_1", name: "Enrollment — Patel Family", status_key: "contacted", created_at_iso: iso(subDays(now, 1.2)), updated_at_iso: iso(subDays(now, 0.4)), customer_mode: "reuse", contact_mode: "reuse", note: "Contacted" },
    { seed_key: "enroll_demo_contacted_2", name: "Enrollment — Johnson Family", status_key: "contacted", created_at_iso: iso(subDays(now, 2.0)), updated_at_iso: iso(subDays(now, 0.8)), customer_mode: "reuse", contact_mode: "reuse", note: "Contacted" },

    // Touring + post-tour (4)
    { seed_key: "enroll_demo_tour_scheduled_1", name: "Enrollment — Garcia Family", status_key: "tour_scheduled", created_at_iso: iso(subDays(now, 3.5)), updated_at_iso: iso(subDays(now, 0.3)), customer_mode: "reuse", contact_mode: "reuse", note: "Tour scheduled" },
    { seed_key: "enroll_demo_tour_scheduled_stale", name: "Enrollment — Nguyen Family", status_key: "tour_scheduled", created_at_iso: iso(subDays(now, 7.0)), updated_at_iso: iso(subDays(now, 2.5)), customer_mode: "reuse", contact_mode: "reuse", note: "Tour scheduled but stale >2d (needs attention: value/readiness via legacy predicate if status is qualified/scheduled/booked; otherwise stale3d/missing only)" },
    { seed_key: "enroll_demo_tour_completed_1", name: "Enrollment — Kim Family", status_key: "tour_completed", created_at_iso: iso(subDays(now, 4.2)), updated_at_iso: iso(subDays(now, 1.0)), customer_mode: "reuse", contact_mode: "reuse", note: "Tour completed" },
    { seed_key: "enroll_demo_tour_completed_followup", name: "Enrollment — O’Neil Family", status_key: "tour_completed", created_at_iso: iso(subDays(now, 6.0)), updated_at_iso: iso(subDays(now, 2.2)), customer_mode: "reuse", contact_mode: "reuse", note: "Tour completed; follow-up needed" },

    // Paperwork + ready to enroll (3)
    { seed_key: "enroll_demo_paperwork_1", name: "Enrollment — Williams Family", status_key: "application_in_progress", created_at_iso: iso(subDays(now, 1.5)), updated_at_iso: iso(subDays(now, 0.2)), customer_mode: "reuse", contact_mode: "reuse", note: "Paperwork in progress" },
    { seed_key: "enroll_demo_paperwork_2", name: "Enrollment — Brown Family", status_key: "application_in_progress", created_at_iso: iso(subDays(now, 2.5)), updated_at_iso: iso(subDays(now, 0.9)), customer_mode: "reuse", contact_mode: "reuse", note: "Paperwork in progress" },
    { seed_key: "enroll_demo_ready_to_enroll_1", name: "Enrollment — Davis Family", status_key: "ready_to_enroll", created_at_iso: iso(subDays(now, 8.0)), updated_at_iso: iso(subDays(now, 2.1)), customer_mode: "reuse", contact_mode: "reuse", note: "Ready to enroll (older)" },

    // Waitlisted + enrolled + lost (3)
    { seed_key: "enroll_demo_waitlisted_1", name: "Enrollment — Martinez Family", status_key: "waitlisted", created_at_iso: iso(subDays(now, 10)), updated_at_iso: iso(subDays(now, 1.1)), customer_mode: "reuse", contact_mode: "reuse", note: "Waitlisted" },
    { seed_key: "enroll_demo_enrolled_1", name: "Enrollment — Thompson Family", status_key: "enrolled", created_at_iso: iso(subDays(now, 12)), updated_at_iso: iso(subDays(now, 0.7)), customer_mode: "reuse", contact_mode: "reuse", note: "Enrolled" },
    { seed_key: "enroll_demo_lost_1", name: "Enrollment — Thompson Family", status_key: "lost", created_at_iso: iso(subDays(now, 12)), updated_at_iso: iso(subDays(now, 0.7)), customer_mode: "reuse", contact_mode: "reuse", note: "Lost" },
    { seed_key: "enroll_demo_lost_2", name: "Enrollment — Anderson Family", status_key: "lost", created_at_iso: iso(subDays(now, 13)), updated_at_iso: iso(subDays(now, 0.5)), customer_mode: "reuse", contact_mode: "reuse", note: "Lost" },

    // Needs attention boosters (ensure >=5 hit):
    { seed_key: "enroll_demo_stale_3d", name: "Enrollment — Stale Case", status_key: "contacted", created_at_iso: iso(subDays(now, 9)), updated_at_iso: iso(subDays(now, 3.2)), customer_mode: "reuse", contact_mode: "reuse", note: "Stale >3d (needs attention: stale)" },
    { seed_key: "enroll_demo_missing_contact", name: "Enrollment — Missing Contact", status_key: "new_inquiry", created_at_iso: iso(subDays(now, 0.9)), updated_at_iso: iso(subDays(now, 0.9)), customer_mode: "reuse", contact_mode: "null", note: "Missing primary_contact_id (needs attention: missing data)" },
    { seed_key: "enroll_demo_missing_customer", name: "Enrollment — Missing Customer", status_key: "new_inquiry", created_at_iso: iso(subDays(now, 0.9)), updated_at_iso: iso(subDays(now, 0.9)), customer_mode: "null", contact_mode: "reuse", note: "Missing customer_id (needs attention: missing data)" },

    // Legacy predicate coverage: keep 2 records in qualified/scheduled/booked that are stale >2d
    { seed_key: "enroll_demo_legacy_qualified_stale2d", name: "Enrollment — Legacy Qualified (stale)", status_key: "qualified", created_at_iso: iso(subDays(now, 5.0)), updated_at_iso: iso(subDays(now, 2.2)), customer_mode: "reuse", contact_mode: "reuse", note: "Legacy status_key qualified, stale >2d (needs attention: value/readiness predicate)" },
    { seed_key: "enroll_demo_legacy_booked_stale2d", name: "Enrollment — Legacy Booked (stale)", status_key: "booked", created_at_iso: iso(subDays(now, 6.0)), updated_at_iso: iso(subDays(now, 2.3)), customer_mode: "reuse", contact_mode: "reuse", note: "Legacy status_key booked, stale >2d (needs attention: value/readiness predicate)" },
  ];

  const seedKeys = specs.map((s) => s.seed_key);

  // Ensure per-seed customer + contact fixtures so demo records have real drawer data.
  // Best-effort: if insert fails due to schema differences, opportunities fall back to reusing existing ids.
  const seedContactBySeedKey = new Map<string, string>();
  const seedCustomerBySeedKey = new Map<string, string>();

  const [{ data: existingSeedCustomers }, { data: existingSeedContacts }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, metadata")
      .eq("org_id", orgId)
      .like("metadata->>seed_key", "enroll_demo_%")
      .limit(2000),
    supabase
      .from("contacts")
      .select("id, metadata")
      .eq("org_id", orgId)
      .like("metadata->>seed_key", "enroll_demo_%")
      .limit(2000),
  ]);

  for (const r of existingSeedCustomers ?? []) {
    const seedKey = (r as any)?.metadata?.seed_key;
    const id = (r as any)?.id;
    if (typeof seedKey === "string" && typeof id === "string") seedCustomerBySeedKey.set(seedKey, id);
  }
  for (const r of existingSeedContacts ?? []) {
    const seedKey = (r as any)?.metadata?.seed_key;
    const id = (r as any)?.id;
    if (typeof seedKey === "string" && typeof id === "string") seedContactBySeedKey.set(seedKey, id);
  }

  const familyNames = [
    { last: "Rivera", first: "Ava" },
    { last: "Chen", first: "Mia" },
    { last: "Patel", first: "Noah" },
    { last: "Johnson", first: "Emma" },
    { last: "Garcia", first: "Lucas" },
    { last: "Nguyen", first: "Sophia" },
    { last: "Kim", first: "Liam" },
    { last: "ONeil", first: "Olivia" },
    { last: "Williams", first: "Ethan" },
    { last: "Brown", first: "Isabella" },
    { last: "Davis", first: "James" },
    { last: "Martinez", first: "Charlotte" },
    { last: "Thompson", first: "Amelia" },
    { last: "Anderson", first: "Benjamin" },
  ];

  function seedEmail(seedKey: string): string {
    const local = seedKey.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 48) || "seed";
    return `${local}@demo.alloy.invalid`;
  }

  function seedPhone(seedKey: string): string {
    // Deterministic but fake; avoids collisions. Not guaranteed to pass strict E.164 validators, but works in our UI.
    const n = Math.abs(
      seedKey
        .split("")
        .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 10000000, 7)
    );
    const s = String(1000000 + (n % 9000000));
    return `+1415${s}`;
  }

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const person = familyNames[i % familyNames.length]!;

    if (!seedCustomerBySeedKey.has(spec.seed_key) && spec.customer_mode !== "null") {
      const { data: createdCust, error: custErr } = await supabase
        .from("customers")
        .insert({
          org_id: orgId,
          name: `${person.last} Family`,
          metadata: { seed_key: spec.seed_key, demo_seed_package: "enrollment_pipeline_demo_v1" },
        } as any)
        .select("id")
        .maybeSingle();
      if (custErr) {
        console.log("WARN: seed customer insert failed", { seed_key: spec.seed_key, error: custErr.message });
      }
      if ((createdCust as any)?.id) seedCustomerBySeedKey.set(spec.seed_key, (createdCust as any).id);
    }

    if (!seedContactBySeedKey.has(spec.seed_key) && spec.contact_mode !== "null") {
      const customer_id = seedCustomerBySeedKey.get(spec.seed_key) ?? null;
      const { data: createdContact, error: contactErr } = await supabase
        .from("contacts")
        .insert({
          org_id: orgId,
          customer_id,
          first_name: person.first,
          last_name: person.last,
          email: seedEmail(spec.seed_key),
          phone: seedPhone(spec.seed_key),
          metadata: { seed_key: spec.seed_key, demo_seed_package: "enrollment_pipeline_demo_v1" },
        } as any)
        .select("id")
        .maybeSingle();
      if (contactErr) {
        console.log("WARN: seed contact insert failed", { seed_key: spec.seed_key, error: contactErr.message });
        // If we hit a unique constraint on email, recover by reusing the existing contact.
        const email = seedEmail(spec.seed_key);
        const { data: existingByEmail } = await supabase
          .from("contacts")
          .select("id")
          .eq("org_id", orgId)
          .eq("email", email)
          .maybeSingle();
        if ((existingByEmail as any)?.id) {
          seedContactBySeedKey.set(spec.seed_key, (existingByEmail as any).id);
        }
      }
      if ((createdContact as any)?.id) seedContactBySeedKey.set(spec.seed_key, (createdContact as any).id);
    }

    // Normalize existing seeded contact row fields deterministically (avoids duplicates, ensures phone/email present).
    const contactId = seedContactBySeedKey.get(spec.seed_key) ?? null;
    const customerId = seedCustomerBySeedKey.get(spec.seed_key) ?? null;
    if (contactId && spec.contact_mode !== "null") {
      const { error: updErr } = await supabase
        .from("contacts")
        .update({
          customer_id: customerId,
          email: seedEmail(spec.seed_key),
          phone: seedPhone(spec.seed_key),
          first_name: person.first,
          last_name: person.last,
          metadata: { seed_key: spec.seed_key, demo_seed_package: "enrollment_pipeline_demo_v1" },
        } as any)
        .eq("org_id", orgId)
        .eq("id", contactId);
      if (updErr) {
        console.log("WARN: seed contact normalize failed", { seed_key: spec.seed_key, error: updErr.message });
      }
    }
  }

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

    const customer_id =
      spec.customer_mode === "reuse"
        ? seedCustomerBySeedKey.get(spec.seed_key) ?? pick(customerIds, i) ?? null
        : null;
    const primary_contact_id =
      spec.contact_mode === "reuse"
        ? seedContactBySeedKey.get(spec.seed_key) ?? pick(contactIds, i) ?? null
        : null;

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

  // Normalize legacy seeded rows in this org so v1 queues match (do not touch timestamps).
  const legacyMap: Record<string, string> = {
    new: "new_inquiry",
    scheduled: "tour_scheduled",
    won: "enrolled",
  };
  const { data: legacyRows } = await supabase
    .from("opportunities")
    .select("id, status_key, customer_id, primary_contact_id, work_unit_id, metadata")
    .eq("org_id", orgId)
    .like("metadata->>seed_key", "enroll_demo_%")
    .limit(2000);

  let normalized = 0;
  const normalizedNeedsAttentionExpected: Array<{ seed_key: string; id: string; reason: string }> = [];
  for (const rowAny of legacyRows ?? []) {
    const row = rowAny as any;
    const seedKey = row?.metadata?.seed_key;
    if (typeof seedKey !== "string") continue;

    const current = String(row.status_key ?? "").trim().toLowerCase();
    const mapped = legacyMap[current];

    const patch: Record<string, unknown> = {};
    if (mapped && !seedKey.includes("legacy_")) patch.status_key = mapped;
    if (row.customer_id == null && seedCustomerBySeedKey.get(seedKey)) patch.customer_id = seedCustomerBySeedKey.get(seedKey);
    if (row.primary_contact_id == null && seedContactBySeedKey.get(seedKey)) patch.primary_contact_id = seedContactBySeedKey.get(seedKey);
    if (hasWorkUnitIdCol && row.work_unit_id == null) patch.work_unit_id = workUnitId;

    if (Object.keys(patch).length === 0) continue;
    const { error: updErr } = await supabase.from("opportunities").update(patch).eq("id", row.id).eq("org_id", orgId);
    if (!updErr) {
      normalized++;
      const finalRow = { ...row, ...patch };
      const updatedAt = finalRow.updated_at ? new Date(finalRow.updated_at) : null;
      const stale3d = updatedAt != null && !Number.isNaN(updatedAt.getTime()) && updatedAt.getTime() < subDays(now, 3).getTime();
      const stale2d = updatedAt != null && !Number.isNaN(updatedAt.getTime()) && updatedAt.getTime() < subDays(now, 2).getTime();
      const missing = finalRow.primary_contact_id == null || finalRow.customer_id == null;
      const highValue = ["qualified", "scheduled", "booked"].includes(String(finalRow.status_key ?? "").trim().toLowerCase()) && stale2d;
      if (stale3d || missing || highValue) {
        const reason = stale3d ? "stale_3d" : missing ? "missing_data" : "high_value_stale_2d";
        normalizedNeedsAttentionExpected.push({ seed_key: seedKey, id: String(finalRow.id), reason });
      }
    }
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
      // Important: do NOT touch updated_at here — seed needs stale timestamps to remain stale across reruns.
      .update({ work_unit_id: workUnitId })
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
  // Ensure seeded opportunities have the intended link completeness (without changing timestamps).
  // Only the explicit missing-data cases should remain missing.
  const intentionalMissingContact = new Set(["enroll_demo_missing_contact"]);
  const intentionalMissingCustomer = new Set(["enroll_demo_missing_customer"]);
  let linkPatched = 0;
  for (const r of seeded) {
    const seedKey = r?.metadata?.seed_key;
    if (typeof seedKey !== "string") continue;
    const patch: Record<string, unknown> = {};
    if (!intentionalMissingCustomer.has(seedKey) && r.customer_id == null) {
      const cid = seedCustomerBySeedKey.get(seedKey);
      if (cid) patch.customer_id = cid;
    }
    if (!intentionalMissingContact.has(seedKey) && r.primary_contact_id == null) {
      const ccid = seedContactBySeedKey.get(seedKey);
      if (ccid) patch.primary_contact_id = ccid;
    }
    if (Object.keys(patch).length === 0) continue;
    const { error } = await supabase.from("opportunities").update(patch).eq("id", r.id).eq("org_id", orgId);
    if (!error) linkPatched++;
  }

  // Align contact.customer_id with the opportunity.customer_id for seeded records (improves drawer consistency).
  let contactCustomerAligned = 0;
  for (const r of seeded) {
    const seedKey = r?.metadata?.seed_key;
    if (typeof seedKey !== "string") continue;
    if (intentionalMissingCustomer.has(seedKey)) continue;
    if (intentionalMissingContact.has(seedKey)) continue;
    const contactId = r.primary_contact_id;
    const customerId = r.customer_id;
    if (typeof contactId !== "string" || typeof customerId !== "string") continue;
    const { error } = await supabase
      .from("contacts")
      .update({ customer_id: customerId } as any)
      .eq("org_id", orgId)
      .eq("id", contactId);
    if (!error) contactCustomerAligned++;
  }
  const byStatus = new Map<string, number>();
  const needsAttentionExpected: Array<{ id: string; seed_key: string; reason: string }> = [];
  const needsAttentionExpectedAll: Array<{ id: string; seed_key: string; name: string; status_key: string; reason: string }> = [];

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
        needsAttentionExpectedAll.push({
          id: r.id,
          seed_key: seedKey,
          name: String(r.name ?? "").trim(),
          status_key: String(r.status_key ?? "").trim(),
          reason,
        });
      }
    }
  }

  const byStatusSorted = [...byStatus.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  console.log("--- Enrollment pipeline demo seed ---");
  console.log("org_id:", orgId);
  console.log("work_unit_id target:", workUnitId);
  console.log("work_unit_key target:", workUnitKey ?? "—");
  console.log("work_unit_name target:", workUnitName ?? "—");
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
  console.log("normalized_legacy_seeded_rows:", normalized);
  console.log("patched_seeded_opportunity_links:", linkPatched);
  console.log("aligned_seeded_contact_customer_ids:", contactCustomerAligned);
  console.log("seeded counts by status:", byStatusSorted.map(([k, v]) => `${k}:${v}`).join(", "));
  console.log("");
  console.log("needs_attention expected (>=5 target):", needsAttentionExpected.length);
  for (const r of needsAttentionExpected.slice(0, 20)) {
    console.log(`- ${r.seed_key} (${r.id}) — ${r.reason}`);
  }
  if (needsAttentionExpected.length > 20) console.log(`... (${needsAttentionExpected.length - 20} more)`);
  if (normalizedNeedsAttentionExpected.length) {
    console.log("");
    console.log("needs_attention expected (including normalized rows):", needsAttentionExpected.length + normalizedNeedsAttentionExpected.length);
    for (const r of normalizedNeedsAttentionExpected.slice(0, 10)) {
      console.log(`- ${r.seed_key} (${r.id}) — ${r.reason} (post-normalize)`);
    }
  }
  console.log("");

  try {
    const qs = await getWorkUnitQueueSummaries({ orgId, workUnitId, limit: 3 });
    console.log("--- QueueService queue summaries ---");
    for (const q of qs) {
      console.log(`- ${q.key}: ${q.label} — ${q.count}`);
    }
    const na = await getWorkUnitQueueItems({ orgId, workUnitId, queueKey: "needs_attention", limit: 10, offset: 0 });
    console.log("QueueService needs_attention total:", na.total);
    const names = (na.items ?? []).slice(0, 10).map((r: any) => String(r?.name ?? r?.title ?? r?.id ?? "")).filter(Boolean);
    console.log("QueueService needs_attention sample:", names);

    const naExpectedNames = new Map(needsAttentionExpectedAll.map((x) => [x.id, x]));
    const unmatched = (na.items ?? [])
      .map((r: any) => String(r?.id ?? ""))
      .filter((id) => id && !naExpectedNames.has(id))
      .slice(0, 20);
    if (unmatched.length) {
      console.log("WARN: QueueService needs_attention contains unexpected records (not in seed expectation calc):");
      console.log(unmatched);
      console.log("NOTE: This can happen if non-seeded opportunities exist in this work unit.");
    }
  } catch (e) {
    console.log("WARN: QueueService smoke check failed:", e instanceof Error ? e.message : String(e));
  }

  // Sample record with linked contact/customer details.
  const { data: sampleSeed } = await supabase
    .from("opportunities")
    .select("id, name, status_key, customer_id, primary_contact_id, primary_person_id, location_id, work_unit_id, metadata")
    .eq("org_id", orgId)
    .like("metadata->>seed_key", "enroll_demo_%")
    .not("customer_id", "is", null)
    .not("primary_contact_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sampleSeed) {
    const custId = (sampleSeed as any).customer_id as string | null;
    const contactId = (sampleSeed as any).primary_contact_id as string | null;
    const [{ data: cust }, { data: contact }] = await Promise.all([
      custId
        ? supabase.from("customers").select("id, name").eq("id", custId).eq("org_id", orgId).maybeSingle()
        : Promise.resolve({ data: null as any }),
      contactId
        ? supabase
            .from("contacts")
            .select("id, first_name, last_name, email, phone, customer_id")
            .eq("id", contactId)
            .eq("org_id", orgId)
            .maybeSingle()
        : Promise.resolve({ data: null as any }),
    ]);
    console.log("--- Sample seeded opportunity (with links) ---");
    console.log({
      opportunity: {
        id: (sampleSeed as any).id,
        name: (sampleSeed as any).name,
        status_key: (sampleSeed as any).status_key,
        work_unit_id: (sampleSeed as any).work_unit_id,
        customer_id: custId,
        primary_contact_id: contactId,
        primary_person_id: (sampleSeed as any).primary_person_id ?? null,
        location_id: (sampleSeed as any).location_id ?? null,
        seed_key: (sampleSeed as any)?.metadata?.seed_key ?? null,
      },
      customer: cust ? { id: (cust as any).id, name: (cust as any).name } : null,
      contact: contact
        ? {
            id: (contact as any).id,
            first_name: (contact as any).first_name,
            last_name: (contact as any).last_name,
            email: (contact as any).email,
            phone: (contact as any).phone,
            customer_id: (contact as any).customer_id,
          }
        : null,
    });
  } else {
    console.log("WARN: No seeded opportunity found with both customer_id and primary_contact_id.");
  }

  console.log("Manual URLs:");
  console.log(`- ${baseUrl}/adminV2/workspace/dept/<departmentId>/work-unit/${workUnitId}`);
  console.log(`- ${baseUrl}/api/admin/work-units/${workUnitId}/queues`);
}

main().catch((e) => {
  console.error(String((e as any)?.stack ?? e));
  process.exit(1);
});

