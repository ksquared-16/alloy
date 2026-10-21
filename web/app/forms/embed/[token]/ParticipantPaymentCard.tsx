"use client";

/**
 * WHERE A PARENT ACTUALLY PAYS — inside Enrollment, not in a Financials screen.
 *
 * Everything shown here is quoted from `/enrollment-payment`, which quotes canonical Financials. This
 * component adds no arithmetic: it does not subtract a subsidy, does not compute what is left after a
 * partial payment, and does not decide whether the fee is settled. When it needs a number it asks
 * again, because the server's answer after a payment is the only truthful one.
 *
 * ── A CONFIRMED CARD IS NOT A PAYMENT ──
 *
 * `stripe.confirmPayment` succeeding means the provider accepted the card. It does not mean money is
 * canonical, and this screen never says "paid" on the strength of it. It tells the server to LOOK
 * (`action: "recognize"`, which reads the intent server-side), then re-reads the requirement and
 * renders whatever state came back — received, still processing, or needing attention.
 *
 * ── WHAT IS NOT HERE, DELIBERATELY ──
 *
 * No ledger words. No "outstanding", no "collectible", no "obligation" — a parent is told what is
 * due, what was received, and what remains. And no Pay button in a state where paying is impossible:
 * the server says whether it is payable and why not, and that sentence is shown instead.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import { announceParticipantProgress, onParticipantProgress } from "./participantProgressSignal";

type Line = {
    chargeId: string;
    subjectName: string | null;
    label: string;
    collectibleNowCents: number;
    state: string;
};

type Method = { id: string; rail: "card" | "ach"; brand: string | null; last4: string | null; isDefault: boolean };

type PaymentView = {
    state: string;
    label: string;
    explanation: string;
    currencyCode: string | null;
    grossCents: number;
    collectibleNowCents: number;
    appliedCents: number;
    outstandingCents: number;
    payable: boolean;
    payer: { personId: string; name: string } | null;
    lines: Line[];
    methods: Method[];
    rails: ("card" | "ach")[];
    unpayableReason: string | null;
};

/* The participant surface's own card language (EnrollmentConversationCard's IntakeCard). */
const PANEL = "mt-4 rounded-2xl border border-alloy-midnight/[0.08] bg-white px-5 py-4 shadow-sm";
const PANEL_TITLE = "mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45";
const PANEL_NOTE = "mt-2 text-[13px] text-alloy-midnight/60";
const FIELD_LABEL = "mt-3 flex flex-col gap-1 text-[12px] font-medium text-alloy-midnight/70";
// 16px: anything smaller zooms the page on iOS when focused.
const FIELD = "min-h-[44px] w-full rounded-lg border border-alloy-midnight/20 bg-white px-3 py-2 text-[16px] text-alloy-midnight";
const PRIMARY = "mt-4 min-h-[44px] w-full rounded-lg bg-alloy-bend-pine px-4 py-2 text-[15px] font-semibold text-white disabled:opacity-50 sm:w-auto";

const money = (cents: number, currency: string | null) =>
    (cents / 100).toLocaleString(undefined, { style: "currency", currency: currency || "USD" });

const methodLabel = (m: Method) =>
    `${(m.brand ?? (m.rail === "ach" ? "Bank account" : "Card")).replace(/^\w/, (c) => c.toUpperCase())} •••• ${m.last4 ?? "????"}`;

/** Parent-facing headline per canonical state. Never a ledger term. */
function headline(view: PaymentView): string {
    switch (view.state) {
        case "SATISFIED":
            return "Enrollment fee complete";
        case "PARTIALLY_SATISFIED":
            return `${money(view.appliedCents, view.currencyCode)} received · ${money(view.outstandingCents, view.currencyCode)} remaining`;
        case "PROCESSING":
            return "Payment processing";
        case "NOT_DUE":
            // One child paid, a sibling's fee not yet due: the family has paid — never "not due yet"
            // under a payment it just made.
            return view.appliedCents > 0
                ? `${money(view.appliedCents, view.currencyCode)} paid · nothing more is due yet`
                : "Enrollment fee — not due yet";
        case "ATTENTION_REQUIRED":
            return "Enrollment fee needs attention";
        default:
            return `${money(view.collectibleNowCents, view.currencyCode)} due`;
    }
}

