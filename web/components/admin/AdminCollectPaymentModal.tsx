"use client";

import { useEffect, useMemo, useState } from "react";
import { AD_HOC_CHARGE_TYPE_OPTIONS } from "@/lib/admin/adHocChargeTypes";
import { adminPaymentRunFeedback } from "@/lib/admin/paymentRunFeedback";

export type AdminCollectPaymentModalContext = {
  /** Job that will be charged (parent job when opened from a schedule). */
  jobId: string;
  jobLabel?: string;
  /** When opened from a schedule drawer. */
  scheduleId?: string | null;
  scheduleLabel?: string;
  /** Pre-fill amount (cents); empty field = backend default. */
  suggestedAmountCents?: number | null;
};

type PaymentTarget = "job" | "schedule" | "adhoc";

type CardMode = "on_file" | "new_card";

export function AdminCollectPaymentModal({
  isOpen,
  onClose,
  context,
  disabled,
  onAfterRun,
  onPaymentOutcome,
}: {
  isOpen: boolean;
  onClose: () => void;
  context: AdminCollectPaymentModalContext | null;
  disabled?: boolean;
  onAfterRun: (jobId: string, scheduleId: string | null) => void;
  onPaymentOutcome?: (outcome: { type: "success" | "error"; message: string }) => void;
}) {
  const [target, setTarget] = useState<PaymentTarget>("job");
  const [cardMode, setCardMode] = useState<CardMode>("on_file");
  const [amountDollars, setAmountDollars] = useState("");
  const [adhocChargeType, setAdhocChargeType] = useState(AD_HOC_CHARGE_TYPE_OPTIONS[0]?.value ?? "other");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const hasSchedule = !!(context?.scheduleId && context.scheduleId.trim());

  useEffect(() => {
    if (!isOpen || !context) return;
    setTarget(hasSchedule ? "schedule" : "job");
    setCardMode("on_file");
    setFeedback(null);
    const cents = context.suggestedAmountCents;
    if (cents != null && Number.isFinite(cents) && cents > 0) {
      setAmountDollars((cents / 100).toFixed(2));
    } else {
      setAmountDollars("");
    }
    setAdhocChargeType(AD_HOC_CHARGE_TYPE_OPTIONS[0]?.value ?? "other");
  }, [isOpen, context, hasSchedule]);

  const effectiveJobId = context?.jobId ?? "";

  const amountCentsPayload = useMemo(() => {
    const t = amountDollars.trim();
    if (!t) return undefined;
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.round(n * 100);
  }, [amountDollars]);

  const canSubmit = !!effectiveJobId && !submitting && !disabled && cardMode === "on_file";

  if (!isOpen || !context) return null;

  const runPayment = async () => {
    if (!effectiveJobId || !canSubmit) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const body: Record<string, unknown> = { job_id: effectiveJobId };
      if (amountCentsPayload != null) body.amount_cents = amountCentsPayload;
      if (target === "adhoc") {
        body.ad_hoc_charge_type = adhocChargeType;
        body.payment_target = "ad_hoc";
      } else if (target === "schedule" && context.scheduleId) {
        body.payment_target = "schedule";
        body.schedule_id = context.scheduleId;
      } else {
        body.payment_target = "job";
      }

      const res = await fetch("/api/admin/payments/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (res.status === 409) {
        const msg = (typeof json.error === "string" && json.error) || "Job already has a paid payment";
        setFeedback({ type: "error", message: msg });
        onPaymentOutcome?.({ type: "error", message: msg });
        onAfterRun(effectiveJobId, target === "schedule" ? context.scheduleId ?? null : null);
        return;
      }

      const fb = adminPaymentRunFeedback(json, res.ok);
      const line: { type: "success" | "error"; message: string } = { type: fb.ok ? "success" : "error", message: fb.message };
      setFeedback(line);
      onPaymentOutcome?.(line);
      onAfterRun(effectiveJobId, target === "schedule" ? context.scheduleId ?? null : null);
    } catch (e) {
      const line = { type: "error" as const, message: (e as Error).message };
      setFeedback(line);
      onPaymentOutcome?.(line);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-collect-payment-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg border border-alloy-stone/30 p-5 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="admin-collect-payment-title" className="text-base font-semibold text-alloy-midnight mb-1">
          Collect payment
        </h3>
        <p className="text-sm text-alloy-midnight/70 mb-4">
          Charge uses the customer&apos;s saved card on file via the existing payment run. Leave amount blank to use the backend default for this job.
        </p>

        <div className="space-y-4 text-sm">
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-alloy-forge/90 mb-2">Apply payment to</span>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="pay-target" checked={target === "job"} onChange={() => setTarget("job")} />
                <span>
                  This job{context.jobLabel ? ` — ${context.jobLabel}` : ""}
                </span>
              </label>
              {hasSchedule && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="pay-target" checked={target === "schedule"} onChange={() => setTarget("schedule")} />
                  <span>
                    This schedule{context.scheduleLabel ? ` — ${context.scheduleLabel}` : ""}{" "}
                    <span className="text-alloy-midnight/60">(charges parent job)</span>
                  </span>
                </label>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="pay-target" checked={target === "adhoc"} onChange={() => setTarget("adhoc")} />
                <span>Ad hoc charge (same job; category recorded for reporting)</span>
              </label>
            </div>
          </div>

          {target === "adhoc" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-alloy-forge/90 mb-1">Charge type / reason</label>
              <select
                value={adhocChargeType}
                onChange={(e) => setAdhocChargeType(e.target.value)}
                className="w-full px-2 py-2 border border-alloy-stone/40 rounded text-sm"
              >
                {AD_HOC_CHARGE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-alloy-midnight/55 mt-1">
                Sent to the API as metadata for future ledger mapping; charging still targets this job today.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-alloy-forge/90 mb-1">Amount (USD)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Default from job"
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
              className="w-full px-2 py-2 border border-alloy-stone/40 rounded text-sm"
            />
          </div>

          <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-alloy-forge/90 mb-2">Payment method</span>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="card-mode" checked={cardMode === "on_file"} onChange={() => setCardMode("on_file")} />
                <span>Use card on file</span>
              </label>
              <label className={`flex items-start gap-2 ${disabled ? "opacity-50" : ""}`}>
                <input
                  type="radio"
                  name="card-mode"
                  checked={cardMode === "new_card"}
                  onChange={() => setCardMode("new_card")}
                  disabled={disabled}
                />
                <span>
                  Enter new card
                  <span className="block text-xs text-alloy-midnight/55 mt-0.5">
                    Not wired for admin yet — use card on file, or customer-facing booking to add a card. Stripe SetupIntent flow can plug in here next.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {feedback && (
            <div
              className={`rounded-md px-3 py-2 text-sm ${
                feedback.type === "success" ? "bg-alloy-juniper/15 text-alloy-midnight" : "bg-alloy-ember/10 text-alloy-ember"
              }`}
              role="status"
            >
              {feedback.message}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-sm border border-alloy-stone/40 rounded hover:bg-alloy-stone/20 disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void runPayment()}
            disabled={!canSubmit}
            className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Processing…" : "Charge"}
          </button>
        </div>
      </div>
    </div>
  );
}
