"use client";

/**
 * THE INSTRUMENT ENTRY ITSELF — Stripe's fields, never Alloy's.
 *
 * The card number and the bank credentials live in an iframe Stripe serves and Alloy cannot read.
 * That is not a convenience: it is the reason Alloy never handles a PAN, a CVC, or an account and
 * routing number, and it is why this component takes a client secret and gives back a result rather
 * than ever holding a value.
 *
 * ── WHY THIS IS NOT `CardCollectionField` ──
 *
 * That component confirms a PAYMENT on the connected account, so it loads Stripe.js with
 * `stripeAccount` set. This confirms a SETUP on the PLATFORM, which is where a durable stored method
 * has to live for it to survive the organisation changing merchant. Passing `stripeAccount` here
 * would put the stored method on one merchant and defeat the whole handle model — so the absence of
 * that option is the point, not an omission.
 */
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import { useEffect, useRef, useState } from "react";
import { stripePublishableKey } from "@/lib/financials/payments/stripePublishableKey";
import {
    ALLOY_ELEMENTS_APPEARANCE,
    ALLOY_ELEMENTS_FONTS,
    createAlloyOperatorPaymentElement,
} from "@/lib/financials/payments/stripeElementsPresentation";

export default function PaymentMethodSetupField({
    clientSecret,
    rail,
    authorizationDisclosure,
    disabled,
    onResult,
    onCancel,
}: {
    /** Stripe's handle on the setup. Not an Alloy credential, and never persisted. */
    clientSecret: string;
    rail: "card" | "ach";
    /** Shown VERBATIM above the provider's own terms for a bank account. Null for a card. */
    authorizationDisclosure: string | null;
    disabled?: boolean;
    onResult: (result: { status: "succeeded" | "pending" | "failed"; message?: string }) => void;
    onCancel: () => void;
}) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const [stripe, setStripe] = useState<Stripe | null>(null);
    const [elements, setElements] = useState<StripeElements | null>(null);
    const [ready, setReady] = useState(false);
    const [unavailable, setUnavailable] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [fieldError, setFieldError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const key = stripePublishableKey();
            /* No `stripeAccount`: the setup is the PLATFORM's. See this component's header. */
            const s = key ? await loadStripe(key) : null;
            if (cancelled) return;
            if (!s) {
                setUnavailable(
                    "Saving a payment method is unavailable because payment processing is not configured for this environment.",
                );
                return;
            }
            const els = s.elements({
                clientSecret,
                appearance: ALLOY_ELEMENTS_APPEARANCE,
                fonts: ALLOY_ELEMENTS_FONTS,
            });
            const payment = createAlloyOperatorPaymentElement(els);
            if (mountRef.current) payment.mount(mountRef.current);
            payment.on("ready", () => !cancelled && setReady(true));
            setStripe(s);
            setElements(els);
        })();
        return () => {
            cancelled = true;
        };
    }, [clientSecret]);

    if (unavailable) {
        return (
            <p
                data-testid="payment-method-setup-unavailable"
                className="rounded-lg border border-alloy-stone/30 bg-alloy-cloud/40 px-3 py-2 text-sm text-alloy-midnight/75"
            >
                {unavailable}
            </p>
        );
    }

    return (
        <div
            className="space-y-2 rounded-lg border border-alloy-stone/30 px-3 py-3"
            data-testid="payment-method-setup-field"
            data-setup-rail={rail}
        >
            {/*
              * ALLOY'S HEADING OVER STRIPE'S FIELDS. The operator should read this as a section of
              * Financials that happens to contain secure inputs, not as a checkout page that
              * happens to sit inside Alloy — so the label is ours and the inputs are Stripe's.
              */}
            <p className="text-xs font-medium text-alloy-midnight/80" data-testid="payment-method-setup-heading">
                {rail === "ach" ? "Bank account details" : "Card details"}
            </p>
            <p className="text-xs text-alloy-midnight/65">
                {rail === "ach"
                    ? "Entered securely with the bank. Alloy never sees the account or routing number."
                    : "Entered securely with Stripe. Alloy never sees the card number or security code."}
            </p>

            <div ref={mountRef} data-testid="payment-method-setup-mount" />

            {/*
              * THE AUTHORIZATION, ABOVE THE SUBMIT AND BEFORE THE ACT.
              *
              * Stripe requires that a payer collecting a bank account which the platform intends to
              * clone be told their authorization extends to connected accounts. It is rendered
              * verbatim from the server's constant, so the words here and the mechanism that relies
              * on them cannot drift apart.
              */}
            {authorizationDisclosure ? (
                <p
                    data-testid="payment-method-setup-authorization"
                    className="rounded-md bg-alloy-cloud/50 px-2 py-2 text-xs leading-relaxed text-alloy-midnight/75"
                >
                    {authorizationDisclosure}
                </p>
            ) : null}

            {fieldError ? (
                <p data-testid="payment-method-setup-error" className="text-xs text-red-700">
                    {fieldError}
                </p>
            ) : null}

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    data-testid="payment-method-setup-submit"
                    disabled={disabled || submitting || !ready || !stripe || !elements}
                    onClick={async () => {
                        if (!stripe || !elements) return;
                        setSubmitting(true);
                        setFieldError(null);
                        /*
                         * `redirect: "if_required"` keeps the payer inside Financials for a plain
                         * card, and still honours a bank's own flow when one is demanded.
                         */
                        const result = await stripe.confirmSetup({ elements, redirect: "if_required" });
                        setSubmitting(false);

                        if (result.error) {
                            setFieldError(result.error.message ?? "That could not be saved.");
                            onResult({ status: "failed", message: result.error.message });
                            return;
                        }
                        /*
                         * The browser's answer is a HINT, not the record. The server re-reads the
                         * setup from the provider before anything canonical is written — which is
                         * why a `requires_action` here is reported as pending rather than as failure.
                         */
                        const status = String(result.setupIntent?.status ?? "");
                        onResult({ status: status === "succeeded" ? "succeeded" : "pending" });
                    }}
                    /* Bend Pine, matching the sibling Autopay actions on this same card. */
                    className="inline-flex items-center gap-1 rounded-md bg-alloy-bend-pine px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                    {rail === "ach" ? "Authorize and save" : "Save card"}
                </button>
                <button
                    type="button"
                    data-testid="payment-method-setup-cancel"
                    disabled={submitting}
                    onClick={onCancel}
                    className="rounded-md border border-alloy-stone/40 px-3 py-1 text-xs text-alloy-midnight/70 disabled:opacity-50"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
