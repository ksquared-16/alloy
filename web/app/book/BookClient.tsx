"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Section from "@/components/Section";
import Accordion from "@/components/Accordion";
import { REDIRECT_DELAY_MS } from "@/lib/ui";

// GHL Booking Iframe Component
// Note: form_embed.js is loaded globally via GhlScript in layout.tsx
function GhlBookingIframe({
    phone,
    email,
    firstName,
    lastName,
    contactId,
}: {
    phone: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    contactId: string | null;
}) {
    // Build GHL booking widget URL with prefill parameters
    // Redirect to payment page after calendar selection
    const buildBookingUrl = () => {
        const baseUrl = "https://api.leadconnectorhq.com/widget/booking/GficiTFm4cbAbQ05IHwz";
        // Use window.location.origin to ensure staging stays on staging domain
        const redirectUrl = typeof window !== "undefined"
            ? `${window.location.origin}/payment`
            : "/payment"; // Fallback for SSR
        const params = new URLSearchParams({
            redirectUrl,
        });

        // Add prefill parameters if available (for contact matching)
        if (phone) params.append("phone", phone);
        if (email) params.append("email", email);
        if (firstName) params.append("first_name", firstName);
        if (lastName) params.append("last_name", lastName);
        if (contactId) params.append("lead_contact_id", contactId);

        return `${baseUrl}?${params.toString()}`;
    };

    // Generate unique ID for iframe (static ID as per GHL requirements)
    const iframeId = "GficiTFm4cbAbQ05IHwz_1767381006867";

    return (
        <>
            <iframe
                src={buildBookingUrl()}
                style={{ width: "100%", border: "none", overflow: "hidden" }}
                scrolling="no"
                id={iframeId}
                title="Booking Calendar"
                className="min-h-[1200px] md:min-h-[900px]"
            />
        </>
    );
}

interface QuoteResponse {
    status?: "ready" | "pending" | "not_found" | "error";
    source?: "local_pricing" | "supabase";
    estimated_price?: number;
    first_clean_price?: number;
    recurring_price?: number;
    frequency_label?: string;
    service?: string;
    discount_label?: string;
    price_breakdown?: string;
    addons?: Array<{ name: string; price: number | null }>;
}

type FetchStatus = "idle" | "loading" | "ready" | "timeout" | "error";

function isQuoteReady(data: QuoteResponse | null): boolean {
    if (!data) return false;
    const hasFirst =
        typeof data.first_clean_price === "number" ||
        typeof data.estimated_price === "number";
    const hasRecurring = typeof data.recurring_price === "number";
    const hasFrequency =
        typeof data.frequency_label === "string" &&
        data.frequency_label.trim().length > 0;
    return hasFirst && hasRecurring && hasFrequency;
}

