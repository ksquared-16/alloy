import type { SupabaseClient } from "@supabase/supabase-js";
import { emitEvent } from "@/lib/emitEvent";
import {
  type JobLineItemRow,
  computeJobTotals,
  discountableBaseCentsFromLineRows,
  insertJobPricingSnapshot,
  nextSnapshotVersion,
} from "@/lib/pricing/jobPricingCore";

export type InitializeJobPricingQuoteData = {
  grossFirstVisitCents: number | null;
  /** Retained for callers / snapshots only; not used to infer discounts. */
  netFirstVisitCents: number | null;
  recurringCents?: number | null;
  quoteOutput?: Record<string, unknown> | null;
  frequencyLabel?: string | null;
};

/**
 * Explicit discount only: a line is added when enabled and amount_cents or percent yields a positive value.
 * job.discount_amount is legacy storage only; pricing math uses the discount line + computeJobTotals.
 */
export type InitializeJobPricingDiscount = {
  enabled: boolean;
  /** Fixed discount in cents; takes precedence over percent when both set. */
  amount_cents?: number | null;
  /** Percent of discountable subtotal (e.g. 10 = 10%). */
  percent?: number | null;
  label?: string | null;
  discount_program_id?: string | null;
  discount_code_id?: string | null;
  discount_code?: string | null;
};

export type JobPricingAddonInput = {
  key?: string;
  name: string;
  priceCents: number;
};

export type InitializeJobPricingSource = "book-v2" | "admin";

export type InitializeJobPricingParams = {
  supabase: SupabaseClient;
  orgId: string;
  jobId: string;
  quoteData: InitializeJobPricingQuoteData;
  addons: JobPricingAddonInput[];
  discount: InitializeJobPricingDiscount;
  source: InitializeJobPricingSource;
  /** When true (default), skip if job already has active line items (idempotent retries). */
  skipIfActiveLines?: boolean;
  /**
   * When true, deactivates existing active line items first (e.g. book-v2 confirm retry on same job_id).
   * Ignores skipIfActiveLines for the early return path.
   */
  replaceExisting?: boolean;
  actorUserId?: string | null;
};

export type InitializeJobPricingResult =
  | { ok: true; skipped: boolean; lineItemCount: number }
  | { ok: false; error: string };

function parseAddonsFromQuoteOutput(q: Record<string, unknown> | null | undefined): JobPricingAddonInput[] {
  if (!q || typeof q !== "object") return [];
  const raw = q.addons;
  if (!Array.isArray(raw)) return [];
  const out: JobPricingAddonInput[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : typeof o.label === "string" ? o.label : "Add-on";
    const price =
      typeof o.price === "number" && Number.isFinite(o.price)
        ? Math.round(o.price * 100)
        : typeof o.price_cents === "number" && Number.isFinite(o.price_cents)
          ? Math.round(o.price_cents)
          : 0;
    out.push({ name, priceCents: Math.max(0, price) });
  }
  return out;
}

function metaDiscountable(isDiscountable: boolean, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { is_discountable: isDiscountable, ...extra };
}

