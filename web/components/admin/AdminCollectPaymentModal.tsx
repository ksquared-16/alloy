"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeCardElement } from "@stripe/stripe-js";
import { AD_HOC_CHARGE_TYPE_OPTIONS } from "@/lib/admin/adHocChargeTypes";
import { adminPaymentRunFeedback } from "@/lib/admin/paymentRunFeedback";
import { formatMoneyFromCents } from "@/lib/adminFormatters";

export type AdminCollectPaymentModalContext = {
  jobId: string;
  scheduleId?: string | null;
  jobLabel?: string;
  scheduleLabel?: string;
};

type PaymentTarget = "job" | "schedule" | "adhoc";

type CardMode = "on_file" | "new_card";

type CollectApiJob = {
  original_cents: number | null;
  paid_cents: number;
  balance_cents: number;
};

type CollectApiSchedule = {
  schedule_id: string;
  original_cents: number;
  paid_cents: number;
  balance_cents: number;
};

type CollectApiResponse = {
  job: CollectApiJob;
  schedule: CollectApiSchedule | null;
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
  if (target === "job") {
    if (data.job.balance_cents > 0) return data.job.balance_cents;
    if (data.job.original_cents != null && data.job.original_cents > 0) return data.job.original_cents;
    return 0;
  }
  if (target === "schedule" && data.schedule) {
    if (data.schedule.balance_cents > 0) return data.schedule.balance_cents;
    return data.schedule.original_cents;
  }
  return null;
}

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
  }, [isOpen, context?.jobId, context?.scheduleId]);

  useEffect(() => {
    if (!isOpen || !context) return;
    setTarget(hasSchedule ? "schedule" : "job");
    setCardMode("on_file");
    setSavePaymentMethod(true);
    setFeedback(null);
    setAmountTouched(false);
    setAdhocChargeType(AD_HOC_CHARGE_TYPE_OPTIONS[0]?.value ?? "other");
  }, [isOpen, context, hasSchedule]);

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
    if (!effectiveJobId || !canSubmit) return;
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
          return;
        }
        paymentMethodId = paymentMethod.id;
      }

      const body: Record<string, unknown> = { job_id: effectiveJobId };
      if (amountCentsPayload != null) body.amount_cents = amountCentsPayload;
      if (target === "adhoc") {
        body.ad_hoc_charge_type = adhocChargeType;
        body.payment_target = "ad_hoc";
      } else if (target === "schedule" && context?.scheduleId) {
        body.payment_target = "schedule";
        body.schedule_id = context.scheduleId;
      } else {
        body.payment_target = "job";
      }
      if (paymentMethodId) {
        body.payment_method_id = paymentMethodId;
        body.save_payment_method = savePaymentMethod;
      }
      body.idempotency_key = crypto.randomUUID();

      const res = await fetch("/api/admin/payments/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      let json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (json.requires_action === true && typeof json.client_secret === "string") {
        if (!stripe) {
          const line = {
            type: "error" as const,
            message: "This payment needs authentication but Stripe.js is not loaded. Check NEXT_PUBLIC_STRIPE_PUBLISHABLE.",
          };
          setFeedback(line);
          onPaymentOutcome?.(line);
          onAfterRun(effectiveJobId, target === "schedule" ? context?.scheduleId ?? null : null);
          return;
        }
        const { error: cErr, paymentIntent } = await stripe.confirmCardPayment(json.client_secret as string);
        if (cErr) {
          const line = { type: "error" as const, message: cErr.message ?? "Authentication failed" };
          setFeedback(line);
          onPaymentOutcome?.(line);
          onAfterRun(effectiveJobId, target === "schedule" ? context?.scheduleId ?? null : null);
          return;
        }
        if (paymentIntent?.status === "succeeded") {
          const amt = paymentIntent.amount ?? amountCentsPayload;
          const parts = ["Payment succeeded"];
          if (typeof amt === "number" && Number.isFinite(amt)) parts.push(formatMoneyFromCents(amt));
          const line = { type: "success" as const, message: parts.join(" · ") };
          setFeedback(line);
          onPaymentOutcome?.(line);
          onAfterRun(effectiveJobId, target === "schedule" ? context?.scheduleId ?? null : null);
          return;
        } else {
          const line = {
            type: "error" as const,
            message: `Payment status: ${paymentIntent?.status ?? "unknown"}`,
          };
          setFeedback(line);
          onPaymentOutcome?.(line);
          onAfterRun(effectiveJobId, target === "schedule" ? context?.scheduleId ?? null : null);
          return;
        }
      }

      if (res.status === 409) {
        const msg = (typeof json.error === "string" && json.error) || "Request conflict";
        setFeedback({ type: "error", message: msg });
        onPaymentOutcome?.({ type: "error", message: msg });
        onAfterRun(effectiveJobId, target === "schedule" ? context?.scheduleId ?? null : null);
        return;
      }

      const fb = adminPaymentRunFeedback(json, res.ok && json.ok === true);
      const line: { type: "success" | "error"; message: string } = { type: fb.ok ? "success" : "error", message: fb.message };
      setFeedback(line);
      onPaymentOutcome?.(line);
      onAfterRun(effectiveJobId, target === "schedule" ? context?.scheduleId ?? null : null);
    } catch (e) {
      const line = { type: "error" as const, message: (e as Error).message };
      setFeedback(line);
      onPaymentOutcome?.(line);
    } finally {
      setSubmitting(false);
    }
  };

  const onTargetChange = (next: PaymentTarget) => {
    setTarget(next);
  };

  if (!isOpen || !context) return null;

  const savedCardDescription =
    collect?.saved_card_label ??
    (hasStripeCustomer ? "Saved card on file" : "No saved card on file");

  const jobLineSuffix = collect ? ` — balance due ${money(collect.job.balance_cents)}` : "";
  const schedLineSuffix =
    collect?.schedule != null ? ` — balance due ${money(collect.schedule.balance_cents)}` : "";

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
          Charge the customer&apos;s job. Amount defaults to balance due for the selected target. All charges run through
          Stripe; saved cards use your existing customer profile.
        </p>

        {ctxLoading && <p className="text-sm text-alloy-midnight/60 mb-3">Loading job &amp; payment details…</p>}
        {ctxError && (
          <div className="text-sm text-alloy-ember mb-3 rounded border border-alloy-ember/30 bg-alloy-ember/5 px-2 py-2">
            {ctxError}
          </div>
        )}

        <div className="space-y-4 text-sm">
          {(target === "job" || target === "schedule") && collect && (
            <div className="rounded-md border border-alloy-stone/40 bg-alloy-stone/10 px-3 py-2 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-alloy-forge/90">Financial summary</p>
              {target === "job" && (
                <>
                  <div className="flex justify-between gap-2">
                    <span className="text-alloy-midnight/70">Original amount</span>
                    <span className="font-medium">{money(collect.job.original_cents)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-alloy-midnight/70">Already paid</span>
                    <span className="font-medium">{money(collect.job.paid_cents)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-alloy-midnight/70">Balance due</span>
                    <span className="font-medium text-alloy-midnight">{money(collect.job.balance_cents)}</span>
                  </div>
                </>
              )}
              {target === "schedule" && collect.schedule && (
                <>
                  <div className="flex justify-between gap-2">
                    <span className="text-alloy-midnight/70">This schedule (line amount)</span>
                    <span className="font-medium">{money(collect.schedule.original_cents)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-alloy-midnight/70">Paid on job (all payments)</span>
                    <span className="font-medium">{money(collect.schedule.paid_cents)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-alloy-midnight/70">Suggested balance for this line</span>
                    <span className="font-medium text-alloy-midnight">{money(collect.schedule.balance_cents)}</span>
                  </div>
                  <p className="text-[11px] text-alloy-midnight/55 pt-1">
                    Payments are recorded on the parent job; the line amount is capped by remaining job balance when possible.
                  </p>
                </>
              )}
            </div>
          )}

          <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-alloy-forge/90 mb-2">
              Apply payment to
            </span>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pay-target"
                  checked={target === "job"}
                  onChange={() => onTargetChange("job")}
                  className="mt-1"
                />
                <span>
                  This job
                  {context.jobLabel ? ` (${context.jobLabel})` : ""}
                  {jobLineSuffix}
                </span>
              </label>
              {hasSchedule && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="pay-target"
                    checked={target === "schedule"}
                    onChange={() => onTargetChange("schedule")}
                    className="mt-1"
                  />
                  <span>
                    This schedule
                    {context.scheduleLabel ? ` (${context.scheduleLabel})` : ""}
                    {schedLineSuffix}
                    <span className="block text-xs text-alloy-midnight/55">Charges still post to the parent job.</span>
                  </span>
                </label>
              )}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="pay-target"
                  checked={target === "adhoc"}
                  onChange={() => onTargetChange("adhoc")}
                  className="mt-1"
                />
                <span>Ad hoc charge (enter amount; category required)</span>
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
