"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeCardElement } from "@stripe/stripe-js";
import { AD_HOC_CHARGE_TYPE_OPTIONS } from "@/lib/admin/adHocChargeTypes";
import { adminPaymentRunFeedback } from "@/lib/admin/paymentRunFeedback";
import { JobReceivableChargesPanel, jobTotalSummaryLabel } from "@/components/admin/JobReceivableChargesPanel";
import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";
import type { JobChargeBalanceRow } from "@/lib/admin/jobPaymentBalances";

export type AdminCollectPaymentModalContext = {
  jobId: string;
  scheduleId?: string | null;
  jobLabel?: string;
  scheduleLabel?: string;
};

type PaymentTarget = "job" | "adhoc";

type CardMode = "on_file" | "new_card";

type CollectApiJob = {
  original_cents: number | null;
  paid_cents: number;
  balance_cents: number;
  job_total_cents?: number | null;
  pending_payment_amount_cents?: number;
  receivable_source?: "charges" | "legacy_job" | null;
  open_charge_count?: number | null;
  charge_balance_rows?: JobChargeBalanceRow[] | null;
};

/** Informational when modal opened from a schedule row; payment still runs at job scope. */
type CollectApiScheduleContext = {
  visit_start_at: string | null;
  list_price_cents: number | null;
  /** Present when API includes visit-linked charge count (older responses may omit). */
  linked_charge_count?: number;
};

type CollectApiResponse = {
  job: CollectApiJob;
  schedule_context: CollectApiScheduleContext | null;
  customer: {
    id: string;
    stripe_customer_id: string | null;
    default_payment_method_id: string | null;
    payment_method_brand: string | null;
    payment_method_last4: string | null;
  } | null;
  saved_card_label: string | null;
  paid_attribution: "job";
};

function money(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return formatMoneyFromCents(Math.max(0, Math.round(cents)));
}

function defaultCentsForTarget(target: PaymentTarget, data: CollectApiResponse | null): number | null {
  if (!data || target === "adhoc") return null;
  if (data.job.balance_cents > 0) return data.job.balance_cents;
  const jobTotal = data.job.job_total_cents ?? data.job.original_cents;
  if (jobTotal != null && jobTotal > 0) return jobTotal;
  return 0;
}

