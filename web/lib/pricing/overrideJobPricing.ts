import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/emitEvent";
import {
  type JobLineItemRow,
  computeJobTotals,
  insertJobPricingSnapshot,
  nextSnapshotVersion,
} from "@/lib/pricing/jobPricingCore";
import { computeJobGrossBasisCents, normalizeJobDiscountAmountToCents, type JobPriceInput } from "@/lib/admin/jobDisplayPrice";
import { applyPricingDeltaAdjustmentCharge } from "@/lib/pricing/pricingChangeAdjustmentCharge";
import { upsertPrimaryDraftServiceCharge } from "@/lib/pricing/upsertPrimaryDraftServiceCharge";

export type JobPricingOverrideLineInput = {
  line_type: "service" | "addon" | "discount" | "fee" | "adjustment" | "tax";
  label: string;
  amount_cents: number;
  unit_amount_cents?: number;
  quantity?: number;
  category_key?: string | null;
  sort_order?: number;
  /** Default: true for service/addon/fee/adjustment; false for discount/tax. */
  is_discountable?: boolean;
  source_entity_type?: string | null;
  source_entity_id?: string | null;
  /** When set, used as row pricing_source (e.g. discount_program). */
  pricing_source_line?: string | null;
};

export type OverrideJobPricingParams = {
  supabase: SupabaseClient;
  orgId: string;
  jobId: string;
  changes: JobPricingOverrideLineInput[];
  reason: string;
  actorUserId?: string | null;
};

export type OverrideJobPricingResult = { ok: true } | { ok: false; error: string };

function defaultIsDiscountable(lineType: JobPricingOverrideLineInput["line_type"]): boolean {
  if (lineType === "tax" || lineType === "discount") return false;
  return true;
}

/**
 * Builds explicit service + optional discount lines from the persisted job row.
 * Totals are derived only from inserted lines (computeJobTotals), not from gross−net inference.
 * `normalizeJobDiscountAmountToCents` only decodes legacy job.discount_amount into cents for the discount line.
 */
export function buildOverrideLinesFromAdminJobRow(
  job: JobPriceInput & {
    discount_code?: string | null;
    discount_program_id?: string | null;
    discount_code_id?: string | null;
  }
): JobPricingOverrideLineInput[] {
  const gross = computeJobGrossBasisCents(job) ?? 0;
  const lines: JobPricingOverrideLineInput[] = [];
  let sort = 0;
  lines.push({
    line_type: "service",
    label: "Service",
    amount_cents: gross,
    unit_amount_cents: gross,
    quantity: 1,
    sort_order: sort++,
    is_discountable: true,
  });

  const discountBase = gross;
  const discDecoded = normalizeJobDiscountAmountToCents(job.discount_amount ?? 0, discountBase);
  const applyDiscount = job.discounted === true && discDecoded > 0;
  if (applyDiscount) {
    const applied = Math.min(discountBase, discDecoded);
    const neg = -applied;
    const label =
      (job.discount_code && String(job.discount_code).trim()) ||
      (job.discount_program_id ? "Discount (program)" : "Discount");
    lines.push({
      line_type: "discount",
      label,
      amount_cents: neg,
      unit_amount_cents: neg,
      quantity: 1,
      sort_order: sort++,
      is_discountable: false,
      pricing_source_line: job.discount_program_id ? "discount_program" : "discount_code",
      source_entity_type: job.discount_program_id ? "discount_program" : "discount_code",
      source_entity_id: job.discount_program_id ?? job.discount_code_id ?? null,
    });
  }

  return lines;
}

function toRows(
  params: OverrideJobPricingParams,
  changes: JobPricingOverrideLineInput[]
): JobLineItemRow[] {
  const { orgId, jobId, reason, actorUserId } = params;
  const defaultSource = "admin_override";
  return changes.map((c, i) => {
    const qty = c.quantity != null && Number.isFinite(c.quantity) ? Number(c.quantity) : 1;
    const amt = Math.round(c.amount_cents);
    const unit = c.unit_amount_cents != null ? Math.round(c.unit_amount_cents) : amt;
    const isDiscountable = c.is_discountable ?? defaultIsDiscountable(c.line_type);
    return {
      org_id: orgId,
      job_id: jobId,
      sort_order: c.sort_order ?? i,
      line_type: c.line_type,
      category_key: c.category_key ?? null,
      label: c.label,
      quantity: qty,
      unit_amount_cents: unit,
      amount_cents: amt,
      currency_code: "USD",
      pricing_source: c.pricing_source_line ?? defaultSource,
      source_entity_type: c.source_entity_type ?? null,
      source_entity_id: c.source_entity_id ?? null,
      is_system_generated: false,
      is_manual_override: true,
      manual_override_reason: reason,
      is_active: true,
      metadata: { override: true, reason, is_discountable: isDiscountable },
      created_by: actorUserId ?? null,
      updated_by: actorUserId ?? null,
    };
  });
}

