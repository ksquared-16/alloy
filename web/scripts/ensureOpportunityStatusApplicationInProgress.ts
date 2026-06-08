#!/usr/bin/env npx tsx
/**
 * Dev/staging helper: ensure opportunities status_key `application_in_progress` exists and is active.
 *
 * Env:
 *   DEV_QUEUE_ORG_ID=... (required)
 *
 * Usage:
 *   DEV_QUEUE_ORG_ID=... npx tsx web/scripts/ensureOpportunityStatusApplicationInProgress.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const ENTITY_TYPE = "opportunities";
const STATUS_KEY = "application_in_progress";
const STATUS_LABEL = "Application in progress";

type StatusRow = {
  id: string;
  org_id: string;
  entity_type: string;
  status_key: string;
  status_label: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

function asNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function getStatusSortOrder(params: {
  supabase: ReturnType<typeof createAdminClient>;
  orgId: string;
  statusKey: string;
}): Promise<number | null> {
  const { supabase, orgId, statusKey } = params;
  const { data, error } = await supabase
    .from("status_definitions")
    .select("sort_order")
    .eq("org_id", orgId)
    .eq("entity_type", ENTITY_TYPE)
    .eq("status_key", statusKey)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load sort_order for ${statusKey}: ${error.message}`);
  }
  return typeof data?.sort_order === "number" ? data.sort_order : null;
}

async function main() {
  const orgId = process.env.DEV_QUEUE_ORG_ID?.trim() || "";
  if (!orgId) {
    console.error("Set DEV_QUEUE_ORG_ID to the target org UUID.");
    process.exit(1);
  }

  const supabase = createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("status_definitions")
    .select("id, org_id, entity_type, status_key, status_label, sort_order, is_active")
    .eq("org_id", orgId)
    .eq("entity_type", ENTITY_TYPE)
    .eq("status_key", STATUS_KEY)
    .maybeSingle();
  if (existingError) {
    throw new Error(`Failed to check existing status: ${existingError.message}`);
  }

  const tourSort = await getStatusSortOrder({
    supabase,
    orgId,
    statusKey: "tour_completed",
  });
  const readySort = await getStatusSortOrder({
    supabase,
    orgId,
    statusKey: "ready_to_enroll",
  });

  const tour = asNumberOr(tourSort, 40);
  const ready = asNumberOr(readySort, tour + 20);

  const sort_order =
    ready > tour ? Math.floor((tour + ready) / 2) : Math.floor(tour + 10);

  if (existing) {
    const row = existing as StatusRow;
    const { data: updated, error } = await supabase
      .from("status_definitions")
      .update({
        status_label: STATUS_LABEL,
        sort_order,
        is_active: true,
      })
      .eq("id", row.id)
      .eq("org_id", orgId)
      .select("id, status_key, status_label, sort_order, is_active")
      .single();
    if (error) throw new Error(error.message);
    console.log("--- Status definition updated ---");
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("status_definitions")
    .insert({
      org_id: orgId,
      entity_type: ENTITY_TYPE,
      status_key: STATUS_KEY,
      status_label: STATUS_LABEL,
      sort_order,
      is_active: true,
    })
    .select("id, status_key, status_label, sort_order, is_active")
    .single();

  if (insertError) throw new Error(insertError.message);
  console.log("--- Status definition inserted ---");
  console.log(JSON.stringify(inserted, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