export function AdminCollectPaymentModal({
  isOpen,
  onClose,
  context,
  disabled,
  onAfterRun,
  onPaymentOutcome,
  /** Increment after a successful charge so the modal refetches payment-collect-context while still open. */
  contextRefreshKey,
}: {
  isOpen: boolean;
  onClose: () => void;
  context: AdminCollectPaymentModalContext | null;
  disabled?: boolean;
  onAfterRun: (jobId: string, scheduleId: string | null) => void;
  onPaymentOutcome?: (outcome: { type: "success" | "error"; message: string }) => void;
  contextRefreshKey?: number;
}) {
  const [collect, setCollect] = useState<CollectApiResponse | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [ctxError, setCtxError] = useState<string | null>(null);

  const [target, setTarget] = useState<PaymentTarget>("job");
  const [cardMode, setCardMode] = useState<CardMode>("on_file");
  const [savePaymentMethod, setSavePaymentMethod] = useState(true);
  const [amountDollars, setAmountDollars] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [adhocChargeType, setAdhocChargeType] = useState(AD_HOC_CHARGE_TYPE_OPTIONS[0]?.value ?? "other");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [cardEl, setCardEl] = useState<StripeCardElement | null>(null);
  const cardMountRef = useRef<HTMLDivElement>(null);
  /** Prevents overlapping charges if the button is double-clicked before React re-renders. */
  const paymentInFlightRef = useRef(false);

  const runAfterPaymentSideEffects = useCallback(
    (jobId: string, scheduleId: string | null) => {
      queueMicrotask(() => {
        console.log("[CollectPayment] onAfterRun start", { jobId: jobId.slice(0, 8), scheduleId: scheduleId?.slice(0, 8) ?? null });
        try {
          onAfterRun(jobId, scheduleId);
        } finally {
          console.log("[CollectPayment] onAfterRun end");
        }
      });
    },
    [onAfterRun]
  );

  const hasSchedule = !!(context?.scheduleId && context.scheduleId.trim());
  const effectiveJobId = context?.jobId ?? "";

  const applyDefaultAmount = useCallback(
    (t: PaymentTarget, data: CollectApiResponse | null) => {
      if (amountTouched) return;
      const c = defaultCentsForTarget(t, data);
      if (c != null && c >= 0) setAmountDollars(c === 0 ? "" : (c / 100).toFixed(2));
      else setAmountDollars("");
    },
    [amountTouched]
  );

  useEffect(() => {
    if (!isOpen || !context?.jobId) {
      setCollect(null);
      setCtxError(null);
      setCtxLoading(false);
      return;
    }
    let cancelled = false;
    setCtxLoading(true);
    setCtxError(null);
    const q = context.scheduleId?.trim()
      ? `?schedule_id=${encodeURIComponent(context.scheduleId.trim())}`
      : "";
    fetch(`/api/admin/jobs/${context.jobId}/payment-collect-context${q}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (cancelled) return;
        if (!ok) throw new Error((j as { error?: string }).error ?? "Failed to load payment context");
        setCollect(j as CollectApiResponse);
      })
      .catch((e) => {
        if (!cancelled) {
          setCollect(null);
          setCtxError((e as Error).message);
        }
      })
      .finally(() => {
        if (!cancelled) setCtxLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, context?.jobId, context?.scheduleId, contextRefreshKey]);

  useEffect(() => {
    if (!isOpen || !context) return;
    setTarget("job");
    setCardMode("on_file");
    setSavePaymentMethod(true);
    setFeedback(null);
    setAmountTouched(false);
    setAdhocChargeType(AD_HOC_CHARGE_TYPE_OPTIONS[0]?.value ?? "other");
  }, [isOpen, context]);

  useEffect(() => {
    if (!isOpen || !collect || amountTouched) return;
    applyDefaultAmount(target, collect);
  }, [isOpen, collect, target, amountTouched, applyDefaultAmount]);

  /** Load Stripe.js whenever the modal is open so 3DS / requires_action works for saved-card charges too. */
  useEffect(() => {
    if (!isOpen) {
      setStripe(null);
      setCardEl(null);
      return;
    }
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE?.trim();
    if (!pk) return;
    let cancelled = false;
    void (async () => {
      const s = await loadStripe(pk);
      if (cancelled || !s) return;
      setStripe(s);
    })();
    return () => {
      cancelled = true;
      setStripe(null);
      setCardEl(null);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!stripe || cardMode !== "new_card" || !isOpen) return;
    const el = stripe.elements().create("card", {
      style: {
        base: { fontSize: "16px", color: "#1a1a1a", "::placeholder": { color: "#9ca3af" } },
        invalid: { color: "#ef4444" },
      },
    });
    setCardEl(el);
    return () => {
      try {
        el.unmount();
        el.destroy();
      } catch {
        /* ignore */
      }
      setCardEl(null);
    };
  }, [stripe, cardMode, isOpen]);

  useEffect(() => {
    if (!cardEl || !cardMountRef.current || cardMode !== "new_card") return;
    const node = cardMountRef.current;
    if (node.childElementCount > 0) return;
    cardEl.mount(node);
    return () => {
      try {
        cardEl.unmount();
      } catch {
        /* ignore */
      }
    };
  }, [cardEl, cardMode]);

  const amountCentsPayload = useMemo(() => {
    const t = amountDollars.trim();
    if (!t) return undefined;
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.round(n * 100);
  }, [amountDollars]);

  const hasStripeCustomer = !!collect?.customer?.stripe_customer_id;

  const adhocValid = target !== "adhoc" || (!!adhocChargeType && amountCentsPayload != null && amountCentsPayload > 0);

  const canSubmitSaved =
    !!effectiveJobId &&
    !submitting &&
    !disabled &&
    cardMode === "on_file" &&
    adhocValid &&
    !ctxLoading &&
    !ctxError;

  const canSubmitNew =
    !!effectiveJobId &&
    !submitting &&
    !disabled &&
    cardMode === "new_card" &&
    adhocValid &&
    stripe &&
    cardEl &&
    hasStripeCustomer &&
    !ctxLoading &&
    !ctxError;

  const canSubmit = canSubmitSaved || canSubmitNew;

  const runPayment = async () => {
    if (paymentInFlightRef.current) {
      console.warn("[CollectPayment] ignored duplicate submit (in-flight)");
      return;
    }
    if (!effectiveJobId || !canSubmit) return;
    paymentInFlightRef.current = true;
    const traceId = crypto.randomUUID().slice(0, 8);
    const afterScheduleId = context?.scheduleId?.trim() ? context.scheduleId.trim() : null;
    console.log("[CollectPayment] charge start", {
      traceId,
      jobId: effectiveJobId.slice(0, 8),
      cardMode,
      target,
    });
    setSubmitting(true);
    setFeedback(null);
    try {
      let paymentMethodId: string | undefined;
      if (cardMode === "new_card" && stripe && cardEl) {
        const { error: pmErr, paymentMethod } = await stripe.createPaymentMethod({
          type: "card",
          card: cardEl,
        });
        if (pmErr || !paymentMethod?.id) {
          const line = { type: "error" as const, message: pmErr?.message ?? "Could not read card" };
          setFeedback(line);
          onPaymentOutcome?.(line);
          console.log("[CollectPayment] new card PM error, abort", { traceId });
          return;
        }
        paymentMethodId = paymentMethod.id;
      }

      const body: Record<string, unknown> = { job_id: effectiveJobId };
      if (amountCentsPayload != null) body.amount_cents = amountCentsPayload;
      if (target === "adhoc") {
        body.ad_hoc_charge_type = adhocChargeType;
        body.payment_target = "ad_hoc";
      } else {
        body.payment_target = "job";
        const sid = context?.scheduleId?.trim();
        if (sid) body.schedule_id = sid;
      }
      if (paymentMethodId) {
        body.payment_method_id = paymentMethodId;
        body.save_payment_method = savePaymentMethod;
      }
      const idempotencyKey = crypto.randomUUID();
      body.idempotency_key = idempotencyKey;

      console.log("[CollectPayment] request sent", {
        traceId,
        idempotencyKey: idempotencyKey.slice(0, 8) + "…",
        cardMode,
        target,
        amount_cents: body.amount_cents,
      });
      const res = await fetch("/api/admin/payments/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      console.log("[CollectPayment] response received", {
        traceId,
        httpStatus: res.status,
        ok: json.ok,
        requires_action: json.requires_action,
      });

      if (json.requires_action === true && typeof json.client_secret === "string") {
        if (!stripe) {
          const line = {
            type: "error" as const,
            message: "This payment needs authentication but Stripe.js is not loaded. Check NEXT_PUBLIC_STRIPE_PUBLISHABLE.",
          };
          setFeedback(line);
          onPaymentOutcome?.(line);
          runAfterPaymentSideEffects(effectiveJobId, afterScheduleId);
          return;
        }
        const { error: cErr, paymentIntent } = await stripe.confirmCardPayment(json.client_secret as string);
        if (cErr) {
          const line = { type: "error" as const, message: cErr.message ?? "Authentication failed" };
          setFeedback(line);
          onPaymentOutcome?.(line);
          runAfterPaymentSideEffects(effectiveJobId, afterScheduleId);
          return;
        }
        if (paymentIntent?.status === "succeeded") {
          const amt = paymentIntent.amount ?? amountCentsPayload;
          const parts = ["Payment succeeded"];
          if (typeof amt === "number" && Number.isFinite(amt)) parts.push(formatMoneyFromCents(amt));
          const line = { type: "success" as const, message: parts.join(" · ") };
          setFeedback(line);
          onPaymentOutcome?.(line);
          console.log("[CollectPayment] 3DS success, scheduling refresh", { traceId });
          runAfterPaymentSideEffects(effectiveJobId, afterScheduleId);
          return;
        } else {
          const line = {
            type: "error" as const,
            message: `Payment status: ${paymentIntent?.status ?? "unknown"}`,
          };
          setFeedback(line);
          onPaymentOutcome?.(line);
          runAfterPaymentSideEffects(effectiveJobId, afterScheduleId);
          return;
        }
      }

      if (res.status === 409) {
        const msg = (typeof json.error === "string" && json.error) || "Request conflict";
        setFeedback({ type: "error", message: msg });
        onPaymentOutcome?.({ type: "error", message: msg });
        runAfterPaymentSideEffects(effectiveJobId, afterScheduleId);
        return;
      }

      const fb = adminPaymentRunFeedback(json, res.ok && json.ok === true);
      const line: { type: "success" | "error"; message: string } = { type: fb.ok ? "success" : "error", message: fb.message };
      setFeedback(line);
      onPaymentOutcome?.(line);
      console.log("[CollectPayment] outcome set, scheduling refresh", { traceId, fbOk: fb.ok });
      runAfterPaymentSideEffects(effectiveJobId, afterScheduleId);
    } catch (e) {
      const line = { type: "error" as const, message: (e as Error).message };
      setFeedback(line);
      onPaymentOutcome?.(line);
      console.log("[CollectPayment] error", { traceId, message: line.message });
    } finally {
      paymentInFlightRef.current = false;
      setSubmitting(false);
      console.log("[CollectPayment] processing cleared", { traceId });
    }
  };

  const onTargetChange = (next: PaymentTarget) => {
    setTarget(next);
  };

  const scheduleContextLine = useMemo(() => {
    if (!hasSchedule || !collect) return null;
    const sc = collect.schedule_context;
    const visit =
      (context?.scheduleLabel && String(context.scheduleLabel).trim()) ||
      (sc?.visit_start_at ? formatDateTime(String(sc.visit_start_at)) : null);
    const price =
      sc?.list_price_cents != null && Number.isFinite(sc.list_price_cents) && sc.list_price_cents > 0
        ? money(sc.list_price_cents)
        : null;
    const linked =
      sc && typeof sc.linked_charge_count === "number"
        ? sc.linked_charge_count
        : null;
    const parts: string[] = [];
    parts.push(`Opened from visit ${visit ?? "—"}`);
    if (price) parts.push(`visit list price ${price}`);
    if (linked != null) {
      parts.push(
        linked === 0
          ? "no receivable rows linked to this visit yet (charges may be job-level only)"
          : `${linked} receivable row${linked === 1 ? "" : "s"} linked to this visit (highlighted below)`
      );
    }
    return parts.join(" · ");
  }, [hasSchedule, collect, context?.scheduleLabel]);

  if (!isOpen || !context) return null;

  const savedCardDescription =
    collect?.saved_card_label ??
    (hasStripeCustomer ? "Saved card on file" : "No saved card on file");

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-add-payment-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-alloy-stone/25 p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="admin-add-payment-title" className="text-lg font-semibold text-alloy-midnight tracking-tight">
          Add payment
        </h3>
        {context.jobLabel ? (
          <p className="text-sm font-medium text-alloy-forge/90 mt-0.5">{context.jobLabel}</p>
        ) : null}
        <p className="text-sm text-alloy-midnight/65 mt-2 leading-relaxed">
          {collect?.job.receivable_source === "charges"
            ? "Balances are driven by receivable charges on this job (listed below). The amount you enter is collected on the customer’s card; the server applies it to open charge balances (not a manual per-charge picker yet)."
            : "This job is still on legacy pricing totals until receivable charges exist. Payment posts to the job; Stripe uses the customer’s profile."}
        </p>

        {scheduleContextLine ? (
          <p className="text-xs text-alloy-midnight/50 mt-3 leading-snug border-l-2 border-alloy-stone/40 pl-2.5">
            {scheduleContextLine}
          </p>
        ) : null}

        {ctxLoading && <p className="text-sm text-alloy-midnight/60 mt-4">Loading payment details…</p>}
        {ctxError && (
          <div className="text-sm text-alloy-ember mt-4 rounded-lg border border-alloy-ember/25 bg-alloy-ember/5 px-3 py-2">
            {ctxError}
          </div>
        )}

        <div className="space-y-5 text-sm mt-4">
          {collect && (
            <div className="rounded-lg border border-alloy-stone/35 bg-gradient-to-b from-alloy-stone/5 to-transparent px-4 py-3 space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-alloy-forge/75">Receivables summary</p>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-alloy-midnight/65">{jobTotalSummaryLabel(collect.job.receivable_source ?? undefined)}</span>
                <span className="font-medium tabular-nums">{money(collect.job.job_total_cents ?? collect.job.original_cents)}</span>
              </div>
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-alloy-midnight/65">Paid (posted)</span>
                <span className="font-medium tabular-nums">{money(collect.job.paid_cents)}</span>
              </div>
              <div className="flex justify-between gap-3 text-sm pt-0.5 border-t border-alloy-stone/25">
                <span className="text-alloy-midnight/80 font-medium">Outstanding</span>
                <span className="font-semibold text-alloy-midnight tabular-nums">{money(collect.job.balance_cents)}</span>
              </div>
              {(collect.job.pending_payment_amount_cents ?? 0) > 0 ? (
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-alloy-midnight/65">Pending (authorized)</span>
                  <span className="font-medium tabular-nums text-alloy-midnight/85">{money(collect.job.pending_payment_amount_cents)}</span>
                </div>
              ) : null}
            </div>
          )}
          {collect ? (
            <JobReceivableChargesPanel
              receivableSource={collect.job.receivable_source ?? undefined}
              chargeRows={collect.job.charge_balance_rows}
              openChargeCount={collect.job.open_charge_count ?? undefined}
              contextScheduleId={hasSchedule ? context?.scheduleId?.trim() ?? null : null}
              compact
              className="mt-3"
            />
          ) : null}

          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-alloy-forge/75 mb-2">
              Charge type
            </span>
            <div className="space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer rounded-md px-1 py-0.5 -mx-1 hover:bg-alloy-stone/10">
                <input
                  type="radio"
                  name="pay-target"
                  checked={target === "job"}
                  onChange={() => onTargetChange("job")}
                  className="mt-0.5"
                />
                <span className="leading-snug">
                  Pay toward job balance{collect ? ` · outstanding ${money(collect.job.balance_cents)}` : ""}
                  {collect?.job.receivable_source === "charges" ? (
                    <span className="block text-[11px] text-alloy-midnight/50 font-normal mt-0.5">
                      Allocations are applied by the server across open charges.
                    </span>
                  ) : null}
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer rounded-md px-1 py-0.5 -mx-1 hover:bg-alloy-stone/10">
                <input
                  type="radio"
                  name="pay-target"
                  checked={target === "adhoc"}
                  onChange={() => onTargetChange("adhoc")}
                  className="mt-0.5"
                />
                <span className="leading-snug">Ad hoc amount (category required)</span>
              </label>
            </div>
          </div>

          {target === "adhoc" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-alloy-forge/90 mb-1">
                Charge type / reason <span className="text-alloy-ember">*</span>
              </label>
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
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-alloy-forge/90 mb-1">
              Amount (USD)
              {target === "adhoc" && <span className="text-alloy-ember"> *</span>}
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder={target === "adhoc" ? "Required" : "Balance due (or override)"}
              value={amountDollars}
              onChange={(e) => {
                setAmountTouched(true);
                setAmountDollars(e.target.value);
              }}
              className="w-full px-2 py-2 border border-alloy-stone/40 rounded text-sm"
            />
          </div>

          <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-alloy-forge/90 mb-2">
              Payment method
            </span>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="card-mode"
                  checked={cardMode === "on_file"}
                  onChange={() => setCardMode("on_file")}
                  className="mt-1"
                  disabled={!hasStripeCustomer}
                />
                <span>
                  Use saved card{collect?.saved_card_label ? ` — ${collect.saved_card_label}` : ` — ${savedCardDescription}`}
                  {!hasStripeCustomer && (
                    <span className="block text-xs text-alloy-ember mt-0.5">Customer needs a Stripe customer id to charge.</span>
                  )}
                </span>
              </label>
              <label className={`flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`}>
                <span className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="card-mode"
                    checked={cardMode === "new_card"}
                    onChange={() => setCardMode("new_card")}
                    disabled={disabled || !hasStripeCustomer}
                    className="mt-1"
                  />
                  <span>
                    Enter new card
                    {!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE?.trim() && (
                      <span className="block text-xs text-alloy-ember mt-0.5">NEXT_PUBLIC_STRIPE_PUBLISHABLE is not set.</span>
                    )}
                  </span>
                </span>
                {cardMode === "new_card" && hasStripeCustomer && (
                  <>
                    <div ref={cardMountRef} className="w-full min-h-[44px] px-2 py-2 border border-alloy-stone/40 rounded bg-white" />
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={savePaymentMethod}
                        onChange={(e) => setSavePaymentMethod(e.target.checked)}
                      />
                      Save as customer default card after successful charge
                    </label>
                  </>
                )}
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

        <div className="flex justify-end gap-2 mt-6 pt-2 border-t border-alloy-stone/20">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm border border-alloy-stone/45 rounded-lg hover:bg-alloy-stone/15 disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void runPayment()}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm font-medium bg-alloy-blue text-white rounded-lg hover:opacity-90 disabled:opacity-50 shadow-sm"
          >
            {submitting ? "Processing…" : target === "adhoc" ? "Charge ad hoc" : "Charge customer"}
          </button>
        </div>
      </div>
    </div>
  );
}