async function emitPricingOverriddenSafe(params: {
  orgId: string;
  jobId: string;
  reason: string;
  totals: ReturnType<typeof computeJobTotals>;
  lineCount: number;
}): Promise<void> {
  try {
    await emitEvent({
      org_id: params.orgId,
      event_type: "job_pricing_overridden",
      entity_type: "job",
      entity_id: params.jobId,
      payload: {
        job_id: params.jobId,
        reason: params.reason,
        totals: params.totals,
        line_item_count: params.lineCount,
      },
    });
  } catch (e) {
    console.error("[overrideJobPricing] emit job_pricing_overridden failed:", e);
  }
}

/**
 * Deactivates existing line items, inserts replacement lines (manual override), recomputes job totals, snapshot, event.
 */
export async function overrideJobPricing(params: OverrideJobPricingParams): Promise<OverrideJobPricingResult> {
  const { supabase, orgId, jobId, reason } = params;
  const now = new Date().toISOString();

  if (!reason?.trim()) {
    return { ok: false, error: "reason is required" };
  }

  if (!params.changes.length) {
    return { ok: false, error: "changes must include at least one line item" };
  }

  const discountLines = params.changes.filter((c) => c.line_type === "discount");
  if (discountLines.length > 1) {
    return { ok: false, error: "At most one discount line is allowed" };
  }
  for (const c of discountLines) {
    if (c.amount_cents >= 0) {
      return { ok: false, error: "Discount line amounts must be negative" };
    }
  }

  const changes = params.changes;

  const { error: deactErr } = await supabase
    .from("job_line_items")
    .update({ is_active: false, updated_at: now })
    .eq("job_id", jobId)
    .eq("org_id", orgId)
    .eq("is_active", true);
  if (deactErr) {
    return { ok: false, error: `deactivate line items: ${deactErr.message}` };
  }

  const lineRows = toRows(params, changes);
  const totals = computeJobTotals(lineRows);

  const { data: jobRow, error: jobFetchErr } = await supabase
    .from("jobs")
    .select("pricing_version, recurring_total_cents")
    .eq("id", jobId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (jobFetchErr) {
    return { ok: false, error: `job fetch: ${jobFetchErr.message}` };
  }
  const prevVersion = (jobRow as { pricing_version?: number } | null)?.pricing_version;
  const nextPv = typeof prevVersion === "number" && Number.isFinite(prevVersion) ? prevVersion + 1 : 1;
  const recurring = (jobRow as { recurring_total_cents?: number | null } | null)?.recurring_total_cents ?? null;

  const gross = totals.subtotal_cents;
  const net = totals.total_cents;

  const jobUpdate: Record<string, unknown> = {
    subtotal_cents: totals.subtotal_cents,
    discount_total_cents: totals.discount_total_cents,
    fee_total_cents: totals.fee_total_cents,
    adjustment_total_cents: totals.adjustment_total_cents,
    tax_total_cents: totals.tax_total_cents,
    total_cents: totals.total_cents,
    amount_due_cents: totals.total_cents,
    pricing_status: "overridden",
    pricing_locked_at: now,
    pricing_version: nextPv,
    updated_at: now,
    gross_price_cents: gross > 0 ? gross : null,
    estimated_total_cents: net,
    recurring_total_cents: recurring,
  };

  const { error: jobUpdErr } = await supabase.from("jobs").update(jobUpdate).eq("id", jobId).eq("org_id", orgId);
  if (jobUpdErr) {
    return { ok: false, error: `job update: ${jobUpdErr.message}` };
  }

  if (lineRows.length > 0) {
    const { error: insErr } = await supabase.from("job_line_items").insert(lineRows);
    if (insErr) {
      return { ok: false, error: `job_line_items insert: ${insErr.message}` };
    }
  }

  try {
    const snapVer = await nextSnapshotVersion(supabase, jobId);
    await insertJobPricingSnapshot({
      supabase,
      orgId,
      jobId,
      snapshotType: "override",
      versionNumber: snapVer,
      summary: { ...totals, reason },
      lineItems: lineRows.map((r) => ({
        line_type: r.line_type,
        label: r.label,
        amount_cents: r.amount_cents,
        category_key: r.category_key ?? null,
        is_manual_override: true,
        is_discountable: (r.metadata as Record<string, unknown> | undefined)?.is_discountable ?? null,
      })),
      reason,
      createdBy: params.actorUserId ?? null,
    });
  } catch (e) {
    console.error("[overrideJobPricing] snapshot failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "snapshot failed" };
  }

  await emitPricingOverriddenSafe({
    orgId,
    jobId,
    reason,
    totals,
    lineCount: lineRows.length,
  });

  const draftCharge = await upsertPrimaryDraftServiceCharge({
    supabase,
    orgId,
    jobId,
    totals,
    source: "admin",
  });
  if (!draftCharge.ok) {
    return { ok: false, error: draftCharge.error };
  }

  const adj = await applyPricingDeltaAdjustmentCharge({
    supabase,
    orgId,
    jobId,
    newPricingTotalCents: totals.total_cents,
  });
  if (!adj.ok) {
    return { ok: false, error: adj.error };
  }

  return { ok: true };
}