function appendExplicitDiscountLine(
  rows: JobLineItemRow[],
  params: {
    orgId: string;
    jobId: string;
    sortStart: number;
    discount: InitializeJobPricingDiscount;
    actorUserId: string | null | undefined;
    fallbackPricingSource: string;
  }
): number {
  const { orgId, jobId, discount, actorUserId, fallbackPricingSource } = params;
  if (!discount.enabled) return params.sortStart;

  const discountBase = discountableBaseCentsFromLineRows(rows);

  if (discountBase <= 0) return params.sortStart;

  let discountAmount = 0;
  if (discount.amount_cents != null && Number.isFinite(discount.amount_cents) && discount.amount_cents > 0) {
    discountAmount = Math.round(discount.amount_cents);
  } else if (discount.percent != null && Number.isFinite(discount.percent) && discount.percent > 0) {
    discountAmount = Math.round((discountBase * discount.percent) / 100);
  } else {
    return params.sortStart;
  }

  discountAmount = Math.min(Math.max(0, discountAmount), discountBase);
  if (discountAmount <= 0) return params.sortStart;

  const hasProgram = Boolean(discount.discount_program_id);
  const pricing_source = hasProgram ? "discount_program" : discount.discount_code_id ? "discount_code" : fallbackPricingSource;
  const source_entity_type = hasProgram ? "discount_program" : discount.discount_code_id ? "discount_code" : null;
  const source_entity_id = discount.discount_program_id ?? discount.discount_code_id ?? null;
  const neg = -discountAmount;
  let sort = params.sortStart;
  const discountLabel =
    (discount.label && String(discount.label).trim()) ||
    (discount.discount_code ? `Discount (${discount.discount_code})` : "Discount");

  rows.push({
    org_id: orgId,
    job_id: jobId,
    sort_order: sort++,
    line_type: "discount",
    category_key: hasProgram ? "discount_program" : discount.discount_code_id ? "discount_code" : "promo",
    label: discountLabel,
    quantity: 1,
    unit_amount_cents: neg,
    amount_cents: neg,
    currency_code: "USD",
    pricing_source,
    source_entity_type,
    source_entity_id,
    is_system_generated: true,
    is_manual_override: false,
    is_active: true,
    metadata: metaDiscountable(false, {
      discount_code_id: discount.discount_code_id ?? null,
      discount_program_id: discount.discount_program_id ?? null,
    }),
    created_by: actorUserId ?? null,
    updated_by: actorUserId ?? null,
  });

  return sort;
}

function buildLineItems(params: InitializeJobPricingParams): JobLineItemRow[] {
  const { orgId, jobId, addons, discount, source, actorUserId } = params;
  const quoteData = params.quoteData;
  const gross = quoteData.grossFirstVisitCents != null ? Math.max(0, Math.round(quoteData.grossFirstVisitCents)) : 0;
  const mergedAddons = addons.length > 0 ? addons : parseAddonsFromQuoteOutput(quoteData.quoteOutput ?? null);
  const addonSum = mergedAddons.reduce((s, a) => s + Math.max(0, Math.round(a.priceCents)), 0);
  let serviceCents = Math.max(0, gross - addonSum);
  if (serviceCents === 0 && gross === 0 && addonSum === 0) {
    serviceCents = 0;
  }

  const rows: JobLineItemRow[] = [];
  let sort = 0;
  const pricing_source = source === "book-v2" ? "book_v2" : "admin";
  const baseMeta = { source: pricing_source };

  rows.push({
    org_id: orgId,
    job_id: jobId,
    sort_order: sort++,
    line_type: "service",
    category_key: "first_clean",
    label: quoteData.frequencyLabel ? `First cleaning (${quoteData.frequencyLabel})` : "First cleaning",
    quantity: 1,
    unit_amount_cents: serviceCents,
    amount_cents: serviceCents,
    currency_code: "USD",
    pricing_source,
    is_system_generated: true,
    is_manual_override: false,
    is_active: true,
    metadata: metaDiscountable(true, baseMeta),
    created_by: actorUserId ?? null,
    updated_by: actorUserId ?? null,
  });

  for (const a of mergedAddons) {
    const c = Math.max(0, Math.round(a.priceCents));
    if (c === 0) continue;
    rows.push({
      org_id: orgId,
      job_id: jobId,
      sort_order: sort++,
      line_type: "addon",
      category_key: a.key ?? null,
      label: a.name,
      quantity: 1,
      unit_amount_cents: c,
      amount_cents: c,
      currency_code: "USD",
      pricing_source,
      is_system_generated: true,
      is_manual_override: false,
      is_active: true,
      metadata: metaDiscountable(true, { ...baseMeta, addon_key: a.key ?? null }),
      created_by: actorUserId ?? null,
      updated_by: actorUserId ?? null,
    });
  }

  sort = appendExplicitDiscountLine(rows, {
    orgId,
    jobId,
    sortStart: sort,
    discount,
    actorUserId,
    fallbackPricingSource: pricing_source,
  });

  return rows;
}

async function emitJobPricingLockedSafe(params: {
  orgId: string;
  jobId: string;
  source: InitializeJobPricingSource;
  totals: ReturnType<typeof computeJobTotals>;
  lineCount: number;
}): Promise<void> {
  try {
    await emitEvent({
      org_id: params.orgId,
      event_type: "job_pricing_locked",
      entity_type: "job",
      entity_id: params.jobId,
      payload: {
        job_id: params.jobId,
        source: params.source,
        totals: params.totals,
        line_item_count: params.lineCount,
      },
    });
  } catch (e) {
    console.error("[initializeJobPricing] emit job_pricing_locked failed:", e);
  }
}

