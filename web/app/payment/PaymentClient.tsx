"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { loadStripe, Stripe, StripeElements, StripeCardElement } from "@stripe/stripe-js";
import Section from "@/components/Section";

interface BookingPrefill {
    phone?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    estimated_price?: string;
    ghl_contact_id?: string;
}

function clearBookingPrefill() {
    try {
        sessionStorage.removeItem("alloy_booking_prefill");
        localStorage.removeItem("alloy_booking_prefill");
    } catch (e) {
        console.warn("Failed to clear booking prefill storage:", e);
    }
}

export default function PaymentClient() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [stripe, setStripe] = useState<Stripe | null>(null);
    const [elements, setElements] = useState<StripeElements | null>(null);
    const [card, setCard] = useState<StripeCardElement | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const cardElementRef = useRef<HTMLDivElement>(null);

    // Resolve user info with fallback priority:
    // 1. URL query params
    // 2. sessionStorage
    // 3. localStorage
    const [resolvedPhone, setResolvedPhone] = useState<string | null>(null);
    const [resolvedEmail, setResolvedEmail] = useState<string | null>(null);
    const [resolvedGhlContactId, setResolvedGhlContactId] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Resolve phone/email from URL or storage
    useEffect(() => {
        if (!mounted) return;

        // Priority 1: URL query params
        let phone = searchParams?.get("phone");
        let email = searchParams?.get("email");
        let ghlContactId = searchParams?.get("ghl_contact_id");

        // Priority 2: sessionStorage fallback
        if ((!phone || !email) && typeof window !== "undefined") {
            try {
                const stored = sessionStorage.getItem("alloy_booking_prefill");
                if (stored) {
                    const parsed: BookingPrefill = JSON.parse(stored);
                    if (!phone && parsed.phone) phone = parsed.phone;
                    if (!email && parsed.email) email = parsed.email;
                    if (!ghlContactId && parsed.ghl_contact_id) ghlContactId = parsed.ghl_contact_id;
                }
            } catch (e) {
                console.warn("Failed to read from sessionStorage:", e);
            }
        }

        // Priority 3: localStorage fallback
        if ((!phone || !email) && typeof window !== "undefined") {
            try {
                const stored = localStorage.getItem("alloy_booking_prefill");
                if (stored) {
                    const parsed: BookingPrefill = JSON.parse(stored);
                    if (!phone && parsed.phone) phone = parsed.phone;
                    if (!email && parsed.email) email = parsed.email;
                    if (!ghlContactId && parsed.ghl_contact_id) ghlContactId = parsed.ghl_contact_id;
                }
            } catch (e) {
                console.warn("Failed to read from localStorage:", e);
            }
        }

        setResolvedPhone(phone);
        setResolvedEmail(email);
        setResolvedGhlContactId(ghlContactId);
    }, [mounted, searchParams]);

    // Initialize Stripe
    useEffect(() => {
        if (!mounted || !resolvedPhone || !resolvedEmail) {
            return;
        }

        const initializeStripe = async () => {
            const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE;
            
            // Strict check for publishable key
            if (!publishableKey || publishableKey.trim() === "") {
                const errorMsg = "NEXT_PUBLIC_STRIPE_PUBLISHABLE environment variable is missing or empty. Please set it in Vercel project settings and redeploy.";
                console.error(errorMsg);
                console.error("Current hostname:", typeof window !== "undefined" ? window.location.hostname : "unknown");
                console.error("NODE_ENV:", process.env.NODE_ENV);
                setError("Stripe is not configured. Please contact support.");
                return;
            }

            try {
                const stripeInstance = await loadStripe(publishableKey);
                if (!stripeInstance) {
                    throw new Error("Failed to load Stripe");
                }
                
                setStripe(stripeInstance);
                
                const elementsInstance = stripeInstance.elements();
                setElements(elementsInstance);
                
                // Create card element
                const cardElement = elementsInstance.create("card", {
                    style: {
                        base: {
                            fontSize: "16px",
                            color: "#1a1a1a",
                            "::placeholder": {
                                color: "#9ca3af",
                            },
                        },
                        invalid: {
                            color: "#ef4444",
                        },
                    },
                });
                
                setCard(cardElement);
            } catch (err) {
                console.error("Failed to initialize Stripe:", err);
                setError("Failed to load payment form. Please refresh the page.");
            }
        };

        initializeStripe();
    }, [mounted, resolvedPhone, resolvedEmail]);

    // Mount card element when both card and ref are ready
    useEffect(() => {
        if (card && cardElementRef.current) {
            card.mount(cardElementRef.current);
            
            // Cleanup: unmount card element
            return () => {
                try {
                    card.unmount();
                } catch (e) {
                    // Ignore unmount errors
                }
            };
        }
    }, [card]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !card) {
            setError("Payment form is not ready. Please wait a moment and try again.");
            return;
        }

        setIsProcessing(true);
        setError(null);

        try {
            // Call backend to create SetupIntent
            const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
            const response = await fetch(`${apiBaseUrl}/stripe/setup-intent`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    phone: resolvedPhone!,
                    email: resolvedEmail!,
                    ghl_contact_id: resolvedGhlContactId || undefined,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Failed to create setup intent");
            }

            const { client_secret } = await response.json();

            // Confirm the SetupIntent with Stripe
            const { error: confirmError } = await stripe.confirmCardSetup(
                client_secret,
                {
                    payment_method: {
                        card: card,
                    },
                }
            );

            if (confirmError) {
                throw new Error(confirmError.message || "Card setup failed");
            }

            // Success! Clear storage and redirect
            clearBookingPrefill();
            setSuccess(true);
            
            // Build success URL with params
            const successParams = new URLSearchParams({
                phone: resolvedPhone!,
                email: resolvedEmail!,
            });
            if (resolvedGhlContactId) {
                successParams.append("ghl_contact_id", resolvedGhlContactId);
            }
            
            setTimeout(() => {
                router.push(`/payment/success?${successParams.toString()}`);
            }, 1500);
        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred");
            setIsProcessing(false);
        }
    };

    const handleStartOver = () => {
        clearBookingPrefill();
        window.location.href = "/services/cleaning";
    };

    // Check for required params (after all fallbacks)
    if (mounted && (!resolvedPhone || !resolvedEmail)) {
        return (
            <div className="min-h-screen py-6 md:py-10">
                <Section className="max-w-2xl">
                    <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-8 md:p-10 text-center">
                        <div className="mb-6">
                            <svg
                                className="w-16 h-16 mx-auto text-red-500"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-alloy-midnight mb-4">
                            Missing Required Information
                        </h1>
                        <p className="text-alloy-midnight/70 mb-6">
                            Phone and email are required to save your card. Please start over from the beginning.
                        </p>
                        <button
                            onClick={handleStartOver}
                            className="inline-block bg-alloy-blue text-white font-semibold px-6 py-3 rounded-lg hover:bg-alloy-blue/90 transition-colors"
                        >
                            Start Over
                        </button>
                    </div>
                </Section>
            </div>
        );
    }

    if (!mounted) {
        return (
            <div className="min-h-screen py-6 md:py-10">
                <Section className="max-w-2xl">
                    <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-8 md:p-10">
                        <div className="text-center">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alloy-blue border-t-transparent mb-4"></div>
                            <p className="text-alloy-midnight/70">Loading...</p>
                        </div>
                    </div>
                </Section>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen py-6 md:py-10">
                <Section className="max-w-2xl">
                    <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-8 md:p-10">
                        <div className="text-center py-8">
                            <div className="mb-4">
                                <svg
                                    className="w-16 h-16 mx-auto text-alloy-juniper"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 13l4 4L19 7"
                                    />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-alloy-midnight mb-2">
                                Card saved successfully!
                            </h2>
                            <p className="text-alloy-midnight/70">
                                Redirecting to confirmation...
                            </p>
                        </div>
                    </div>
                </Section>
            </div>
        );
    }

    return (
        <div className="min-h-screen py-6 md:py-10">
            <Section className="max-w-2xl">
                <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-8 md:p-10">
                    <h1 className="text-3xl font-bold text-alloy-midnight mb-6">
                        Save Card on File
                    </h1>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Customer Info (Read-only display) */}
                        <div className="bg-alloy-stone/20 rounded-lg p-4 border border-alloy-stone/30">
                            <h3 className="text-sm font-semibold text-alloy-midnight/80 mb-3">
                                Your Information
                            </h3>
                            <div className="space-y-2 text-sm text-alloy-midnight/70">
                                <div>
                                    <strong>Email:</strong> {resolvedEmail}
                                </div>
                                <div>
                                    <strong>Phone:</strong> {resolvedPhone}
                                </div>
                            </div>
                        </div>

                        {/* Card Details */}
                        <div>
                            <label className="block text-sm font-semibold text-alloy-midnight mb-2">
                                Card Details
                            </label>
                            <div className="bg-white border border-alloy-stone/40 rounded-lg p-4">
                                <div id="card-element" ref={cardElementRef}></div>
                            </div>
                        </div>

                        {/* Info Message */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm text-blue-900">
                                <strong>No charge today.</strong> To reserve your appointment, we&apos;ll save a card on file. 
                                You will not be charged today. You will only be charged after service (or per our cancellation policy).
                            </p>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <p className="text-sm text-red-800">{error}</p>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={!stripe || !card || isProcessing}
                            className="w-full bg-alloy-blue text-white font-semibold px-6 py-3 rounded-lg hover:bg-alloy-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isProcessing ? "Processing..." : "Save Card & Confirm"}
                        </button>
                    </form>
                </div>
            </Section>
        </div>
    );
}
