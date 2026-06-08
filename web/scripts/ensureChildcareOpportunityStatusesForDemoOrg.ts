#!/usr/bin/env npx tsx
/**
 * Dev/staging helper: normalize opportunity status_definitions for the childcare demo org.
 *
 * Goal:
 * - Keep/activate only the childcare Enrollment statuses for this org
 * - Deactivate everything else for opportunities via org overrides (so Admin drawer timeline/options are clean)
 *
 * Env:
 *   DEV_QUEUE_ORG_ID=... (optional; defaults to the childcare demo org)
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const DEFAULT_ORG_ID = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const ENTITY_TYPE = "opportunities";

const CHILDCARE_STATUS_ORDER: Array<{ key: string; label: string }> = [
  { key: "new_inquiry", label: "New inquiry" },
  { key: "contacted", label: "Contacted" },
  { key: "tour_scheduled", label: "Tour scheduled" },
  { key: "tour_completed", label: "Tour completed" },
  { key: "application_in_progress", label: "Application in progress" },
  { key: "ready_to_enroll", label: "Ready to enroll" },
  { key: "waitlisted", label: "Waitlisted" },
  { key: "enrolled", label: "Enrolled" },
  { key: "lost", label: "Lost" },
];

const ALLOW = new Set(CHILDCARE_STATUS_ORDER.map((x) => x.key));
const FORCE_DEACTIVATE = new Set([
  "needs_a_quote",
  "conversation_had",
  "qualified",
  "new",
  "scheduled",
  "booked",
  "won",
]);

function line() {
  console.log("=".repeat(90));
}

async function main() {
  const orgId = (process.env.DEV_QUEUE_ORG_ID?.trim() || DEFAULT_ORG_ID).trim();
  if (!orgId) {
    console.error("Missing org id (DEV_QUEUE_ORG_ID).");
    process.exit(1);
  }

  const supabase = createAdminClient();

  const { data: orgRow } = await supabase.from("orgs").select("id, name, slug").eq("id", orgId).maybeSingle();
  line();
  console.log("Normalize opportunity statuses for org");
  console.log({ orgId, orgName: orgRow?.name ?? null, orgSlug: orgRow?.slug ?? null });
  line();

  // Existing org-specific rows
  const { data: orgRows, error: orgRowsErr } = await supabase
    .from("status_definitions")
    .select("id, org_id, entity_type, status_key, status_label, sort_order, is_active, is_system, metadata")
    .eq("org_id", orgId)
    .in("entity_type", ["opportunities", "opportunity"]);
  if (orgRowsErr) throw new Error(orgRowsErr.message);

  // Effective rows (org overrides + industry defaults) — what the UI uses.
  const effectiveBefore = await fetchEffectiveStatusDefinitions(supabase as any, orgId, "opportunities", { activeOnly: true });

  console.log("Active effective opportunity statuses BEFORE:");
  console.log(effectiveBefore.map((d) => d.status_key));

  const orgByKey = new Map<string, any>();
  for (const r of orgRows ?? []) {
    const k = String((r as any).status_key ?? "").trim();
    if (k) orgByKey.set(k, r);
  }

  // Upsert/ensure allowed statuses are active + labeled + ordered.
  // We prefer updating existing org rows; otherwise insert org overrides.
  let activated = 0;
  let inserted = 0;
  let deactivated = 0;

  for (let i = 0; i < CHILDCARE_STATUS_ORDER.length; i++) {
    const s = CHILDCARE_STATUS_ORDER[i]!;
    const sort_order = (i + 1) * 10;
    const existing = orgByKey.get(s.key) ?? null;
    if (existing?.id) {
      const { error } = await supabase
        .from("status_definitions")
        .update({
          status_label: s.label,
          sort_order,
          is_active: true,
        })
        .eq("id", existing.id)
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
      activated++;
    } else {
      const { error } = await supabase.from("status_definitions").insert({
        org_id: orgId,
        entity_type: ENTITY_TYPE,
        status_key: s.key,
        status_label: s.label,
        sort_order,
        is_active: true,
        is_system: false,
        metadata: { demo_seed_package: "enrollment_pipeline_demo_v1" },
      } as any);
      if (error) throw new Error(error.message);
      inserted++;
    }
  }

  // Deactivate everything else in effective set by creating/updating org overrides with is_active=false.
  // This removes industry defaults from effective lists without touching schema/UI.
  const effectiveAll = await fetchEffectiveStatusDefinitions(supabase as any, orgId, "opportunities", { activeOnly: false });
  const keysToDeactivate = effectiveAll
    .map((d) => d.status_key)
    .filter((k) => k && (!ALLOW.has(k) || FORCE_DEACTIVATE.has(k)));

  // First, hard-deactivate any existing org rows for those keys (covers multiple rows / entity_type variants).
  if (keysToDeactivate.length) {
    const { data: preCountRows } = await supabase
      .from("status_definitions")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("entity_type", ["opportunities", "opportunity"])
      .in("status_key", keysToDeactivate as any)
      .eq("is_active", true);

    const { error: bulkErr } = await supabase
      .from("status_definitions")
      .update({ is_active: false })
      .eq("org_id", orgId)
      .in("entity_type", ["opportunities", "opportunity"])
      .in("status_key", keysToDeactivate as any);
    if (bulkErr) throw new Error(bulkErr.message);
    deactivated += typeof (preCountRows as any) === "number" ? (preCountRows as any) : 0;
  }

  // Then, insert org overrides for any keys that exist only as defaults (so they disappear from effective list).
  const orgKeysAfterBulk = new Set(
    (await supabase
      .from("status_definitions")
      .select("status_key")
      .eq("org_id", orgId)
      .in("entity_type", ["opportunities", "opportunity"])
    ).data?.map((r: any) => String(r.status_key ?? "").trim()).filter(Boolean) ?? []
  );

  for (const key of keysToDeactivate) {
    if (orgKeysAfterBulk.has(key)) continue;
    const { error } = await supabase.from("status_definitions").insert({
      org_id: orgId,
      entity_type: ENTITY_TYPE,
      status_key: key,
      status_label: key,
      sort_order: 9999,
      is_active: false,
      is_system: false,
      metadata: {
        demo_seed_package: "enrollment_pipeline_demo_v1",
        deactivated_by: "ensureChildcareOpportunityStatusesForDemoOrg",
      },
    } as any);
    if (error) throw new Error(error.message);
    deactivated++;
  }

  // Extra guard: explicitly force an inactive org override for needs_a_quote if it still exists.
  if (FORCE_DEACTIVATE.has("needs_a_quote")) {
    const { data: orgNeed, error: orgNeedErr } = await supabase
      .from("status_definitions")
      .select("id, is_active, entity_type")
      .eq("org_id", orgId)
      .eq("status_key", "needs_a_quote");
    if (orgNeedErr) throw new Error(orgNeedErr.message);
    if (Array.isArray(orgNeed) && orgNeed.length) {
      const { error } = await supabase
        .from("status_definitions")
        .update({ is_active: false })
        .eq("org_id", orgId)
        .eq("status_key", "needs_a_quote");
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("status_definitions").insert({
        org_id: orgId,
        entity_type: ENTITY_TYPE,
        status_key: "needs_a_quote",
        status_label: "Needs a quote",
        sort_order: 9999,
        is_active: false,
        is_system: false,
        metadata: {
          demo_seed_package: "enrollment_pipeline_demo_v1",
          deactivated_by: "ensureChildcareOpportunityStatusesForDemoOrg",
        },
      } as any);
      if (error) throw new Error(error.message);
    }
  }

  const effectiveAfter = await fetchEffectiveStatusDefinitions(supabase as any, orgId, "opportunities", { activeOnly: true });
  line();
  console.log("Results:");
  console.log({ activated, inserted, deactivated });
  console.log("Active effective opportunity statuses AFTER:");
  console.log(effectiveAfter.map((d) => ({ key: d.status_key, label: d.status_label, sort_order: d.sort_order })));
  line();
  const missing = CHILDCARE_STATUS_ORDER.map((x) => x.key).filter((k) => !effectiveAfter.some((d) => d.status_key === k));
  if (missing.length) {
    console.log("FAIL: missing required childcare statuses in effective list:", missing);
    process.exit(2);
  }
  const extras = effectiveAfter.map((d) => d.status_key).filter((k) => k && !ALLOW.has(k));
  if (extras.length) {
    console.log("FAIL: non-childcare opportunity statuses still active:", extras);
    process.exit(3);
  }
  console.log("PASS: childcare opportunity statuses normalized.");
}

main().catch((e) => {
  console.error(String((e as any)?.stack ?? e));
  process.exit(1);
});

