import type { SupabaseClient } from "@supabase/supabase-js";

/** Line row shape used for DB insert (subset of job_line_items). */
export type JobLineItemRow = {
  org_id: string;
  job_id: string;
  sort_order: number | null;
  line_type: "service" | "addon" | "discount" | "fee" | "adjustment" | "tax";
  category_key?: string | null;
  label: string;
  description?: string | null;
  quantity: number;
  unit_amount_cents: number;
  amount_cents: number;
  currency_code?: string;
  is_taxable?: boolean;
  pricing_source?: string | null;
  source_entity_type?: string | null;
  source_entity_id?: string | null;
  is_system_generated?: boolean;
  is_manual_override?: boolean;
  manual_override_reason?: string | null;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
  created_by?: string | null;
  updated_by?: string | null;
};

export type ComputedPricingTotals = {
  subtotal_cents: number;
  discount_total_cents: number;
  fee_total_cents: number;
  adjustment_total_cents: number;
  tax_total_cents: number;
  total_cents: number;
};

/** Sum of amount_cents for lines with metadata.is_discountable === true (discount base for promos). */
export function discountableBaseCentsFromLineRows(lines: JobLineItemRow[]): number {
  return lines
    .filter((li) => (li.metadata as Record<string, unknown> | undefined)?.is_discountable === true)
    .reduce((sum, li) => sum + Math.round(Number(li.amount_cents) || 0), 0);
}

/**
 * Split the locked job total into contractor payout and platform fee using contractor bps only.
 *
 * **Locked rule (pricing lock paths):** basis = `jobs.total_cents` (from `computeJobTotals` / line items).
 * - `contractor_payout_cents = floor(total_cents * contractor_split_bps / 10000)`
 * - `alloy_fee_cents = total_cents - contractor_payout_cents`
 *
 * Matches `trg_jobs_assign_pricing_tier` integer semantics on INSERT (floor + remainder).
 */
export function splitLockedTotalByContractorBps(totalCents: number, contractorSplitBps: number): {
  contractor_payout_cents: number;
  alloy_fee_cents: number;
} {
  const basis = Math.max(0, Math.round(Number(totalCents) || 0));
  const bps = Math.round(Number(contractorSplitBps) || 0);
  const contractor_payout_cents = Math.floor((basis * bps) / 10000);
  const alloy_fee_cents = basis - contractor_payout_cents;
  return { contractor_payout_cents, alloy_fee_cents };
}

/**
 * Returns payout columns for a locked total, or `null` when `contractor_split_bps` is missing/invalid
 * (callers should persist `null` for both columns so stale payouts are not left on the job).
 */
export function payoutColumnsForLockedJobTotal(
  totalCents: number,
  contractorSplitBps: number | null | undefined
): { contractor_payout_cents: number; alloy_fee_cents: number } | null {
  if (typeof contractorSplitBps !== "number" || !Number.isFinite(contractorSplitBps) || contractorSplitBps < 0) {
    return null;
  }
  return splitLockedTotalByContractorBps(totalCents, contractorSplitBps);
}

/**
 * Aggregates job totals from line rows only. Does not infer or recompute discounts;
 * discount lines must already be present with negative (or conventionally negative) amounts.
 */

export function computeJobTotals(lines: JobLineItemRow[]): ComputedPricingTotals {
  let subtotal = 0;
  let discount_total = 0;
  let fee_total = 0;
  let adjustment_total = 0;
  let tax_total = 0;
  for (const l of lines) {
    const a = Math.round(Number(l.amount_cents) || 0);
    switch (l.line_type) {
      case "service":
      case "addon":
        subtotal += a;
        break;
      case "discount":
        discount_total += Math.abs(a);
        break;
      case "fee":
        fee_total += a;
        break;
      case "adjustment":
        adjustment_total += a;
        break;
      case "tax":
        tax_total += a;
        break;
      default:
        subtotal += a;
    }
  }
  const total_cents = subtotal - discount_total + fee_total + adjustment_total + tax_total;
  return {
    subtotal_cents: Math.max(0, subtotal),
    discount_total_cents: Math.max(0, discount_total),
    fee_total_cents: Math.max(0, fee_total),
    adjustment_total_cents: adjustment_total,
    tax_total_cents: Math.max(0, tax_total),
    total_cents: Math.max(0, total_cents),
  };
}

export async function nextSnapshotVersion(supabase: SupabaseClient, jobId: string): Promise<number> {
  const { data, error } = await supabase
    .from("job_pricing_snapshots")
    .select("version_number")
    .eq("job_id", jobId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[jobPricingCore] nextSnapshotVersion query failed:", error.message);
    return 1;
  }
  const v = (data as { version_number?: number } | null)?.version_number;
  return typeof v === "number" && Number.isFinite(v) ? v + 1 : 1;
}

export async function insertJobPricingSnapshot(params: {
  supabase: SupabaseClient;
  orgId: string;
  jobId: string;
  snapshotType: string;
  versionNumber: number;
  summary: Record<string, unknown>;
  lineItems: unknown[];
  reason?: string | null;
  createdBy?: string | null;
}): Promise<void> {
  const { error } = await params.supabase.from("job_pricing_snapshots").insert({
    org_id: params.orgId,
    job_id: params.jobId,
    snapshot_type: params.snapshotType,
    version_number: params.versionNumber,
    summary: params.summary,
    line_items: params.lineItems,
    reason: params.reason ?? null,
    created_by: params.createdBy ?? null,
  });
  if (error) throw new Error(`insertJobPricingSnapshot: ${error.message}`);
}