export default function BookClient() {
    const searchParams = useSearchParams();
    const [quote, setQuote] = useState<QuoteResponse | null>(null);
    const [fetchStatus, setFetchStatus] = useState<FetchStatus>("idle");
    const [showBookingSuccess, setShowBookingSuccess] = useState(false);
    const phone = searchParams?.get("phone");
    const email = searchParams?.get("email");
    const firstName = searchParams?.get("first_name");
    const lastName = searchParams?.get("last_name");
    const estimatedPrice = searchParams?.get("estimated_price");

    useEffect(() => {
        // Read quote from localStorage or sessionStorage (prefer localStorage)
        try {
            // Try localStorage first (new storage location)
            let storedQuote = localStorage.getItem("cleaning_quote");
            if (!storedQuote) {
                // Fallback to sessionStorage (backward compatibility)
                storedQuote = sessionStorage.getItem("alloy_cleaning_quote");
            }

            if (storedQuote) {
                const parsedQuote: QuoteResponse = JSON.parse(storedQuote);
                setQuote(parsedQuote);
                setFetchStatus("ready");
                console.log("Loaded quote from storage:", parsedQuote);
            } else {
                setFetchStatus("error");
                setQuote(null);
            }
        } catch (e) {
            console.error("Failed to load quote from storage:", e);
            setFetchStatus("error");
            setQuote(null);
        }
    }, []);

    // Initialize alloy_booking_prefill from alloy_lead_form_data if it doesn't exist
    // This ensures phone/email are available for PaymentClient even if query params are missing
    useEffect(() => {
        const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";

        // Check if alloy_booking_prefill already exists
        const existingPrefill = sessionStorage.getItem("alloy_booking_prefill") ||
            localStorage.getItem("alloy_booking_prefill");

        if (existingPrefill) {
            // Already exists, no need to initialize
            if (isStaging) {
                console.log("[STAGING] alloy_booking_prefill already exists, skipping initialization");
            }
            return;
        }

        // Try to load from alloy_lead_form_data (stored when quote form was submitted)
        try {
            const storedFormData = sessionStorage.getItem("alloy_lead_form_data");
            if (storedFormData) {
                const formData = JSON.parse(storedFormData);

                // Only initialize if we have phone and email
                if (formData.phone && formData.email) {
                    const prefillData = {
                        phone: formData.phone,
                        email: formData.email,
                        first_name: formData.first_name || undefined,
                        last_name: formData.last_name || undefined,
                    };

                    // Remove undefined values
                    const cleanedData = Object.fromEntries(
                        Object.entries(prefillData).filter(([_, v]) => v !== undefined)
                    );

                    const jsonData = JSON.stringify(cleanedData);
                    sessionStorage.setItem("alloy_booking_prefill", jsonData);
                    localStorage.setItem("alloy_booking_prefill", jsonData);

                    if (isStaging) {
                        console.log("[STAGING] Initialized alloy_booking_prefill from alloy_lead_form_data", cleanedData);
                    }
                } else {
                    if (isStaging) {
                        console.log("[STAGING] alloy_lead_form_data missing phone or email, cannot initialize prefill");
                    }
                }
            } else {
                if (isStaging) {
                    console.log("[STAGING] No alloy_lead_form_data found, cannot initialize prefill");
                }
            }
        } catch (e) {
            console.warn("Failed to initialize alloy_booking_prefill from form data:", e);
        }
    }, []);

    // Submit lead to backend/GHL if quote exists and ghl_contact_id is missing (Standard Cleaning only)
    useEffect(() => {
        const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";

        // Only submit for Standard Cleaning (not Move-Out)
        if (!quote || quote.service === "Move-Out / Heavy Clean") return;

        // Check if ghl_contact_id already exists (idempotent check)
        let hasGhlContactId = false;
        try {
            // Check sessionStorage first (alloy_booking_prefill)
            const sessionPrefill = sessionStorage.getItem("alloy_booking_prefill");
            if (sessionPrefill) {
                const parsed = JSON.parse(sessionPrefill);
                if (parsed.ghl_contact_id) {
                    hasGhlContactId = true;
                    if (isStaging) {
                        console.log("[STAGING] ghl_contact_id already exists in sessionStorage, skipping lead submission");
                    }
                }
            }

            // Check localStorage as fallback
            if (!hasGhlContactId) {
                const localPrefill = localStorage.getItem("alloy_booking_prefill");
                if (localPrefill) {
                    const parsed = JSON.parse(localPrefill);
                    if (parsed.ghl_contact_id) {
                        hasGhlContactId = true;
                        if (isStaging) {
                            console.log("[STAGING] ghl_contact_id already exists in localStorage, skipping lead submission");
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("Failed to check for existing ghl_contact_id:", e);
        }

        if (hasGhlContactId) return; // Skip submission if contact already exists

        // Load form data from storage
        let formData: any = null;
        try {
            const storedFormData = sessionStorage.getItem("alloy_lead_form_data");
            if (storedFormData) {
                formData = JSON.parse(storedFormData);
            }
        } catch (e) {
            console.warn("Failed to load form data from storage:", e);
        }

        // Need form data to submit lead
        if (!formData || !formData.phone || !formData.email) {
            if (isStaging) {
                console.log("[STAGING] Missing form data for lead submission, skipping");
            }
            return;
        }

        // Only submit for Standard Cleaning service type
        if (formData.service_type !== "Standard Cleaning") {
            return;
        }

        if (isStaging) {
            console.log("[STAGING] Submitting Standard Cleaning lead to backend from /book page");
        }

        // Submit lead in background (non-blocking)
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
        const submitFormData = new FormData();

        // Build FormData from stored form data
        if (formData.first_name) submitFormData.append("first_name", formData.first_name);
        if (formData.last_name) submitFormData.append("last_name", formData.last_name);
        if (formData.phone) submitFormData.append("phone", formData.phone);
        if (formData.email) submitFormData.append("email", formData.email);
        if (formData.postal_code) submitFormData.append("postal_code", formData.postal_code);
        if (formData.home_type) submitFormData.append("home_type", formData.home_type);
        if (formData.service_type) submitFormData.append("service_type", formData.service_type);
        if (formData.approximate_square_footage) submitFormData.append("approximate_square_footage", formData.approximate_square_footage);
        if (formData.cleaning_frequency) submitFormData.append("cleaning_frequency", formData.cleaning_frequency);
        if (formData.preferred_service_date) submitFormData.append("preferred_service_date", formData.preferred_service_date);
        if (formData.extras_add_ons) submitFormData.append("extras_add_ons", formData.extras_add_ons);
        if (formData.addons__frequency) submitFormData.append("addons__frequency", formData.addons__frequency);
        if (formData.street_address) submitFormData.append("street_address", formData.street_address);

        // Fire-and-forget with timeout
        const submitPromise = fetch(`${apiBaseUrl}/leads/cleaning`, {
            method: "POST",
            body: submitFormData,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("timeout")), 5000);
        });

        Promise.race([submitPromise, timeoutPromise])
            .then(async (response) => {
                if (response instanceof Response) {
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        if (isStaging) {
                            console.error("[STAGING] Lead submission failed:", {
                                status: response.status,
                                error: errorData
                            });
                        } else {
                            console.warn("Lead submission failed (non-blocking):", response.status);
                        }
                        return;
                    }

                    const backendResult = await response.json();
                    if (isStaging) {
                        console.log("[STAGING] Lead submission successful:", {
                            contact_id: backendResult.contact_id,
                            status: backendResult.status
                        });
                    }

                    // Store ghl_contact_id as PRIMARY identifier
                    if (backendResult.contact_id) {
                        try {
                            // Read existing prefill data or create new
                            const existingPrefill = sessionStorage.getItem("alloy_booking_prefill");
                            let prefillData: any = {};

                            if (existingPrefill) {
                                try {
                                    prefillData = JSON.parse(existingPrefill);
                                } catch (e) {
                                    console.warn("Failed to parse existing prefill data:", e);
                                }
                            }

                            // Store ghl_contact_id as PRIMARY identifier (set first)
                            prefillData.ghl_contact_id = backendResult.contact_id;
                            // Also store supporting data for fallback
                            prefillData.phone = formData.phone;
                            prefillData.email = formData.email;
                            prefillData.first_name = formData.first_name;
                            prefillData.last_name = formData.last_name;

                            // Store in both sessionStorage and localStorage for persistence
                            const jsonData = JSON.stringify(prefillData);
                            sessionStorage.setItem("alloy_booking_prefill", jsonData);
                            localStorage.setItem("alloy_booking_prefill", jsonData);

                            if (isStaging) {
                                console.log("[STAGING] Stored ghl_contact_id as primary identifier", {
                                    ghl_contact_id: backendResult.contact_id,
                                    phone: formData.phone,
                                    email: formData.email
                                });
                            }
                        } catch (e) {
                            console.warn("Failed to persist ghl_contact_id:", e);
                        }
                    }
                }
            })
            .catch((error) => {
                if (error.message === "timeout") {
                    if (isStaging) {
                        console.warn("[STAGING] Lead submission timeout (non-blocking)");
                    }
                } else {
                    if (isStaging) {
                        console.error("[STAGING] Lead submission error:", error);
                    } else {
                        console.warn("Lead submission error (non-blocking):", error);
                    }
                }
            });
    }, [quote]);

    // Poll backend in background to upgrade quote (if phone is available)
    // SKIP polling if quote.source === "supabase" (Supabase is source of truth)
    useEffect(() => {
        if (!phone || !quote) return; // Only poll if we have a phone and initial quote

        // Skip polling entirely if quote is from Supabase (source of truth)
        if (quote.source === "supabase") {
            console.log("Skipping poll - quote is from Supabase (source of truth)");
            return;
        }

        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
        let pollCount = 0;
        const MAX_POLLS = 5;
        const POLL_INTERVAL = 750; // 750ms

        const pollQuote = async () => {
            if (pollCount >= MAX_POLLS) {
                console.log("Stopped polling after max attempts");
                return;
            }

            // Stop early if quote is already complete
            if (quote.status === "ready" && quote.recurring_price) {
                console.log("Quote already complete, stopping poll");
                return;
            }

            pollCount++;

            try {
                const response = await fetch(
                    `${apiBaseUrl}/quote/cleaning?phone=${encodeURIComponent(phone)}`
                );

                if (response.ok) {
                    const serverQuote: QuoteResponse = await response.json();

                    // Merge server quote with existing quote (preserve Supabase fields)
                    if (serverQuote.status === "ready") {
                        // Only merge fields that don't already exist in current quote
                        // Preserve: frequency_label, discount_label, recurring_price, price_breakdown if they exist
                        const mergedQuote: QuoteResponse = {
                            ...quote,
                            ...serverQuote,
                            // Never overwrite these fields if they already exist (check for null/undefined, not falsy)
                            frequency_label: (quote.frequency_label !== null && quote.frequency_label !== undefined)
                                ? quote.frequency_label
                                : serverQuote.frequency_label,
                            discount_label: (quote.discount_label !== null && quote.discount_label !== undefined)
                                ? quote.discount_label
                                : serverQuote.discount_label,
                            recurring_price: (quote.recurring_price !== null && quote.recurring_price !== undefined)
                                ? quote.recurring_price
                                : serverQuote.recurring_price,
                            price_breakdown: (quote.price_breakdown !== null && quote.price_breakdown !== undefined)
                                ? quote.price_breakdown
                                : serverQuote.price_breakdown,
                        };

                        setQuote(mergedQuote);
                        // Update both localStorage and sessionStorage with merged quote
                        try {
                            localStorage.setItem("cleaning_quote", JSON.stringify(mergedQuote));
                            sessionStorage.setItem("alloy_cleaning_quote", JSON.stringify(mergedQuote));
                        } catch (e) {
                            console.warn("Failed to update storage:", e);
                        }
                        console.log("Merged quote from server (preserved existing fields):", mergedQuote);
                        return; // Stop polling once we have complete quote
                    }
                }
            } catch (error) {
                console.warn("Poll error (non-blocking):", error);
            }

            // Schedule next poll
            if (pollCount < MAX_POLLS) {
                setTimeout(pollQuote, POLL_INTERVAL);
            }
        };

        // Start polling after initial delay
        const timeoutId = setTimeout(pollQuote, POLL_INTERVAL);

        return () => clearTimeout(timeoutId);
    }, [phone, quote]);

    const hasQuote =
        !!quote &&
        ((typeof quote.first_clean_price === "number" &&
            quote.first_clean_price > 0) ||
            (typeof quote.estimated_price === "number" &&
                quote.estimated_price > 0));

    // Listen for booking completion
    useEffect(() => {
        // Check URL for booking completion parameters
        const checkBookingComplete = () => {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get("booking") === "complete" || urlParams.get("success") === "true" || urlParams.get("booked") === "true") {
                setShowBookingSuccess(true);
                // Clear both localStorage and sessionStorage on booking completion
                try {
                    localStorage.removeItem("cleaning_quote");
                    sessionStorage.removeItem("alloy_cleaning_quote");
                } catch (e) {
                    console.warn("Failed to clear storage:", e);
                }
                setTimeout(() => {
                    window.location.href = "/";
                }, REDIRECT_DELAY_MS);
            }
        };

        // Check on mount
        checkBookingComplete();

        // Listen for postMessage events from GHL booking iframe
        const handleMessage = (event: MessageEvent) => {
            // GHL booking widget may send completion events
            if (
                event.data &&
                (event.data.type === "booking_complete" ||
                    event.data.event === "booking_completed" ||
                    event.data.bookingComplete ||
                    (typeof event.data === "string" && event.data.includes("booking")))
            ) {
                console.log("Booking completion detected:", event.data);
                setShowBookingSuccess(true);
                // Clear both localStorage and sessionStorage on booking completion
                try {
                    localStorage.removeItem("cleaning_quote");
                    sessionStorage.removeItem("alloy_cleaning_quote");
                } catch (e) {
                    console.warn("Failed to clear storage:", e);
                }
                setTimeout(() => {
                    window.location.href = "/";
                }, REDIRECT_DELAY_MS);
            }
        };

        // Listen for URL hash changes (GHL sometimes uses hash for redirects)
        const handleHashChange = () => {
            if (window.location.hash.includes("success") || window.location.hash.includes("complete")) {
                setShowBookingSuccess(true);
                // Clear both localStorage and sessionStorage on booking completion
                try {
                    localStorage.removeItem("cleaning_quote");
                    sessionStorage.removeItem("alloy_cleaning_quote");
                } catch (e) {
                    console.warn("Failed to clear storage:", e);
                }
                setTimeout(() => {
                    window.location.href = "/";
                }, REDIRECT_DELAY_MS);
            }
        };

        window.addEventListener("message", handleMessage);
        window.addEventListener("hashchange", handleHashChange);

        // Poll URL for changes (fallback for GHL redirects)
        const pollInterval = setInterval(() => {
            checkBookingComplete();
        }, 1000);

        return () => {
            window.removeEventListener("message", handleMessage);
            window.removeEventListener("hashchange", handleHashChange);
            clearInterval(pollInterval);
        };
    }, []);

    return (
        <div className="min-h-screen py-6 md:py-10">
            <Section className="max-w-7xl">
                {/* Debug strip - only in development */}
                {process.env.NODE_ENV !== "production" && (
                    <div className="mb-4 p-4 bg-alloy-stone rounded-lg border border-alloy-stone/40">
                        <p className="text-sm font-mono text-alloy-midnight">
                            <strong>Debug phone param:</strong> {phone ?? "NULL"}
                        </p>
                        <p className="text-sm font-mono text-alloy-midnight mt-1">
                            <strong>API Base URL:</strong>{" "}
                            {process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000 (default)"}
                        </p>
                    </div>
                )}

                {/* Fallback message if no quote found */}
                {!hasQuote && fetchStatus === "error" && (
                    <div className="bg-white rounded-xl overflow-hidden border border-alloy-stone/20 shadow-sm p-6 md:p-8 mb-5 text-center">
                        <h2 className="text-2xl font-bold text-alloy-midnight mb-3">
                            Please start your quote first
                        </h2>
                        <p className="text-sm text-alloy-midnight/80 mb-6">
                            To book a cleaning, please fill out the quote form first.
                        </p>
                        <a
                            href="/services/cleaning?open=1#quote-form"
                            className="inline-block bg-alloy-blue text-white font-semibold px-6 py-3 rounded-lg hover:bg-alloy-blue/90 transition-colors"
                        >
                            Get a Quote
                        </a>
                    </div>
                )}

                {/* Two-column layout: Quote (1/4) + Calendar (3/4) */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                    {/* Left column: Quote panel (1/4 width) */}
                    {quote && hasQuote && (() => {
                        // Staging-only debug log
                        if (process.env.NEXT_PUBLIC_APP_ENV === "staging") {
                            console.log("[STAGING] Quote labels", {
                                frequency_label: quote.frequency_label,
                                discount_label: quote.discount_label,
                                recurring_price: quote.recurring_price,
                                price_breakdown: quote.price_breakdown
                            });
                        }

                        return (
                            <div className="lg:col-span-1">
                                <div className="bg-white rounded-xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-5 sticky top-6">
                                    <div className="space-y-4 text-left">
                                        <h2 className="text-lg font-bold text-alloy-midnight mb-3">
                                            Your Quote
                                        </h2>

                                        {/* First Cleaning - stacked vertically */}
                                        <div>
                                            <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-1">
                                                First Cleaning
                                            </p>
                                            {(() => {
                                                const price =
                                                    (typeof quote.first_clean_price === "number" &&
                                                        quote.first_clean_price > 0
                                                        ? quote.first_clean_price
                                                        : typeof quote.estimated_price === "number" &&
                                                            quote.estimated_price > 0
                                                            ? quote.estimated_price
                                                            : null);
                                                return price != null && price > 0 ? (
                                                    <p className="text-2xl font-bold text-alloy-blue leading-tight">
                                                        ${price.toFixed(2)}
                                                    </p>
                                                ) : (
                                                    <p className="text-sm text-alloy-midnight/70">Calculating…</p>
                                                );
                                            })()}
                                        </div>

                                        {/* Recurring Cleaning - stacked vertically */}
                                        {(() => {
                                            // Staging-only debug log
                                            if (process.env.NEXT_PUBLIC_APP_ENV === "staging") {
                                                console.log("[STAGING] Recurring section render", {
                                                    source: quote.source,
                                                    recurring_price: quote.recurring_price,
                                                    frequency_label: quote.frequency_label,
                                                    discount_label: quote.discount_label,
                                                    price_breakdown: quote.price_breakdown
                                                });
                                            }

                                            if (quote.recurring_price !== undefined &&
                                                quote.recurring_price !== null &&
                                                quote.recurring_price > 0 &&
                                                quote.frequency_label) {
                                                return (
                                                    <div>
                                                        <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-1">
                                                            {quote.frequency_label.toUpperCase()} CLEANING
                                                            {quote.discount_label && (
                                                                <span className="normal-case text-[11px] text-alloy-midnight/70 ml-1">
                                                                    ({quote.discount_label})
                                                                </span>
                                                            )}
                                                        </p>
                                                        <div className="flex items-baseline gap-1">
                                                            <p className="text-2xl font-bold text-alloy-juniper leading-tight">
                                                                ${quote.recurring_price.toFixed(2)}
                                                            </p>
                                                            <span className="text-xs text-alloy-midnight/60">
                                                                per visit
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}

                                        {/* Add-ons - stacked vertically */}
                                        {quote.addons && quote.addons.length > 0 && (
                                            <div>
                                                <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-2">
                                                    Add-ons
                                                </p>
                                                <div className="space-y-1.5">
                                                    {quote.addons.map((addon, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="flex justify-between items-center py-1 border-b border-alloy-stone/15 last:border-b-0"
                                                        >
                                                            <span className="text-xs text-alloy-midnight/85">
                                                                {addon.name}
                                                            </span>
                                                            <span className="text-xs font-semibold text-alloy-midnight">
                                                                {addon.price === null || addon.price === undefined
                                                                    ? "included"
                                                                    : `$${addon.price.toFixed(2)}`}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Price Breakdown Accordion */}
                                        {quote.price_breakdown && (
                                            <div>
                                                <Accordion title="See full price breakdown">
                                                    <div className="text-xs text-alloy-midnight/80 whitespace-pre-line leading-relaxed">
                                                        {quote.price_breakdown}
                                                    </div>
                                                </Accordion>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Right column: Calendar (3/4 width) */}
                    <div className={quote && hasQuote ? "lg:col-span-3" : "lg:col-span-4"}>
                        <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-6">
                            <GhlBookingIframe
                                phone={phone}
                                email={email}
                                firstName={firstName}
                                lastName={lastName}
                                contactId={null}
                            />
                            <p className="text-sm text-alloy-midnight/60 mt-4 text-center">
                                You&apos;ll pay after the clean is completed. We&apos;ll text to confirm details.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Booking Success Modal */}
                {showBookingSuccess && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
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
                            <h2 className="text-2xl font-bold text-alloy-midnight mb-3">
                                You&apos;re booked!
                            </h2>
                            <p className="text-alloy-midnight/80 mb-6">
                                We&apos;ll text you shortly to confirm details.
                            </p>
                            <p className="text-sm text-alloy-midnight/60">
                                Redirecting to homepage...
                            </p>
                        </div>
                    </div>
                )}

                {/* Frontend debug block (non-production only) */}
                {process.env.NODE_ENV !== "production" && quote && (
                    <div className="mt-6 p-3 bg-alloy-stone rounded-lg border border-alloy-stone/60">
                        <p className="text-xs font-semibold text-alloy-midnight mb-1">
                            Quote JSON (debug):
                        </p>
                        <pre className="text-[11px] font-mono whitespace-pre-wrap break-all text-alloy-midnight/90">
                            {JSON.stringify(quote, null, 2)}
                        </pre>
                    </div>
                )}
            </Section>
        </div>
    );
}