export default function ParticipantPaymentCard({ token }: { token: string }) {
    const [view, setView] = useState<PaymentView | null>(null);
    const [publishableKey, setPublishableKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    /** Which obligation, which method, and how much — the only choices a parent makes. */
    const [chargeId, setChargeId] = useState<string>("");
    const [methodId, setMethodId] = useState<string>("");
    const [amount, setAmount] = useState<string>("");
    /**
     * Card or bank. Only a rail the server reports this merchant can take is ever offered, and the
     * saved methods are re-read for the chosen rail — a card is never offered as a bank account.
     */
    const [rail, setRail] = useState<"card" | "ach">("card");

    /** Present-payer confirmation state: Stripe's own fields, mounted only when needed. */
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [connectedAccount, setConnectedAccount] = useState<string | null>(null);
    const [attemptId, setAttemptId] = useState<string | null>(null);
    const elementHost = useRef<HTMLDivElement | null>(null);
    const stripeRef = useRef<Stripe | null>(null);
    const elementsRef = useRef<StripeElements | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/public/forms/${encodeURIComponent(token)}/enrollment-payment?rail=${rail}`,
                { credentials: "same-origin" },
            );
            const json = (await res.json()) as { ok?: boolean; data?: { payment: PaymentView; publishableKey: string | null }; error?: string };
            if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? "We could not load your fee.");
            setView(json.data.payment);
            setPublishableKey(json.data.publishableKey);
            // Default to the first payable line and its full amount — the server's figure, not a
            // computed one. A parent who wants to pay less edits it and the server re-checks.
            const first = json.data.payment.lines.find((l) => l.chargeId && l.collectibleNowCents > 0);
            setChargeId((prev) => prev || first?.chargeId || "");
            setAmount((prev) => prev || (first ? String((first.collectibleNowCents / 100).toFixed(2)) : ""));
            const methods = json.data.payment.methods.filter((m) => m.rail === rail);
            const preferred = methods.find((m) => m.isDefault) ?? methods[0];
            setMethodId((prev) => (prev && methods.some((m) => m.id === prev) ? prev : preferred?.id || ""));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [token, rail]);

    /**
     * After money moves, the next default is what is LEFT — not the figure the parent typed before.
     * A partial payment therefore lands on "Pay the remainder", a full one on the next child's fee.
     */
    const reloadAfterPayment = useCallback(async () => {
        setChargeId("");
        setAmount("");
        await load();
        // The family panel's payment row reads the same truth; tell it money moved.
        announceParticipantProgress();
    }, [load]);

    useEffect(() => {
        void load();
    }, [load]);

    // Paperwork finished elsewhere on the page makes a fee due; re-read rather than keep the first answer.
    useEffect(() => onParticipantProgress(() => void load()), [load]);

    /* Stripe's fields are mounted only for a present payer — never for a saved method, which the
     * server confirms itself. */
    useEffect(() => {
        if (!clientSecret || !publishableKey || !elementHost.current) return;
        let cancelled = false;
        void (async () => {
            const stripe = await loadStripe(publishableKey, connectedAccount ? { stripeAccount: connectedAccount } : undefined);
            if (cancelled || !stripe || !elementHost.current) return;
            const elements = stripe.elements({ clientSecret });
            elements.create("payment").mount(elementHost.current);
            stripeRef.current = stripe;
            elementsRef.current = elements;
        })();
        return () => {
            cancelled = true;
        };
    }, [clientSecret, publishableKey, connectedAccount]);

    /** Ask the server to look at the provider. The browser's opinion is not the finding. */
    const recognize = useCallback(
        async (id: string) => {
            const res = await fetch(`/api/public/forms/${encodeURIComponent(token)}/enrollment-payment`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "recognize", attempt_id: id }),
            });
            const json = (await res.json()) as { ok?: boolean; data?: { recognized?: boolean; message?: string }; error?: string };
            // 202 means real-but-not-settled: correct for a bank debit, and not an error.
            if (res.status === 202) return "processing" as const;
            if (!res.ok || !json.ok) return "unknown" as const;
            return json.data?.recognized ? ("received" as const) : ("already" as const);
        },
        [token],
    );

    const pay = useCallback(async () => {
        if (!view) return;
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
            const cents = Math.round(Number(amount) * 100);
            if (!Number.isFinite(cents) || cents <= 0) throw new Error("Enter an amount to pay.");

            const res = await fetch(`/api/public/forms/${encodeURIComponent(token)}/enrollment-payment`, {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "collect",
                    charge_id: chargeId,
                    amount_cents: cents,
                    rail,
                    ...(methodId ? { payment_method_id: methodId } : {}),
                }),
            });
            const json = (await res.json()) as {
                ok?: boolean;
                data?: { attemptId: string; clientSecret: string; connectedAccountRef: string; publishableKey: string; reused: boolean };
                error?: string;
            };
            if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? "That payment could not be started.");

            setAttemptId(json.data.attemptId);
            if (json.data.publishableKey) setPublishableKey(json.data.publishableKey);

            if (methodId) {
                /* A saved method is confirmed by the server with the provider. Nothing to mount. */
                const outcome = await recognize(json.data.attemptId);
                setNotice(
                    outcome === "received" || outcome === "already"
                        ? "Payment received."
                        : "Payment processing — we will update this when it settles.",
                );
                await reloadAfterPayment();
                return;
            }

            /* A present payer enters details in Stripe's own fields. For a bank account those fields
               carry Stripe's own account verification and the debit mandate — Alloy adds neither. */
            setClientSecret(json.data.clientSecret);
            setConnectedAccount(json.data.connectedAccountRef);
            setNotice(rail === "ach" ? "Connect your bank account below to finish." : "Enter your card details below to finish.");
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }, [view, amount, chargeId, methodId, rail, token, recognize, reloadAfterPayment]);

    const confirmCard = useCallback(async () => {
        const stripe = stripeRef.current;
        const elements = elementsRef.current;
        if (!stripe || !elements || !attemptId) return;
        setBusy(true);
        setError(null);
        const result = await stripe.confirmPayment({ elements, redirect: "if_required" });
        if (result.error) {
            /* A decline leaves the same intent open: the parent corrects the details and presses Pay
               again, which confirms that intent — never a second charge. */
            setError(result.error.message ?? "That payment could not be completed. You can try again.");
            setBusy(false);
            return;
        }
        /* Accepted by the provider. Whether it is MONEY is the server's to establish. */
        const outcome = await recognize(attemptId);
        setNotice(
            outcome === "received" || outcome === "already"
                ? "Payment received."
                : "Payment processing — we will update this when it settles.",
        );
        setClientSecret(null);
        setAttemptId(null);
        setBusy(false);
        await reloadAfterPayment();
    }, [attemptId, recognize, reloadAfterPayment]);

    if (loading && !view) return <p data-participant-payment="loading" className={PANEL_NOTE}>Loading your fee…</p>;
    if (error && !view) return <p data-participant-payment="error" role="alert">{error}</p>;
    if (!view || view.state === "NOT_APPLICABLE") return null;

    const line = view.lines.find((l) => l.chargeId === chargeId) ?? null;

    return (
        <section data-participant-payment="card" data-payment-state={view.state} className={PANEL}>
            <h3 className={PANEL_TITLE}>Payment</h3>
            <p data-participant-payment="headline" className={view.state === "SATISFIED" ? "text-[15px] font-semibold text-alloy-bend-pine" : "text-[15px] font-semibold text-alloy-midnight"}>
                {headline(view)}
            </p>

            {view.lines.length > 1 ? (
                <ul data-participant-payment="lines" className="mt-2 divide-y divide-alloy-midnight/[0.06] text-[13.5px]">
                    {view.lines.map((l) => (
                        <li key={l.chargeId || l.label} className="flex items-center justify-between gap-3 py-1.5">
                            <span className="text-alloy-midnight/80">{l.label}</span>
                            <span className="sr-only"> — </span>
                            {/* A paid fee says Paid — never "$0.00", which reads like a fee of nothing. */}
                            <span className={l.state === "SATISFIED" ? "font-medium text-alloy-bend-pine" : "font-medium text-alloy-midnight"}>
                                {l.state === "SATISFIED" ? "Paid" : money(l.collectibleNowCents, view.currencyCode)}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}

            {view.payable ? (
                <>
                    {view.lines.length > 1 ? (
                        <label className={FIELD_LABEL}>
                            Paying for
                            <select
                                className={FIELD}
                                data-participant-payment="charge"
                                value={chargeId}
                                onChange={(e) => {
                                    setChargeId(e.target.value);
                                    const next = view.lines.find((l) => l.chargeId === e.target.value);
                                    if (next) setAmount((next.collectibleNowCents / 100).toFixed(2));
                                }}
                            >
                                {view.lines
                                    .filter((l) => l.chargeId && l.collectibleNowCents > 0)
                                    .map((l) => (
                                        <option key={l.chargeId} value={l.chargeId}>
                                            {l.label} — {money(l.collectibleNowCents, view.currencyCode)}
                                        </option>
                                    ))}
                            </select>
                        </label>
                    ) : null}

                    <p data-participant-payment="payer" className={PANEL_NOTE}>Paying as {view.payer?.name}</p>

                    {view.rails.length > 1 ? (
                        <label className={FIELD_LABEL}>
                            Pay by
                            <select
                                className={FIELD}
                                data-participant-payment="rail"
                                value={rail}
                                disabled={Boolean(clientSecret)}
                                onChange={(e) => {
                                    setRail(e.target.value === "ach" ? "ach" : "card");
                                    setMethodId("");
                                }}
                            >
                                {view.rails.map((r) => (
                                    <option key={r} value={r}>
                                        {r === "ach" ? "Bank account (ACH)" : "Card"}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : null}

                    <label className={FIELD_LABEL}>
                        Payment method
                        <select
                            className={FIELD}
                            data-participant-payment="method"
                            value={methodId}
                            onChange={(e) => setMethodId(e.target.value)}
                        >
                            {view.methods.filter((m) => m.rail === rail).map((m) => (
                                <option key={m.id} value={m.id}>
                                    {methodLabel(m)}
                                </option>
                            ))}
                            {/* Paying once without saving anything is a first-class choice, not a
                                fallback — nobody should have to create a stored method to pay. */}
                            <option value="">{rail === "ach" ? "Use a new bank account for this payment" : "Use a new card for this payment"}</option>
                        </select>
                    </label>

                    <label className={FIELD_LABEL}>
                        Amount
                        <input
                            className={FIELD}
                            data-participant-payment="amount"
                            type="text"
                            inputMode="decimal"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                    </label>

                    {clientSecret ? (
                        <>
                            <div ref={elementHost} data-participant-payment="stripe-element" className="mt-3" />
                            <button type="button" data-participant-payment="confirm" disabled={busy} onClick={confirmCard} className={PRIMARY}>
                                {busy ? "Submitting…" : `Pay ${money(Math.round(Number(amount) * 100) || 0, view.currencyCode)}`}
                            </button>
                        </>
                    ) : (
                        <button type="button" data-participant-payment="pay" disabled={busy} onClick={pay} className={PRIMARY}>
                            {busy
                                ? "Starting…"
                                : `${view.state === "PARTIALLY_SATISFIED" ? "Pay remainder · " : "Pay "}${money(Math.round(Number(amount) * 100) || line?.collectibleNowCents || 0, view.currencyCode)}`}
                        </button>
                    )}
                </>
            ) : (
                /* No Pay button where paying is impossible, and the server's own sentence for why. */
                view.unpayableReason ? <p data-participant-payment="unpayable" className={PANEL_NOTE}>{view.unpayableReason}</p> : null
            )}

            {error ? <p data-participant-payment="error" role="alert" className="mt-2 text-[13px] text-rose-700">{error}</p> : null}
            {notice ? <p data-participant-payment="notice" role="status" className={PANEL_NOTE}>{notice}</p> : null}
        </section>
    );
}
