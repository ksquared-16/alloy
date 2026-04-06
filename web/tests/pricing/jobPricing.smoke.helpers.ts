/**
 * Smoke-test helpers: real Supabase service-role client + job lifecycle.
 * Loads .env.local / .env from web/ so tests match local dev credentials.
 *
 * Related: payments + allocations smoke uses the same org/customer env vars — see
 * `tests/payments/paymentsTask2.smoke.helpers.ts`.
 */

import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { initializeJobPricing, type InitializeJobPricingParams } from "@/lib/pricing/initializeJobPricing";
import { overrideJobPricing, type OverrideJobPricingParams } from "@/lib/pricing/overrideJobPricing";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../.env.local") });
loadEnv({ path: path.resolve(__dirname, "../../.env") });

export type LineItemRow = {
  id: string;
  job_id: string;
  org_id: string;
  line_type: string;
  amount_cents: number;
  unit_amount_cents: number;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
};

export function smokeEnvConfigured(): boolean {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const org = process.env.JOB_PRICING_SMOKE_ORG_ID?.trim();
  const customer = process.env.JOB_PRICING_SMOKE_CUSTOMER_ID?.trim();
  return Boolean(url && key && org && customer);
}

export function createSmokeSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function smokeOrgId(): string {
  const org = process.env.JOB_PRICING_SMOKE_ORG_ID?.trim();
  if (!org) throw new Error("JOB_PRICING_SMOKE_ORG_ID is required");
  return org;
}

export function smokeCustomerId(): string {
  const c = process.env.JOB_PRICING_SMOKE_CUSTOMER_ID?.trim();
  if (!c) throw new Error("JOB_PRICING_SMOKE_CUSTOMER_ID is required");
  return c;
}

/**
 * Minimal jobs row for pricing smoke tests (service role bypasses RLS).
 */
export async function createTestJob(
  supabase: SupabaseClient,
  orgId: string,
  customerId: string
): Promise<string> {
  let statusKey = process.env.JOB_PRICING_SMOKE_STATUS_KEY?.trim() ?? null;
  if (!statusKey) {
    const { data } = await supabase
      .from("status_definitions")
      .select("status_key")
      .eq("org_id", orgId)
      .eq("entity_type", "jobs")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    statusKey = (data as { status_key?: string } | null)?.status_key ?? null;
  }

  if (!statusKey) {
    throw new Error(
      "Could not resolve jobs status_key — set JOB_PRICING_SMOKE_STATUS_KEY or add status_definitions for this org"
    );
  }

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      org_id: orgId,
      customer_id: customerId,
      status_key: statusKey,
      is_recurring: false,
      metadata: { smoke_test: true, created_at_smoke: new Date().toISOString() },
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`createTestJob failed: ${error?.message ?? "no row"}`);
  }
  return (data as { id: string }).id;
}

export async function deleteTestJob(supabase: SupabaseClient, jobId: string, orgId: string): Promise<void> {
  await supabase.from("charges").delete().eq("job_id", jobId).eq("org_id", orgId);
  await supabase.from("jobs").delete().eq("id", jobId).eq("org_id", orgId);
}

export async function runWithTestJob<T>(
  fn: (ctx: { supabase: SupabaseClient; orgId: string; jobId: string; customerId: string }) => Promise<T>
): Promise<T> {
  const supabase = createSmokeSupabase();
  const orgId = smokeOrgId();
  const customerId = smokeCustomerId();
  const jobId = await createTestJob(supabase, orgId, customerId);
  try {
    return await fn({ supabase, orgId, jobId, customerId });
  } finally {
    await deleteTestJob(supabase, jobId, orgId);
  }
}

export async function fetchLineItems(supabase: SupabaseClient, jobId: string, orgId: string): Promise<LineItemRow[]> {
  const { data, error } = await supabase
    .from("job_line_items")
    .select("id, job_id, org_id, line_type, amount_cents, unit_amount_cents, is_active, metadata")
    .eq("job_id", jobId)
    .eq("org_id", orgId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`fetchLineItems: ${error.message}`);
  return (data ?? []) as LineItemRow[];
}

export async function fetchJobPricingColumns(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string
): Promise<{
  total_cents: number | null;
  subtotal_cents: number | null;
  discount_total_cents: number | null;
  pricing_status: string | null;
  contractor_split_bps: number | null;
  contractor_payout_cents: number | null;
  alloy_fee_cents: number | null;
} | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "total_cents, subtotal_cents, discount_total_cents, pricing_status, contractor_split_bps, contractor_payout_cents, alloy_fee_cents"
    )
    .eq("id", jobId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`fetchJobPricingColumns: ${error.message}`);
  return data as {
    total_cents: number | null;
    subtotal_cents: number | null;
    discount_total_cents: number | null;
    pricing_status: string | null;
    contractor_split_bps: number | null;
    contractor_payout_cents: number | null;
    alloy_fee_cents: number | null;
  } | null;
}

export async function applyPricingInit(
  supabase: SupabaseClient,
  args: Omit<InitializeJobPricingParams, "supabase">
) {
  return initializeJobPricing({ supabase, ...args });
}

export async function applyPricingOverride(
  supabase: SupabaseClient,
  args: Omit<OverrideJobPricingParams, "supabase">
) {
  return overrideJobPricing({ supabase, ...args });
}

export function assertLineItemsConsistent(lines: LineItemRow[], opts: { activeOnly?: boolean } = {}) {
  const rows = opts.activeOnly ? lines.filter((l) => l.is_active) : lines;
  const discounts = rows.filter((l) => l.line_type === "discount");
  if (discounts.length > 1) {
    throw new Error(`Expected at most one discount line, got ${discounts.length}`);
  }
  for (const d of discounts) {
    if (d.amount_cents > 0 || d.unit_amount_cents > 0) {
      throw new Error(`Discount line must be non-positive, got amount_cents=${d.amount_cents}`);
    }
  }
}
