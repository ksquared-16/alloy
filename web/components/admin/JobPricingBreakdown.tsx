"use client";

import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";
import { StatusBadge } from "@/components/admin/StatusBadge";

export type JobPricingLineItemRow = {
  id: string;
  line_type: string;
  label: string;
  description?: string | null;
  quantity: number | string | null | undefined;
  unit_amount_cents: number | null | undefined;
  amount_cents: number | null | undefined;
  pricing_source?: string | null;
  is_manual_override?: boolean | null;
  manual_override_reason?: string | null;
  metadata?: unknown;
  is_active?: boolean | null;
};

function centsNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function formatQty(q: unknown): string {
  if (q === null || q === undefined) return "1";
  const n = typeof q === "number" ? q : typeof q === "string" ? parseFloat(q) : NaN;
  if (!Number.isFinite(n)) return String(q);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

function lineTypeBadgeClass(lineType: string): string {
  const t = String(lineType || "").toLowerCase();
  const base = "inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide";
  if (t === "discount") return `${base} bg-red-50 text-red-800 border border-red-200/80`;
  if (t === "tax") return `${base} bg-violet-50 text-violet-900 border border-violet-200/80`;
  if (t === "fee") return `${base} bg-slate-100 text-slate-800 border border-slate-200`;
  if (t === "addon") return `${base} bg-sky-50 text-sky-900 border border-sky-200/80`;
  if (t === "adjustment") return `${base} bg-amber-50 text-amber-900 border border-amber-200/70`;
  return `${base} bg-alloy-stone/40 text-alloy-forge border border-admin-border`;
}

function humanizePricingStatus(s: string | null | undefined): string {
  const t = String(s ?? "").trim().toLowerCase();
  if (!t) return "—";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function JobPricingBreakdown({ record }: { record: Record<string, unknown> | null | undefined }) {
  const r = record ?? {};
  const linesRaw = r._job_line_items;
  const lines: JobPricingLineItemRow[] = Array.isArray(linesRaw) ? (linesRaw as JobPricingLineItemRow[]) : [];

  const subtotal = centsNum(r.subtotal_cents);
  const discountTotal = centsNum(r.discount_total_cents);
  const feeTotal = centsNum(r.fee_total_cents);
  const adjustmentTotal = centsNum(r.adjustment_total_cents);
  const taxTotal = centsNum(r.tax_total_cents);
  const total = centsNum(r.total_cents);

  const pricingStatus = r.pricing_status != null ? String(r.pricing_status) : null;
  const pricingLockedAt = r.pricing_locked_at != null ? String(r.pricing_locked_at) : null;
  const pricingVersion = r.pricing_version;

  const hasOverrideLine = lines.some(
    (li) =>
      li.is_manual_override === true ||
      (li.manual_override_reason != null && String(li.manual_override_reason).trim() !== "")
  );
  const overrideReasons = [
    ...new Set(
      lines
        .map((li) => (li.manual_override_reason != null ? String(li.manual_override_reason).trim() : ""))
        .filter(Boolean)
    ),
  ];

  const rowClass = "flex justify-between gap-3 text-sm";
  const labelMuted = "text-alloy-midnight/65";
  const valueStrong = "font-medium text-alloy-forge tabular-nums text-right";

  return (
    <div className="space-y-4 md:col-span-2 w-full">
      {hasOverrideLine && (
        <div className="rounded border border-amber-200 bg-amber-50/90 px-2.5 py-2 text-xs text-amber-950">
          <p className="font-semibold">Pricing was manually overridden</p>
          {overrideReasons.length > 0 ? (
            <p className="mt-1 text-amber-900/90 leading-snug">{overrideReasons.join(" · ")}</p>
          ) : null}
        </div>
      )}

      <div className="rounded border border-admin-border bg-white/60 px-3 py-2.5 space-y-1.5">
        <p className="text-[10px] font-semibold tracking-wider text-alloy-forge/80 mb-1">Summary (from job)</p>
        <div className={rowClass}>
          <span className={labelMuted}>Subtotal</span>
          <span className={valueStrong}>{subtotal != null ? formatMoneyFromCents(subtotal) : "—"}</span>
        </div>
        <div className={rowClass}>
          <span className={labelMuted}>Discounts</span>
          <span className={`${valueStrong} text-red-700`}>
            {discountTotal != null && discountTotal !== 0
              ? `−${formatMoneyFromCents(Math.abs(discountTotal))}`
              : discountTotal === 0
                ? formatMoneyFromCents(0)
                : "—"}
          </span>
        </div>
        <div className={rowClass}>
          <span className={labelMuted}>Fees</span>
          <span className={`${valueStrong} text-slate-800`}>{feeTotal != null ? formatMoneyFromCents(feeTotal) : "—"}</span>
        </div>
        <div className={rowClass}>
          <span className={labelMuted}>Adjustments</span>
          <span className={valueStrong}>{adjustmentTotal != null ? formatMoneyFromCents(adjustmentTotal) : "—"}</span>
        </div>
        <div className={rowClass}>
          <span className={labelMuted}>Tax</span>
          <span className={`${valueStrong} text-violet-900`}>{taxTotal != null ? formatMoneyFromCents(taxTotal) : "—"}</span>
        </div>
        <div className={`${rowClass} border-t border-admin-border pt-2 mt-2`}>
          <span className="text-sm font-semibold text-alloy-forge">Total</span>
          <span className="text-sm font-semibold text-alloy-forge tabular-nums text-right">
            {total != null ? formatMoneyFromCents(total) : "—"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={labelMuted}>Status</span>
        {pricingStatus ? (
          <StatusBadge label={humanizePricingStatus(pricingStatus)} variant="default" />
        ) : (
          <span className="text-alloy-forge">—</span>
        )}
        <span className="text-alloy-midnight/40">·</span>
        <span className={labelMuted}>Locked</span>
        <span className="text-alloy-forge">{pricingLockedAt ? formatDateTime(pricingLockedAt) : "—"}</span>
        <span className="text-alloy-midnight/40">·</span>
        <span className={labelMuted}>Version</span>
        <span className="text-alloy-forge font-mono">{pricingVersion != null ? String(pricingVersion) : "—"}</span>
      </div>

      <div>
        <p className="text-[10px] font-semibold tracking-wider text-alloy-forge/80 mb-2">Line items (active)</p>
        {lines.length === 0 ? (
          <p className="text-sm text-alloy-midnight/60">No active line items on file.</p>
        ) : (
          <ul className="divide-y divide-admin-border rounded border border-admin-border bg-white/40">
            {lines.map((li) => {
              const amt = centsNum(li.amount_cents);
              const unit = centsNum(li.unit_amount_cents);
              const qty = formatQty(li.quantity);
              const lt = String(li.line_type || "line");
              return (
                <li key={li.id} className="flex flex-col gap-1 px-2.5 py-2 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-alloy-forge truncate">{li.label || "—"}</span>
                      <span className={lineTypeBadgeClass(lt)}>{lt}</span>
                      {li.is_manual_override ? (
                        <span className="text-[10px] font-semibold text-amber-800">Override</span>
                      ) : null}
                    </div>
                    {li.description ? (
                      <p className="text-xs text-alloy-midnight/60 leading-snug">{String(li.description)}</p>
                    ) : null}
                    <p className="text-xs text-alloy-midnight/55">
                      {qty} × {unit != null ? formatMoneyFromCents(unit) : "—"}
                      {li.pricing_source ? <span className="ml-1">· {String(li.pricing_source)}</span> : null}
                    </p>
                  </div>
                  <div
                    className={`shrink-0 font-medium tabular-nums sm:text-right ${
                      lt === "discount" ? "text-red-700" : lt === "tax" ? "text-violet-900" : lt === "fee" ? "text-slate-800" : "text-alloy-forge"
                    }`}
                  >
                    {amt != null ? formatMoneyFromCents(amt) : "—"}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-alloy-midnight/50">
        Totals and lines are stored on the job; this view does not recalculate pricing.
      </p>
      <button
        type="button"
        disabled
        className="mt-1 text-left text-xs text-alloy-midnight/40 cursor-not-allowed"
        title="Not available yet"
      >
        Adjust pricing from admin…
      </button>
    </div>
  );
}
