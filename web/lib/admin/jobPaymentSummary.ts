/**
 * Job-level payment summary derived from payments rows (not job status).
 * Aligns with payment-collect-context: "paid" = paid_at set OR status key paid/succeeded.
 */

export type JobPaymentStatusKey = "unpaid" | "partial" | "paid" | "failed";

export type PaymentRowLike = {
  amount_cents?: number | null;
  paid_at?: string | null;
  status_key?: string | null;
  payment_statuses?: { key?: string | null } | null;
};

/** Canonical display key for a single payment row (avoids stale "pending" when paid_at is set). */
export function effectivePaymentRowStatusKey(row: PaymentRowLike): "paid" | "failed" | "pending" | string {
  const paidAt = row.paid_at != null && String(row.paid_at).trim() !== "";
  if (paidAt) return "paid";
  const fromNested = row.payment_statuses?.key != null ? String(row.payment_statuses.key).trim().toLowerCase() : "";
  const sk = (row.status_key != null ? String(row.status_key) : "").trim().toLowerCase();
  const k = fromNested || sk;
  if (k === "paid" || k === "succeeded" || k === "complete" || k === "completed") return "paid";
  if (k === "failed") return "failed";
  if (k) return k;
  return "pending";
}

export function isPaymentRowPaid(row: PaymentRowLike): boolean {
  return effectivePaymentRowStatusKey(row) === "paid";
}

export function isPaymentRowFailed(row: PaymentRowLike): boolean {
  return effectivePaymentRowStatusKey(row) === "failed";
}

/** Sum amount_cents for rows that count as successfully paid. */
export function sumPaidAmountCents(rows: PaymentRowLike[]): number {
  let t = 0;
  for (const row of rows) {
    if (!isPaymentRowPaid(row)) continue;
    const n = row.amount_cents;
    if (typeof n === "number" && Number.isFinite(n) && n > 0) t += Math.round(n);
  }
  return t;
}

export type JobPaymentSummary = {
  original_amount_cents: number | null;
  paid_amount_cents: number;
  /** Null when job original total is unknown; else max(0, original - paid). */
  balance_due_cents: number | null;
  payment_status_key: JobPaymentStatusKey;
};

/**
 * @param originalAmountCents — display total for the job (e.g. computeJobDisplayTotalCents), or null
 */
export function computeJobPaymentSummary(originalAmountCents: number | null, rows: PaymentRowLike[]): JobPaymentSummary {
  const paid_amount_cents = sumPaidAmountCents(rows);
  const balance_due_cents =
    originalAmountCents != null && Number.isFinite(originalAmountCents) && originalAmountCents > 0
      ? Math.max(0, Math.round(originalAmountCents) - paid_amount_cents)
      : null;

  const hasRows = rows.length > 0;
  const anyPaid = paid_amount_cents > 0;
  const allFailed =
    hasRows &&
    rows.every((r) => {
      const st = effectivePaymentRowStatusKey(r);
      return st === "failed";
    });

  let payment_status_key: JobPaymentStatusKey;
  if (allFailed && !anyPaid) {
    payment_status_key = "failed";
  } else if (!anyPaid) {
    payment_status_key = "unpaid";
  } else if (balance_due_cents != null && balance_due_cents > 0) {
    payment_status_key = "partial";
  } else if (balance_due_cents != null && balance_due_cents <= 0 && originalAmountCents != null && originalAmountCents > 0) {
    payment_status_key = "paid";
  } else {
    payment_status_key = "partial";
  }

  return {
    original_amount_cents:
      originalAmountCents != null && Number.isFinite(originalAmountCents) && originalAmountCents > 0
        ? Math.round(originalAmountCents)
        : null,
    paid_amount_cents,
    balance_due_cents,
    payment_status_key,
  };
}

export function jobPaymentStatusKeyLabel(key: JobPaymentStatusKey): string {
  switch (key) {
    case "unpaid":
      return "Unpaid";
    case "partial":
      return "Partially paid";
    case "paid":
      return "Paid in full";
    case "failed":
      return "Payment failed";
    default:
      return key;
  }
}
