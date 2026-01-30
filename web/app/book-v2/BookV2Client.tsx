"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { loadStripe, Stripe, StripeElements, StripeCardElement } from "@stripe/stripe-js";
import Section from "@/components/Section";
import Accordion from "@/components/Accordion";
import SlotPicker, { TimeSlot } from "./SlotPicker";
import ServiceDetailsForm, { ServiceDetails } from "./ServiceDetailsForm";
import ServiceDetailsSummary from "./ServiceDetailsSummary";

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

type BookingStep = "slot_selection" | "service_details" | "payment" | "confirmed" | "error";

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
    const [currentStep, setCurrentStep] = useState<BookingStep>("slot_selection");
    const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
    const [slotConfirmed, setSlotConfirmed] = useState(false);
    const [serviceDetails, setServiceDetails] = useState<ServiceDetails | null>(null);
    const [serviceDetailsValid, setServiceDetailsValid] = useState(false);
    const [serviceDetailsConfirmed, setServiceDetailsConfirmed] = useState(false);
    const [serviceDetailsSnapshot, setServiceDetailsSnapshot] = useState<ServiceDetails | null>(null);
    const [bookingError, setBookingError] = useState<string | null>(null);
    const [bookingResult, setBookingResult] = useState<{
        schedule_id: string;
        job_id: string;
        opportunity_id: string;
    } | null>(null);

    // Discount code state
    const [discountCode, setDiscountCode] = useState("");
    const [discountData, setDiscountData] = useState<DiscountData | null>(null);
    const [discountError, setDiscountError] = useState<string | null>(null);
    const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);

    // Stripe state
    const [mounted, setMounted] = useState(false);
    const [stripe, setStripe] = useState<Stripe | null>(null);
    const [elements, setElements] = useState<StripeElements | null>(null);
    const [card, setCard] = useState<StripeCardElement | null>(null);
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const cardElementRef = useRef<HTMLDivElement>(null);

    const debug = searchParams?.get("debug") === "1";
    
    // Resolve email/phone with priority: query params > localStorage > debug mock
    const [resolvedEmail, setResolvedEmail] = useState<string | null>(null);
    const [resolvedPhone, setResolvedPhone] = useState<string | null>(null);
    const [resolvedFirstName, setResolvedFirstName] = useState<string | null>(null);
    const [resolvedLastName, setResolvedLastName] = useState<string | null>(null);

    // Default timezone
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
        setMounted(true);
    }, []);

    // Resolve email/phone from multiple sources
    useEffect(() => {
        if (debug) {
            // Debug mode: use mock contact info
            setResolvedEmail("test@example.com");
            setResolvedPhone("+15415551234");
            setResolvedFirstName("Test");
            setResolvedLastName("User");
            return;
        }

        // Priority 1: Query params
        const queryEmail = searchParams?.get("email");
        const queryPhone = searchParams?.get("phone");
        const queryFirstName = searchParams?.get("first_name");
        const queryLastName = searchParams?.get("last_name");

        if (queryEmail && queryPhone) {
            setResolvedEmail(queryEmail);
            setResolvedPhone(queryPhone);
            setResolvedFirstName(queryFirstName || null);
            setResolvedLastName(queryLastName || null);
            return;
        }

        // Priority 2: localStorage prefill
        try {
            const prefill = sessionStorage.getItem("alloy_booking_prefill") ||
                localStorage.getItem("alloy_booking_prefill");
            if (prefill) {
                const prefillData = JSON.parse(prefill);
                if (prefillData.email && prefillData.phone) {
                    setResolvedEmail(prefillData.email);
                    setResolvedPhone(prefillData.phone);
                    setResolvedFirstName(prefillData.first_name || null);
                    setResolvedLastName(prefillData.last_name || null);
                    return;
                }
            }
        } catch (e) {
            console.warn("Failed to load prefill:", e);
        }

        // Priority 3: Quote storage (may contain contact info)
        try {
            let storedQuote = localStorage.getItem("alloy_quote_v1") ||
                localStorage.getItem("cleaning_quote") ||
                sessionStorage.getItem("alloy_cleaning_quote") ||
                sessionStorage.getItem("cleaning_quote");
            if (storedQuote) {
                const parsedQuote = JSON.parse(storedQuote);
                if (parsedQuote.email && parsedQuote.phone) {
                    setResolvedEmail(parsedQuote.email);
                    setResolvedPhone(parsedQuote.phone);
                    setResolvedFirstName(parsedQuote.first_name || null);
                    setResolvedLastName(parsedQuote.last_name || null);
                    return;
                }
            }
        } catch (e) {
            console.warn("Failed to load contact from quote:", e);
        }

        // No contact info found
        setResolvedEmail(null);
        setResolvedPhone(null);
        setResolvedFirstName(null);
        setResolvedLastName(null);
    }, [debug, searchParams]);

    // Load quote from storage
    useEffect(() => {
        if (debug) {
            console.log("[BOOK_V2_DEBUG] Debug mode enabled, using mock quote");
            setQuote(mockQuote);
            setHasQuote(true);
            setCurrentStep("slot_selection");
            return;
        }

        try {
            let storedQuote = localStorage.getItem("alloy_quote_v1");
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
                    setCurrentStep("slot_selection");
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
    }, [debug]);

    // Check if payment is unlocked (requires both steps to be confirmed)
    const isPaymentUnlocked = slotConfirmed && serviceDetailsConfirmed;

    // Initialize Stripe when payment is unlocked (only on client, only once)
    useEffect(() => {
        if (!mounted || !isPaymentUnlocked) return;
        if (!resolvedEmail || !resolvedPhone) {
            console.warn("[BOOK_V2] Email/phone missing, cannot initialize Stripe");
            return;
        }

        // Prevent re-initialization if already initialized
        if (stripe) return;

        const initializeStripe = async () => {
            const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE;
            
            if (!publishableKey || publishableKey.trim() === "") {
                console.error("[BOOK_V2] Stripe publishable key missing");
                setPaymentError("Payment is not configured. Please contact support.");
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
                setPaymentError("Failed to load payment form. Please refresh the page.");
            }
        };

        initializeStripe();
    }, [mounted, isPaymentUnlocked, resolvedEmail, resolvedPhone, stripe]);

    // Mount card element when both card and ref are ready (only on client, only once)
    useEffect(() => {
        if (!mounted) return;
        if (!card || !cardElementRef.current || !isPaymentUnlocked) return;
        
        // Check if already mounted
        if (cardElementRef.current.hasChildNodes()) {
            return;
        }

        try {
            card.mount(cardElementRef.current);
        } catch (e) {
            console.error("Failed to mount Stripe card:", e);
        }

        return () => {
            try {
                if (cardElementRef.current && cardElementRef.current.hasChildNodes()) {
                    card.unmount();
                }
            } catch (e) {
                // Ignore unmount errors
            }
        };
    }, [mounted, card, isPaymentUnlocked]);

    // Check if service details changed after confirmation (re-lock payment if changed)
    useEffect(() => {
        if (serviceDetailsConfirmed && serviceDetailsSnapshot && serviceDetails) {
            const hasChanged = JSON.stringify(serviceDetails) !== JSON.stringify(serviceDetailsSnapshot);
            if (hasChanged) {
                setServiceDetailsConfirmed(false);
                setServiceDetailsSnapshot(null);
            }
        }
    }, [serviceDetails, serviceDetailsConfirmed, serviceDetailsSnapshot]);

    const handleSelectSlot = (slot: TimeSlot) => {
        setSelectedSlot(slot);
        setBookingError(null);
        // Don't auto-advance - require explicit confirmation
    };

    const handleConfirmSlot = () => {
        if (selectedSlot) {
            setSlotConfirmed(true);
            setCurrentStep("service_details");
        }
    };

    const handleChangeSlot = () => {
        setSelectedSlot(null);
        setSlotConfirmed(false);
        setCurrentStep("slot_selection");
        // Reset later steps
        setServiceDetailsConfirmed(false);
        setServiceDetailsSnapshot(null);
    };

    const handleServiceDetailsChange = (data: ServiceDetails, isValid: boolean) => {
        setServiceDetails(data);
        setServiceDetailsValid(isValid);
    };

    const handleConfirmServiceDetails = () => {
        if (serviceDetails && serviceDetailsValid) {
            setServiceDetailsConfirmed(true);
            setServiceDetailsSnapshot({ ...serviceDetails });
            setCurrentStep("payment");
        }
    };

    const handleEditServiceDetails = () => {
        setServiceDetailsConfirmed(false);
        setServiceDetailsSnapshot(null);
    };

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
            let emailParam: string | undefined = resolvedEmail || undefined;
            let phoneParam: string | undefined = resolvedPhone || undefined;

            if (prefill) {
                try {
                    const prefillData = JSON.parse(prefill);
                    emailParam = prefillData.email || emailParam;
                    phoneParam = prefillData.phone || phoneParam;
                } catch (e) {
                    console.warn("Failed to parse prefill:", e);
                }
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

    const handlePaymentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!selectedSlot || !serviceDetails || !serviceDetailsValid || !stripe || !card) {
            setPaymentError("Please complete all steps before submitting payment");
            return;
        }

        setIsProcessingPayment(true);
        setPaymentError(null);
        // Don't change currentStep - keep processing state in payment area only

        try {
            // Get quote subtotal
            const quoteSubtotal =
                (typeof quote?.first_clean_price === "number" && quote.first_clean_price > 0)
                    ? quote.first_clean_price
                    : (typeof quote?.estimated_price === "number" && quote.estimated_price > 0)
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

            // Step 1: Create SetupIntent
            const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
            const setupIntentResponse = await fetch(`${apiBaseUrl}/stripe/setup-intent`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    phone: resolvedPhone || prefillData.phone,
                    email: resolvedEmail || prefillData.email,
                    ghl_contact_id: prefillData.ghl_contact_id || null,
                }),
            });

            if (!setupIntentResponse.ok) {
                throw new Error("Failed to create payment setup");
            }

            const { client_secret } = await setupIntentResponse.json();

            // Step 2: Confirm SetupIntent with Stripe
            const { error: confirmError } = await stripe.confirmCardSetup(client_secret, {
                payment_method: {
                    card,
                    billing_details: {
                        name: `${resolvedFirstName || prefillData.first_name || ""} ${resolvedLastName || prefillData.last_name || ""}`.trim() || undefined,
                        email: resolvedEmail || prefillData.email,
                        phone: resolvedPhone || prefillData.phone,
                    },
                },
            });

            if (confirmError) {
                throw new Error(confirmError.message || "Payment setup failed");
            }

            // Step 3: Confirm booking in Supabase
            const bookingResponse = await fetch("/api/book-v2/confirm", {
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
                    contact_email: resolvedEmail || prefillData.email,
                    contact_phone: resolvedPhone || prefillData.phone,
                    contact_first_name: resolvedFirstName || prefillData.first_name,
                    contact_last_name: resolvedLastName || prefillData.last_name,
                    // Service details
                    address: serviceDetails.address,
                    city: serviceDetails.city,
                    bedrooms: serviceDetails.bedrooms,
                    bathrooms: serviceDetails.bathrooms,
                    access_method: serviceDetails.access_method,
                    access_note: serviceDetails.access_note,
                    additional_notes: serviceDetails.additional_notes,
                }),
            });

            if (!bookingResponse.ok) {
                const errorData = await bookingResponse.json();
                throw new Error(errorData.error || "Failed to confirm booking");
            }

            const result = await bookingResponse.json();
            setBookingResult(result);
            setCurrentStep("confirmed");

            // Clear service details from storage
            try {
                localStorage.removeItem("alloy_book_v2_service_details");
            } catch (e) {
                // Ignore
            }
        } catch (err: any) {
            console.error("Payment/booking failed:", err);
            setPaymentError(err.message || "Failed to complete booking. Please try again.");
            // Keep current step - error shows in payment area
        } finally {
            setIsProcessingPayment(false);
        }
    };

    return (
        <div className="min-h-screen py-6 md:py-10">
            <Section className="max-w-7xl">
                {/* Fallback message if no quote found */}
                {!hasQuote && !debug && (
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

                {/* Two-column layout: Quote (left, sticky) + Steps (right) */}
                {/* Mobile: single column, desktop: 2-column with sticky left */}
                {hasQuote && currentStep !== "confirmed" && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                        {/* Left column: Quote panel (1/3 width, sticky on desktop) */}
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-5 lg:sticky lg:top-24 space-y-6">
                                {/* Quote Summary */}
                                <div className="space-y-4">
                                    <h2 className="text-lg font-bold text-alloy-midnight">
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

                                {/* Payment Section */}
                                <div className="pt-4 border-t border-alloy-stone/20">
                                    <h3 className="text-sm font-semibold text-alloy-midnight mb-3">
                                        Payment
                                    </h3>
                                    
                                    {!isPaymentUnlocked ? (
                                        <div className="bg-alloy-stone/20 rounded-lg p-4 text-center">
                                            <p className="text-xs text-alloy-midnight/60">
                                                Complete the steps on the right to unlock payment
                                            </p>
                                        </div>
                                    ) : !mounted ? (
                                        <div className="bg-alloy-stone/20 rounded-lg p-4 text-center">
                                            <p className="text-xs text-alloy-midnight/60">Loading...</p>
                                        </div>
                                    ) : !resolvedEmail || !resolvedPhone ? (
                                        <div className="bg-alloy-stone/20 rounded-lg p-4 text-center">
                                            <p className="text-xs text-alloy-midnight/60 mb-2">
                                                Enter your email + phone to load payment.
                                            </p>
                                            <p className="text-xs text-alloy-midnight/50">
                                                Please add ?email=your@email.com&phone=+1234567890 to the URL or complete the quote form.
                                            </p>
                                        </div>
                                    ) : (
                                        <form onSubmit={handlePaymentSubmit} className="space-y-4">
                                            {/* No charge today note */}
                                            <div className="bg-alloy-juniper/10 border border-alloy-juniper/20 rounded-lg p-3">
                                                <p className="text-xs font-semibold text-alloy-midnight mb-1">
                                                    No charge today.
                                                </p>
                                                <p className="text-xs text-alloy-midnight/70 leading-relaxed">
                                                    We'll save your card to hold your appointment. You'll only be charged after the cleaning is completed and confirmed.
                                                </p>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-medium text-alloy-midnight mb-2">
                                                    Card Information
                                                </label>
                                                {!stripe || !card ? (
                                                    <div className="px-4 py-8 border border-alloy-stone/30 rounded-lg bg-alloy-stone/10 flex items-center justify-center">
                                                        <div className="text-center">
                                                            <div className="w-6 h-6 border-2 border-alloy-blue border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                                            <p className="text-xs text-alloy-midnight/60">Loading payment form...</p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div
                                                        ref={cardElementRef}
                                                        className="px-4 py-3 border border-alloy-stone/30 rounded-lg min-h-[50px]"
                                                    />
                                                )}
                                            </div>
                                            
                                            {paymentError && (
                                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                                    <p className="text-xs text-red-800">{paymentError}</p>
                                                </div>
                                            )}
                                            
                                            <button
                                                type="submit"
                                                disabled={isProcessingPayment || !stripe || !card || !resolvedEmail || !resolvedPhone}
                                                className="w-full px-6 py-3 bg-alloy-blue text-white font-semibold rounded-lg hover:bg-alloy-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isProcessingPayment ? "Processing..." : "Complete Booking"}
                                            </button>

                                            {isProcessingPayment && (
                                                <div className="flex items-center justify-center gap-2 text-xs text-alloy-midnight/60">
                                                    <div className="w-4 h-4 border-2 border-alloy-blue border-t-transparent rounded-full animate-spin"></div>
                                                    <span>Finalizing booking...</span>
                                                </div>
                                            )}
                                        </form>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right column: Progressive Steps (2/3 width) */}
                        <div className="lg:col-span-2">
                            <div className="space-y-6">
                                {/* Step 1: Slot Selection */}
                                <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-6">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                                            slotConfirmed 
                                                ? "bg-alloy-juniper text-white" 
                                                : currentStep === "slot_selection"
                                                    ? "bg-alloy-blue text-white"
                                                    : "bg-alloy-stone/30 text-alloy-midnight/60"
                                        }`}>
                                            {slotConfirmed ? "✓" : "1"}
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-alloy-midnight">
                                                Select a Time Slot
                                            </h2>
                                            {slotConfirmed && selectedSlot && (
                                                <p className="text-sm text-alloy-midnight/60 mt-1">
                                                    Confirmed: {selectedSlot.timeWindow}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {!slotConfirmed ? (
                                        <>
                                            <SlotPicker
                                                selectedSlot={selectedSlot}
                                                onSelectSlot={handleSelectSlot}
                                                timezone={timezone}
                                                error={bookingError}
                                            />
                                            {selectedSlot && (
                                                <div className="mt-6 pt-6 border-t border-alloy-stone/20">
                                                    <div className="bg-alloy-stone/10 rounded-lg p-4 mb-4">
                                                        <p className="text-sm text-alloy-midnight/70 mb-1">
                                                            <strong>Selected:</strong> {selectedSlot.timeWindow}
                                                        </p>
                                                        <p className="text-xs text-alloy-midnight/60">
                                                            {selectedSlot.start.toLocaleDateString("en-US", {
                                                                weekday: "long",
                                                                month: "long",
                                                                day: "numeric",
                                                                timeZone: timezone,
                                                            })}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={handleConfirmSlot}
                                                        className="w-full px-6 py-3 bg-alloy-blue text-white font-semibold rounded-lg hover:bg-alloy-blue/90 transition-colors"
                                                    >
                                                        Confirm Time Slot
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="bg-alloy-stone/10 rounded-lg p-4">
                                            <p className="text-sm text-alloy-midnight/70">
                                                <strong>{selectedSlot?.timeWindow}</strong> on{" "}
                                                {selectedSlot?.start.toLocaleDateString("en-US", {
                                                    weekday: "long",
                                                    month: "long",
                                                    day: "numeric",
                                                    timeZone: timezone,
                                                })}
                                            </p>
                                            <button
                                                onClick={handleChangeSlot}
                                                className="text-xs text-alloy-blue hover:underline mt-2"
                                            >
                                                Change time slot
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Step 2: Service Details */}
                                {slotConfirmed && (
                                    <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-6">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                                                serviceDetailsConfirmed 
                                                    ? "bg-alloy-juniper text-white" 
                                                    : currentStep === "service_details" || currentStep === "payment"
                                                        ? "bg-alloy-blue text-white"
                                                        : "bg-alloy-stone/30 text-alloy-midnight/60"
                                            }`}>
                                                {serviceDetailsConfirmed ? "✓" : "2"}
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-bold text-alloy-midnight">
                                                    Service Details
                                                </h2>
                                                {serviceDetailsConfirmed && (
                                                    <p className="text-sm text-alloy-midnight/60 mt-1">
                                                        Details confirmed
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {serviceDetailsConfirmed && serviceDetails ? (
                                            <>
                                                <ServiceDetailsSummary
                                                    details={serviceDetails}
                                                    onEdit={handleEditServiceDetails}
                                                />
                                                <div className="mt-4 bg-alloy-juniper/10 rounded-lg p-4 border border-alloy-juniper/20">
                                                    <p className="text-sm text-alloy-midnight/70 text-center">
                                                        Payment unlocked — complete your booking in the left panel.
                                                    </p>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <ServiceDetailsForm
                                                    onDataChange={handleServiceDetailsChange}
                                                />
                                                {serviceDetailsValid && (
                                                    <div className="mt-6 pt-6 border-t border-alloy-stone/20">
                                                        <button
                                                            onClick={handleConfirmServiceDetails}
                                                            className="w-full px-6 py-3 bg-alloy-blue text-white font-semibold rounded-lg hover:bg-alloy-blue/90 transition-colors"
                                                        >
                                                            Confirm Details
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}

                            </div>
                        </div>
                    </div>
                )}

                {/* Confirmation Screen */}
                {currentStep === "confirmed" && bookingResult && (
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
