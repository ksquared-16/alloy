"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Section from "@/components/Section";
import Accordion from "@/components/Accordion";
import SlotPicker, { TimeSlot } from "./SlotPicker";

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

interface DiscountData {
    code: string;
    discount_code_id: string;
    discount_amount: number;
    quote_total: number;
}

type BookingStep = "quote" | "slot_selection" | "confirming" | "confirmed" | "error";

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

export default function BookV2Client() {
    const searchParams = useSearchParams();
    const [quote, setQuote] = useState<QuoteResponse | null>(null);
    const [hasQuote, setHasQuote] = useState(false);
    const [step, setStep] = useState<BookingStep>("quote");
    const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
    const [bookingError, setBookingError] = useState<string | null>(null);
    const [bookingResult, setBookingResult] = useState<{
        schedule_id: string;
        job_id: string;
        opportunity_id: string;
    } | null>(null);

    // Discount code state (reused from /book)
    const [discountCode, setDiscountCode] = useState("");
    const [discountData, setDiscountData] = useState<DiscountData | null>(null);
    const [discountError, setDiscountError] = useState<string | null>(null);
    const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);

    const phone = searchParams?.get("phone");
    const email = searchParams?.get("email");
    const firstName = searchParams?.get("first_name");
    const lastName = searchParams?.get("last_name");
    const debug = searchParams?.get("debug") === "1";

    // Default timezone (can be enhanced to detect from user location)
    const timezone = "America/Los_Angeles";

    // Debug mode: Use mocked quote to bypass quote requirement
    const mockQuote: QuoteResponse = {
        status: "ready",
        source: "local_pricing",
        estimated_price: 150,
        first_clean_price: 150,
        recurring_price: 120,
        frequency_label: "Every 2 Weeks",
        service: "Standard Cleaning",
        price_breakdown: "Mock quote for testing",
        addons: [],
    };

    useEffect(() => {
        // Debug bypass: Skip quote loading and use mock quote
        if (debug) {
            console.log("[BOOK_V2_DEBUG] Debug mode enabled, using mock quote");
            setQuote(mockQuote);
            setHasQuote(true);
            setStep("slot_selection");
            return;
        }

        // Load quote from storage (try multiple keys for compatibility)
        try {
            // Try shared key first (alloy_quote_v1)
            let storedQuote = localStorage.getItem("alloy_quote_v1");
            
            // Fallback to original keys
            if (!storedQuote) {
                storedQuote = localStorage.getItem("cleaning_quote");
            }
            if (!storedQuote) {
                storedQuote = sessionStorage.getItem("alloy_cleaning_quote");
            }
            if (!storedQuote) {
                storedQuote = sessionStorage.getItem("cleaning_quote");
            }

            if (storedQuote) {
                const parsedQuote: QuoteResponse = JSON.parse(storedQuote);
                console.log("[BOOK_V2] Loaded quote from storage:", parsedQuote);
                setQuote(parsedQuote);
                const ready = isQuoteReady(parsedQuote);
                setHasQuote(ready);
                if (ready) {
                    setStep("slot_selection");
                } else {
                    console.warn("[BOOK_V2] Quote loaded but not ready:", {
                        hasFirst: typeof parsedQuote.first_clean_price === "number" || typeof parsedQuote.estimated_price === "number",
                        hasRecurring: typeof parsedQuote.recurring_price === "number",
                        hasFrequency: typeof parsedQuote.frequency_label === "string" && parsedQuote.frequency_label.trim().length > 0,
                    });
                }
            } else {
                console.warn("[BOOK_V2] No quote found in storage");
            }

            // Load discount data from prefill
            const prefill = sessionStorage.getItem("alloy_booking_prefill") ||
                localStorage.getItem("alloy_booking_prefill");
            if (prefill) {
                try {
                    const prefillData = JSON.parse(prefill);
                    if (prefillData.discount_code && prefillData.discount_code_id && prefillData.discount_amount) {
                        setDiscountData({
                            code: prefillData.discount_code,
                            discount_code_id: prefillData.discount_code_id,
                            discount_amount: prefillData.discount_amount,
                            quote_total: prefillData.quote_total || 0,
                        });
                        setDiscountCode(prefillData.discount_code);
                    }
                } catch (e) {
                    console.warn("Failed to load discount from prefill:", e);
                }
            }
        } catch (e) {
            console.error("Failed to load quote from storage:", e);
        }
    }, []);

    const handleSelectSlot = (slot: TimeSlot) => {
        setSelectedSlot(slot);
        setBookingError(null);
    };

    const handleConfirmBooking = async () => {
        if (!selectedSlot || !quote) {
            setBookingError("Please select a time slot");
            return;
        }

        setStep("confirming");
        setBookingError(null);

        try {
            // Get quote subtotal
            const quoteSubtotal =
                (typeof quote.first_clean_price === "number" && quote.first_clean_price > 0)
                    ? quote.first_clean_price
                    : (typeof quote.estimated_price === "number" && quote.estimated_price > 0)
                        ? quote.estimated_price
                        : 0;

            // Get contact info from prefill
            const prefill = sessionStorage.getItem("alloy_booking_prefill") ||
                localStorage.getItem("alloy_booking_prefill");
            let prefillData: any = {};
            if (prefill) {
                try {
                    prefillData = JSON.parse(prefill);
                } catch (e) {
                    console.warn("Failed to parse prefill:", e);
                }
            }

            const response = await fetch("/api/book-v2/confirm", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    slot_start: selectedSlot.isoStart,
                    slot_end: selectedSlot.isoEnd,
                    timezone: timezone,
                    quote_subtotal: quoteSubtotal,
                    discount_amount: discountData?.discount_amount || 0,
                    quote_total: discountData?.quote_total || quoteSubtotal,
                    discount_code_id: discountData?.discount_code_id || null,
                    contact_email: email || prefillData.email,
                    contact_phone: phone || prefillData.phone,
                    contact_first_name: firstName || prefillData.first_name,
                    contact_last_name: lastName || prefillData.last_name,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to confirm booking");
            }

            const result = await response.json();
            setBookingResult(result);
            setStep("confirmed");
        } catch (err: any) {
            console.error("Booking confirmation failed:", err);
            setBookingError(err.message || "Failed to confirm booking. Please try again.");
            setStep("slot_selection");
        }
    };

    // Validate discount code (reused from /book)
    const handleValidateDiscount = async () => {
        if (!discountCode.trim() || !quote) {
            setDiscountError("Please enter a discount code");
            return;
        }

        setIsValidatingDiscount(true);
        setDiscountError(null);

        try {
            const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
            const quoteSubtotal =
                (typeof quote.first_clean_price === "number" && quote.first_clean_price > 0)
                    ? quote.first_clean_price
                    : (typeof quote.estimated_price === "number" && quote.estimated_price > 0)
                        ? quote.estimated_price
                        : 0;

            if (quoteSubtotal === 0) {
                setDiscountError("Quote price not available");
                setIsValidatingDiscount(false);
                return;
            }

            const prefill = sessionStorage.getItem("alloy_booking_prefill") ||
                localStorage.getItem("alloy_booking_prefill");
            let emailParam: string | undefined;
            let phoneParam: string | undefined;

            if (prefill) {
                try {
                    const prefillData = JSON.parse(prefill);
                    emailParam = prefillData.email || email || undefined;
                    phoneParam = prefillData.phone || phone || undefined;
                } catch (e) {
                    console.warn("Failed to parse prefill:", e);
                }
            }

            if (!emailParam && !phoneParam) {
                emailParam = email || undefined;
                phoneParam = phone || undefined;
            }

            const response = await fetch(`${apiBaseUrl}/discounts/validate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    code: discountCode.trim(),
                    email: emailParam,
                    phone: phoneParam,
                    quote_subtotal: quoteSubtotal,
                    vertical_key: "cleaning",
                }),
            });

            const data = await response.json();

            if (data.valid) {
                setDiscountData({
                    code: discountCode.trim().toUpperCase(),
                    discount_code_id: data.discount_code_id,
                    discount_amount: data.discount_amount,
                    quote_total: data.quote_total,
                });
                setDiscountError(null);

                // Store in prefill
                const existingPrefill = sessionStorage.getItem("alloy_booking_prefill") ||
                    localStorage.getItem("alloy_booking_prefill");
                let prefillData: any = {};
                if (existingPrefill) {
                    try {
                        prefillData = JSON.parse(existingPrefill);
                    } catch (e) {
                        console.warn("Failed to parse prefill:", e);
                    }
                }
                prefillData.discount_code = discountCode.trim().toUpperCase();
                prefillData.discount_code_id = data.discount_code_id;
                prefillData.discount_amount = data.discount_amount;
                prefillData.quote_total = data.quote_total;
                const jsonData = JSON.stringify(prefillData);
                sessionStorage.setItem("alloy_booking_prefill", jsonData);
                localStorage.setItem("alloy_booking_prefill", jsonData);
            } else {
                if (data.reason === "already_used") {
                    setDiscountError("This discount code has already been used");
                } else {
                    setDiscountError("Invalid discount code");
                }
                setDiscountData(null);
            }
        } catch (error) {
            console.error("Failed to validate discount code:", error);
            setDiscountError("Failed to validate discount code. Please try again.");
            setDiscountData(null);
        } finally {
            setIsValidatingDiscount(false);
        }
    };

    return (
        <div className="min-h-screen py-6 md:py-10">
            <Section className="max-w-7xl">
                {/* Fallback message if no quote found (skip in debug mode) */}
                {!hasQuote && step === "quote" && !debug && (
                    <div className="bg-white rounded-xl overflow-hidden border border-alloy-stone/20 shadow-sm p-6 md:p-8 mb-5 text-center">
                        <h2 className="text-2xl font-bold text-alloy-midnight mb-3">
                            Please start your quote first
                        </h2>
                        <p className="text-sm text-alloy-midnight/80 mb-6">
                            To book a cleaning, please fill out the quote form first.
                        </p>
                        <div className="space-y-3">
                            <a
                                href="/services/cleaning?open=1#quote-form"
                                className="inline-block bg-alloy-blue text-white font-semibold px-6 py-3 rounded-lg hover:bg-alloy-blue/90 transition-colors"
                            >
                                Get a Quote
                            </a>
                            <div className="text-xs text-alloy-midnight/60">
                                <p className="mb-2">Debug: Add <code className="bg-alloy-stone/30 px-2 py-1 rounded">?debug=1</code> to test booking UI</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Two-column layout: Quote (1/4) + Slot Picker (3/4) */}
                {hasQuote && step !== "confirmed" && (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                        {/* Left column: Quote panel (1/4 width) - reused from /book */}
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-5 sticky top-6">
                                <div className="space-y-4 text-left">
                                    <h2 className="text-lg font-bold text-alloy-midnight mb-3">
                                        Your Quote
                                    </h2>

                                    {/* First Cleaning */}
                                    <div>
                                        <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-1">
                                            First Cleaning
                                        </p>
                                        {(() => {
                                            const basePrice =
                                                (typeof quote?.first_clean_price === "number" &&
                                                    quote.first_clean_price > 0
                                                    ? quote.first_clean_price
                                                    : typeof quote?.estimated_price === "number" &&
                                                        quote.estimated_price > 0
                                                        ? quote.estimated_price
                                                        : null);

                                            if (basePrice == null || basePrice <= 0) {
                                                return (
                                                    <p className="text-sm text-alloy-midnight/70">Calculating…</p>
                                                );
                                            }

                                            const displayPrice = discountData?.quote_total ?? basePrice;
                                            const showDiscount = discountData && discountData.discount_amount > 0;

                                            return (
                                                <div>
                                                    {showDiscount && (
                                                        <div className="mb-1">
                                                            <span className="text-sm text-alloy-midnight/60 line-through">
                                                                ${basePrice.toFixed(2)}
                                                            </span>
                                                            <span className="text-xs text-green-600 ml-2 font-semibold">
                                                                -${discountData.discount_amount.toFixed(2)}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <p className="text-2xl font-bold text-alloy-blue leading-tight">
                                                        ${displayPrice.toFixed(2)}
                                                    </p>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* Discount Code Input */}
                                    <div className="pt-2 border-t border-alloy-stone/20">
                                        {discountData ? (
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-green-600 font-semibold">
                                                        Discount Applied: {discountData.code}
                                                    </span>
                                                    <button
                                                        onClick={() => {
                                                            setDiscountData(null);
                                                            setDiscountCode("");
                                                            setDiscountError(null);
                                                        }}
                                                        className="text-xs text-alloy-midnight/60 hover:text-alloy-midnight underline"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide">
                                                    Discount Code
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={discountCode}
                                                        onChange={(e) => {
                                                            setDiscountCode(e.target.value.toUpperCase());
                                                            setDiscountError(null);
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") {
                                                                handleValidateDiscount();
                                                            }
                                                        }}
                                                        placeholder="Enter code"
                                                        className="flex-1 text-sm px-3 py-2 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-transparent"
                                                        disabled={isValidatingDiscount}
                                                    />
                                                    <button
                                                        onClick={handleValidateDiscount}
                                                        disabled={isValidatingDiscount || !discountCode.trim()}
                                                        className="px-4 py-2 bg-alloy-blue text-white text-sm font-semibold rounded-lg hover:bg-alloy-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {isValidatingDiscount ? "..." : "Apply"}
                                                    </button>
                                                </div>
                                                {discountError && (
                                                    <p className="text-xs text-red-600">{discountError}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Recurring Cleaning */}
                                    {quote?.recurring_price !== undefined &&
                                        quote.recurring_price !== null &&
                                        quote.recurring_price > 0 &&
                                        quote.frequency_label && (
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
                                        )}

                                    {/* Add-ons */}
                                    {quote?.addons && quote.addons.length > 0 && (
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

                                    {/* Price Breakdown */}
                                    {quote?.price_breakdown && (
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

                        {/* Right column: Slot Picker (3/4 width) */}
                        <div className="lg:col-span-3">
                            <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-6">
                                <h2 className="text-xl font-bold text-alloy-midnight mb-6">
                                    Select a Time Slot
                                </h2>

                                {step === "slot_selection" && (
                                    <>
                                        <SlotPicker
                                            selectedSlot={selectedSlot}
                                            onSelectSlot={handleSelectSlot}
                                            timezone={timezone}
                                            error={bookingError}
                                        />

                                        {selectedSlot && (
                                            <div className="mt-6 pt-6 border-t border-alloy-stone/20">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div>
                                                        <p className="text-sm text-alloy-midnight/70">
                                                            Selected: <strong>{selectedSlot.timeWindow}</strong>
                                                        </p>
                                                        <p className="text-xs text-alloy-midnight/60 mt-1">
                                                            {selectedSlot.start.toLocaleDateString("en-US", {
                                                                weekday: "long",
                                                                month: "long",
                                                                day: "numeric",
                                                                timeZone: timezone,
                                                            })}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={handleConfirmBooking}
                                                        disabled={step !== "slot_selection"}
                                                        className="px-6 py-3 bg-alloy-blue text-white font-semibold rounded-lg hover:bg-alloy-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {step !== "slot_selection" ? "Confirming..." : "Confirm Booking"}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}

                                {step === "confirming" && (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="text-center">
                                            <div className="w-12 h-12 border-4 border-alloy-blue border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                                            <p className="text-alloy-midnight font-semibold">Confirming your booking...</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Confirmation Screen */}
                {step === "confirmed" && bookingResult && (
                    <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-8 md:p-12 text-center">
                        <div className="mb-6">
                            <svg
                                className="w-20 h-20 mx-auto text-alloy-juniper"
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
                        <h2 className="text-3xl font-bold text-alloy-midnight mb-4">
                            You're all set!
                        </h2>
                        <p className="text-lg text-alloy-midnight/80 mb-6">
                            Your booking has been confirmed. We'll text you shortly to confirm details.
                        </p>
                        {selectedSlot && (
                            <div className="bg-alloy-stone/30 rounded-lg p-4 mb-6 inline-block">
                                <p className="text-sm text-alloy-midnight/70 mb-1">Scheduled for:</p>
                                <p className="text-lg font-semibold text-alloy-midnight">
                                    {selectedSlot.timeWindow}
                                </p>
                                <p className="text-sm text-alloy-midnight/60 mt-1">
                                    {selectedSlot.start.toLocaleDateString("en-US", {
                                        weekday: "long",
                                        month: "long",
                                        day: "numeric",
                                        timeZone: timezone,
                                    })}
                                </p>
                            </div>
                        )}
                        <a
                            href="/"
                            className="inline-block bg-alloy-blue text-white font-semibold px-8 py-3 rounded-lg hover:bg-alloy-blue/90 transition-colors"
                        >
                            Return to Home
                        </a>
                    </div>
                )}
            </Section>
        </div>
    );
}

