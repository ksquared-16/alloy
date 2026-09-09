"use client";

/**
 * THE CARD ENTRY ITSELF — Stripe's fields, never Alloy's.
 *
 * The card number lives in an iframe Stripe serves and Alloy cannot read. That is not a convenience:
 * it is the reason Alloy never handles a PAN, and it is why this component takes a client secret and
 * gives back a result rather than ever holding a value.
 *
 * It is deliberately small and unstyled beyond layout. A payment surface that looks like the
 * processor rather than like Financials is the thing Thread 8B is trying not to build.
 */
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import { useEffect, useRef, useState } from "react";

let stripePromise: Promise<Stripe | null> | null = null;
function stripeClient(): Promise<Stripe | null> {
    if (!stripePromise) {
        const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
        // The publishable key is public by Stripe's design. Its ABSENCE is the interesting case:
        // without it the operator gets a plain explanation rather than a dead form.
        stripePromise = key ? loadStripe(key) : Promise.resolve(null);
    }
    return stripePromise;
}

export type CardCollectionFieldProps = {
    /** Stripe's handle on the collection. Not an Alloy credential. */
    clientSecret: string;
    /** The connected account the intent lives on — Elements must be told, or it cannot find it. */
    connectedAccount: string;
    amountLabel: string;
    disabled?: boolean;
    onResult: (result: { status: "processing" | "succeeded" | "failed"; message?: string }) => void;
    onCancel: () => void;
};

export default function CardCollectionField({
    clientSecret,
    connectedAccount,
    amountLabel,
    disabled,
    onResult,
    onCancel,
}: CardCollectionFieldProps) {
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
            // `stripeAccount` is what makes Elements talk to the PROVIDER's account. Without it the
            // client secret belongs to an intent Stripe.js cannot see.
            const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
            const s = key
                ? await loadStripe(key, { stripeAccount: connectedAccount })
                : await stripeClient();
            if (cancelled) return;
            if (!s) {
                setUnavailable("Card entry is unavailable because card processing is not configured for this environment.");
                return;
            }
            const els = s.elements({ clientSecret });
            const payment = els.create("payment", { layout: "tabs" });
            if (mountRef.current) payment.mount(mountRef.current);
            payment.on("ready", () => !cancelled && setReady(true));
            setStripe(s);
            setElements(els);
        })();
        return () => { cancelled = true; };
    }, [clientSecret, connectedAccount]);

    if (unavailable) {
        return (
            <div className="alloy-os-financials__note" data-financials-card-unavailable="true">
                {unavailable}
            </div>
        );
    }

    return (
        <div className="alloy-os-financials__cardfield" data-financials-card-field="true">
            <p className="alloy-os-financials__note">Collecting {amountLabel} by card.</p>
            <div ref={mountRef} data-financials-card-mount="true" />
            {fieldError ? (
                <p className="alloy-os-financials__note" data-financials-card-error="true">{fieldError}</p>
            ) : null}
            <span className="alloy-os-financials__preview-actions">
                <button
                    type="button"
                    className="alloy-os-financials__action"
                    data-financials-card-submit="true"
                    disabled={disabled || submitting || !ready || !stripe || !elements}
                    onClick={async () => {
                        if (!stripe || !elements) return;
                        setSubmitting(true);
                        setFieldError(null);
                        /*
                         * `redirect: "if_required"` keeps the operator inside Financials for a plain
                         * card, and still honours a 3DS redirect when the issuer demands one.
                         */
                        const result = await stripe.confirmPayment({
                            elements,
                            redirect: "if_required",
                        });
                        setSubmitting(false);

                        if (result.error) {
                            // Stripe's own operator-safe sentence — never a payload, never a code.
                            const message = result.error.message ?? "That card could not be charged.";
                            setFieldError(message);
                            onResult({ status: "failed", message });
                            return;
                        }
                        /*
                         * A successful confirmation is NOT a payment. It means the provider accepted
                         * the card; Financials still waits for provider confirmation to reach the
                         * canonical posting path. The caller shows "finalizing", not "paid".
                         */
                        const status = result.paymentIntent?.status;
                        onResult({
                            status: status === "succeeded" ? "succeeded" : "processing",
                        });
                    }}
                >
                    {submitting ? "Submitting…" : "Pay by card"}
                </button>
                <button
                    type="button"
                    className="alloy-os-financials__action"
                    data-financials-card-cancel="true"
                    disabled={submitting}
                    onClick={onCancel}
                >
                    Cancel
                </button>
            </span>
        </div>
    );
}