/**
 * Builds line items, persists totals on jobs, inserts job_line_items, snapshot, and emits job_pricing_locked.
 * Keeps legacy gross_price_cents / estimated_total_cents / recurring_total_cents aligned with line totals.
 */
export async function initializeJobPricing(params: InitializeJobPricingParams): Promise<InitializeJobPricingResult> {
  const { supabase, orgId, jobId, quoteData, source } = params;
  const skipIfActive = params.skipIfActiveLines !== false && !params.replaceExisting;
  const now = new Date().toISOString();

  if (!orgId?.trim()) {
    return { ok: false, error: "orgId is required" };
  }

  if (params.replaceExisting) {
    const { error: deactErr } = await supabase
      .from("job_line_items")
      .update({ is_active: false, updated_at: now })
      .eq("job_id", jobId)
      .eq("org_id", orgId)
      .eq("is_active", true);
    if (deactErr) {
      return { ok: false, error: `deactivate line items: ${deactErr.message}` };
    }
  }

  if (skipIfActive) {
    const { count, error: cErr } = await supabase
      .from("job_line_items")
      .select("*", { count: "exact", head: true })
      .eq("job_id", jobId)
      .eq("org_id", orgId)
      .eq("is_active", true);
    if (cErr) {
      return { ok: false, error: `job_line_items count: ${cErr.message}` };
    }
    if ((count ?? 0) > 0) {
      return { ok: true, skipped: true, lineItemCount: 0 };
    }
  }

  let lineRows: JobLineItemRow[];
  try {
    lineRows = buildLineItems(params);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "buildLineItems failed" };
  }
  const totals = computeJobTotals(lineRows);

  const gross = quoteData.grossFirstVisitCents != null ? Math.max(0, Math.round(quoteData.grossFirstVisitCents)) : null;
  const recurring =
    quoteData.recurringCents != null && Number.isFinite(quoteData.recurringCents) ? Math.round(quoteData.recurringCents) : null;

  const lockedAt = new Date().toISOString();
  const { data: jobRow, error: jobFetchErr } = await supabase
    .from("jobs")
    .select("pricing_version")
    .eq("id", jobId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (jobFetchErr) {
    return { ok: false, error: `job fetch: ${jobFetchErr.message}` };
  }
  const prevVersion = (jobRow as { pricing_version?: number } | null)?.pricing_version;
  const nextPv = typeof prevVersion === "number" && Number.isFinite(prevVersion) ? prevVersion + 1 : 1;

  const jobUpdate: Record<string, unknown> = {
    subtotal_cents: totals.subtotal_cents,
    discount_total_cents: totals.discount_total_cents,
    fee_total_cents: totals.fee_total_cents,
    adjustment_total_cents: totals.adjustment_total_cents,
    tax_total_cents: totals.tax_total_cents,
    total_cents: totals.total_cents,
    amount_due_cents: totals.total_cents,
    pricing_status: "locked",
    pricing_locked_at: lockedAt,
    pricing_version: nextPv,
    updated_at: lockedAt,
    gross_price_cents: gross ?? (totals.subtotal_cents > 0 ? totals.subtotal_cents : null),
    estimated_total_cents: totals.total_cents,
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
      snapshotType: "initial_lock",
      versionNumber: snapVer,
      summary: {
        ...totals,
        grossFirstVisitCents: gross,
        netFirstVisitCents: totals.total_cents,
        recurringCents: recurring,
        source,
      },
      lineItems: lineRows.map((r) => ({
        line_type: r.line_type,
        label: r.label,
        amount_cents: r.amount_cents,
        category_key: r.category_key ?? null,
        is_discountable: (r.metadata as Record<string, unknown> | undefined)?.is_discountable ?? null,
      })),
      reason: null,
      createdBy: params.actorUserId ?? null,
    });
  } catch (e) {
    console.error("[initializeJobPricing] snapshot failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "snapshot failed" };
  }

  await emitJobPricingLockedSafe({
    orgId,
    jobId,
    source,
    totals,
    lineCount: lineRows.length,
  });

  return { ok: true, skipped: false, lineItemCount: lineRows.length };
}
