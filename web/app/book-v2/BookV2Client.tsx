"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { loadStripe, Stripe, StripeElements, StripeCardNumberElement, StripeCardExpiryElement, StripeCardCvcElement } from "@stripe/stripe-js";
import Section from "@/components/Section";
import Accordion from "@/components/Accordion";
import SlotPicker, { TimeSlot } from "./SlotPicker";
import ServiceDetailsForm, { ServiceDetails } from "./ServiceDetailsForm";
import ServiceDetailsSummary from "./ServiceDetailsSummary";
import { trackMetaEvent } from "@/lib/metaPixel";
import { ADDON_ID_TO_KEY, ADDON_KEY_TO_ID } from "@/lib/pricing/supabasePricing";

interface QuoteInputStored {
    zip?: string;
    postal_code?: string;
    square_footage?: string;
    cleaning_frequency?: "one_time" | "weekly" | "biweekly" | "monthly";
    /** Present only for backward compat (e.g. existing metadata); not set by quote form */
    home_type?: string;
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
    addons?: Array<{ name: string; price: number | null; id?: string }>;
    addons_total?: number;
    quote_input?: QuoteInputStored;
}

interface DiscountData {
    code: string;
    discount_code_id: string;
    discount_amount: number;
    quote_total: number;
}

type BookingStep = "quote_start" | "refine_quote" | "slot_selection" | "service_details" | "payment" | "confirmed" | "error";

const QUOTE_STORAGE_KEYS = [
    "alloy_quote_v1",
    "alloy_quote_refined_v1",
    "alloy_contact_id",
    "alloy_customer_id",
    "alloy_opportunity_id",
] as const;

/** Clear quote-related keys from localStorage and sessionStorage (e.g. after QUOTE_ID_MISMATCH) */
function clearQuoteStorage(): void {
    if (typeof window === "undefined") return;
    for (const key of QUOTE_STORAGE_KEYS) {
        try {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        } catch {
            // ignore
        }
    }
}

/**
 * Normalizes quote data and sets defaults for one-time bookings
 */
function normalizeQuote(data: QuoteResponse): QuoteResponse {
    const normalized = { ...data };
    
    // For one-time bookings: if frequency_label is missing/empty and recurring_price is null/undefined,
    // set default frequency_label to "One-time"
    const hasFrequencyLabel = normalized.frequency_label && 
        typeof normalized.frequency_label === "string" && 
        normalized.frequency_label.trim().length > 0;
    const hasRecurringPrice = normalized.recurring_price !== null && 
        normalized.recurring_price !== undefined && 
        typeof normalized.recurring_price === "number" &&
        normalized.recurring_price > 0;
    
    if (!hasFrequencyLabel && !hasRecurringPrice) {
        // One-time booking: set default frequency_label
        normalized.frequency_label = "One-time";
    }
    
    return normalized;
}

/**
 * Checks if quote has required pricing fields.
 * Only blocks if estimated_price is missing/invalid.
 * One-time bookings (no frequency_label) are allowed.
 */
function isQuoteReady(data: QuoteResponse | null): { ready: boolean; missingFields: string[] } {
    if (!data) {
        return { ready: false, missingFields: ["quote object"] };
    }
    
    const missingFields: string[] = [];
    
    // Required: must have estimated_price or first_clean_price
    const hasFirst =
        typeof data.first_clean_price === "number" ||
        typeof data.estimated_price === "number";
    if (!hasFirst) {
        missingFields.push("estimated_price or first_clean_price");
    }
    
    // Optional: recurring_price (one-time bookings don't have this)
    // Optional: frequency_label (one-time bookings may have null, which is normalized to "One-time")
    
    const ready = hasFirst;
    
    return { ready, missingFields };
}

// Same buckets as cleaning quote form / get_quote_pricing RPC (SquareFootageOption)
const SQUARE_FOOTAGE_OPTIONS: { value: string; label: string }[] = [
    { value: "Under 1500 sq ft", label: "Under 1,500 sq ft" },
    { value: "1501–2,000 sq ft", label: "1,501 – 2,000 sq ft" },
    { value: "2,001-2,600 sq ft", label: "2,001 – 2,600 sq ft" },
    { value: "2,601-3,200 sq ft", label: "2,601 – 3,200 sq ft" },
    { value: "3,201-4,000 sq ft", label: "3,201 – 4,000 sq ft" },
    { value: "4,001-5,500 sq ft", label: "4,001 – 5,500 sq ft" },
    { value: "Over 5,500 sq ft", label: "Over 5,500 sq ft" },
];

const PREFILL_ATTEMPTED_KEY = "alloy_quote_start_attempted_v1";
const QUOTE_REFINED_KEY = "alloy_quote_refined_v1";

/** Add-on IDs for cleaning (must match quote-refine API) */
const ADDON_IDS = [
  "Fridge",
  "Oven",
  "Cabinets",
  "Windows & Blinds",
  "Pet Hair",
  "Baseboards",
] as const;
type AddOnId = (typeof ADDON_IDS)[number];

/** Map API frequency key to DB frequency_key (pricing_frequencies) for label lookup */
const REFINE_FREQ_TO_DB_KEY: Record<"one_time" | "weekly" | "biweekly" | "monthly", string | null> = {
  one_time: null,
  weekly: "Weekly (30% Off)",
  biweekly: "Bi-Weekly (20% Off)",
  monthly: "Monthly (10% Off)",
};

function getFrequencyDisplayLabel(
  freq: "one_time" | "weekly" | "biweekly" | "monthly",
  availableFrequencies: Array<{ frequency_key: string; frequency_label: string; discount_label: string | null }> | null
): string {
  if (freq === "one_time") return "One-time";
  const dbKey = REFINE_FREQ_TO_DB_KEY[freq];
  const row = availableFrequencies?.find((f) => f.frequency_key === dbKey);
  if (row) {
    return row.discount_label ? `${row.frequency_label} — ${row.discount_label}` : row.frequency_label;
  }
  return freq === "weekly" ? "Weekly" : freq === "biweekly" ? "Bi-Weekly" : "Monthly";
}

/**
 * Fire-and-forget: create contact/opportunity via quote-start when user lands with
 * prefill (e.g. query params) so we don't lose quote-only leads. Does not block UI.
 *
 * Manual test (incognito): hit /book-v2?email=test@example.com&phone=+15551234567&first_name=Jane&last_name=Doe
 * and confirm POST /api/book-v2/quote-start is called and a new opportunity appears in Supabase
 * with metadata.source = web_quote.
 */
async function maybeCreateLeadFromPrefill(params: {
    email?: string | null;
    phone?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    zip?: string | null;
    square_footage?: number | string | null;
    cleaning_frequency?: "one_time" | "weekly" | "biweekly" | "monthly" | null;
}): Promise<void> {
    const email = params.email?.trim() || null;
    const phone = params.phone?.trim() || null;
    if (!email && !phone) return;

    if (typeof window === "undefined") return;
    try {
        if (localStorage.getItem("alloy_opportunity_id") || localStorage.getItem("alloy_contact_id") || localStorage.getItem("alloy_customer_id")) {
            return;
        }
        if (sessionStorage.getItem(PREFILL_ATTEMPTED_KEY)) {
            return;
        }
        sessionStorage.setItem(PREFILL_ATTEMPTED_KEY, "1");
    } catch {
        return;
    }

    const sqft = params.square_footage != null ? (typeof params.square_footage === "number" ? params.square_footage : parseInt(String(params.square_footage), 10)) : undefined;
    const body: Record<string, unknown> = {
        first_name: params.first_name?.trim() || undefined,
        last_name: params.last_name?.trim() || undefined,
        email: email || undefined,
        phone: phone || undefined,
        zip: params.zip?.trim() || undefined,
        square_footage: sqft != null && !Number.isNaN(sqft) ? sqft : undefined,
        cleaning_frequency: params.cleaning_frequency || "one_time",
        quote_context: { source: "prefill", url: window.location.href },
    };

    console.log("[QUOTE_START_PREFILL] attempting...");
    try {
        const res = await fetch("/api/book-v2/quote-start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (res.ok && data.ok && data.opportunity_id) {
            try {
                if (data.contact_id) localStorage.setItem("alloy_contact_id", data.contact_id);
                if (data.customer_id) localStorage.setItem("alloy_customer_id", data.customer_id);
                if (data.opportunity_id) localStorage.setItem("alloy_opportunity_id", data.opportunity_id);
            } catch (e) {
                console.warn("[QUOTE_START_PREFILL] localStorage set failed", e);
            }
            console.log("[QUOTE_START_PREFILL] success opportunity_id=" + data.opportunity_id);
        } else {
            console.log("[QUOTE_START_PREFILL] failed error=" + (data?.message || res.status));
        }
    } catch (err) {
        console.log("[QUOTE_START_PREFILL] failed error=" + (err instanceof Error ? err.message : String(err)));
    }
}

export default function BookV2Client() {
    const searchParams = useSearchParams();
    const [quote, setQuote] = useState<QuoteResponse | null>(null);
    const [hasQuote, setHasQuote] = useState(false);
    const [currentStep, setCurrentStep] = useState<BookingStep>("quote_start");
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
    const [cardNumber, setCardNumber] = useState<StripeCardNumberElement | null>(null);
    const [cardExpiry, setCardExpiry] = useState<StripeCardExpiryElement | null>(null);
    const [cardCvc, setCardCvc] = useState<StripeCardCvcElement | null>(null);
    const [postalCode, setPostalCode] = useState<string>("");
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);
    const [paymentError, setPaymentError] = useState<string | null>(null);

    // Quote-start (first step) form state — square_footage is bucket key (SquareFootageOption)
    const [quoteStartForm, setQuoteStartForm] = useState({
        first_name: "",
        last_name: "",
        zip: "",
        square_footage: "" as string,
        cleaning_frequency: "one_time" as "one_time" | "weekly" | "biweekly" | "monthly",
        email: "",
        phone: "",
    });
    const [quoteStartSubmitting, setQuoteStartSubmitting] = useState(false);
    const [quoteStartError, setQuoteStartError] = useState<string | null>(null);
    const [quoteJustSaved, setQuoteJustSaved] = useState(false);

    // Payment step: inline email/phone when identity missing (no URL params / prefill / quote)
    const [paymentIdentityEmail, setPaymentIdentityEmail] = useState("");
    const [paymentIdentityPhone, setPaymentIdentityPhone] = useState("");
    const [paymentIdentitySubmitting, setPaymentIdentitySubmitting] = useState(false);
    const [paymentIdentityError, setPaymentIdentityError] = useState<string | null>(null);

    // Refine quote step: frequency and add-ons (optimistic UI; selectedAddonKeys = source of truth for checkboxes)
    const [refineFrequency, setRefineFrequency] = useState<"one_time" | "weekly" | "biweekly" | "monthly">("one_time");
    const [selectedAddonKeys, setSelectedAddonKeys] = useState<string[]>([]);
    const [refineLoading, setRefineLoading] = useState(false);
    const [refineError, setRefineError] = useState<string | null>(null);
    const [quoteRefreshMessage, setQuoteRefreshMessage] = useState<string | null>(null);
    /** When user clicks "Edit quote", we remember which step to return to after "Continue to pick time" */
    const [stepBeforeRefine, setStepBeforeRefine] = useState<BookingStep | null>(null);
    /** Add-on pricing from DB (addon_types + pricing_addons), cached from quote-refine response */
    const [availableAddons, setAvailableAddons] = useState<Array<{ id: string; label: string; price: number }> | null>(null);
    /** Frequency options from pricing_frequencies (frequency_label + discount_label for display) */
    const [availableFrequencies, setAvailableFrequencies] = useState<Array<{ frequency_key: string; frequency_label: string; discount_label: string | null; is_recurring: boolean }> | null>(null);
    const refineDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const refineRequestIdRef = useRef(0);

    // Per-attempt correlation id: new on "Confirm time" or first use; reset after successful confirm
    const bookingAttemptIdRef = useRef<string | null>(null);
    const [bookingAttemptId, setBookingAttemptId] = useState<string | null>(null);
    const getBookingAttemptId = useCallback((): string => {
        if (bookingAttemptIdRef.current) return bookingAttemptIdRef.current;
        const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `attempt-${Date.now()}`;
        bookingAttemptIdRef.current = id;
        setBookingAttemptId(id);
        return id;
    }, []);
    const resetBookingAttemptId = useCallback(() => {
        bookingAttemptIdRef.current = null;
        setBookingAttemptId(null);
    }, []);
    const confirmInFlightRef = useRef(false);
    const cardNumberRef = useRef<HTMLDivElement>(null);
    const cardExpiryRef = useRef<HTMLDivElement>(null);
    const cardCvcRef = useRef<HTMLDivElement>(null);

    const debug = searchParams?.get("debug") === "1";

    // Reschedule-via-action-link: token from URL, resolve result, and confirm result
    const [rescheduleResolve, setRescheduleResolve] = useState<{
        token: string;
        action_type: string;
        entity_type: string;
        entity_id: string;
        expires_at: string;
        consumed_at: string | null;
    } | null>(null);
    const [rescheduleError, setRescheduleError] = useState<string | null>(null);
    const [rescheduleLoading, setRescheduleLoading] = useState(true);
    const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
    const [rescheduleResult, setRescheduleResult] = useState<{ start_at: string; end_at: string } | null>(null);
    
    // Resolve email/phone with priority: query params > alloy_booking_prefill > stored quote
    const [resolvedEmail, setResolvedEmail] = useState<string | null>(null);
    const [resolvedPhone, setResolvedPhone] = useState<string | null>(null);
    const [resolvedFirstName, setResolvedFirstName] = useState<string | null>(null);
    const [resolvedLastName, setResolvedLastName] = useState<string | null>(null);
    /** True after first run of identity resolution (avoids flashing inline form before hydration) */
    const [identityHydrated, setIdentityHydrated] = useState(false);

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

    // Resolve reschedule_token from URL: if valid, go to slot selection; if invalid, show error
    useEffect(() => {
        const token = searchParams?.get("reschedule_token");
        if (!token?.trim()) {
            setRescheduleLoading(false);
            return;
        }
        setRescheduleLoading(true);
        setRescheduleError(null);
        setRescheduleResolve(null);
        fetch(`/api/action-links/resolve?token=${encodeURIComponent(token.trim())}`)
            .then((res) => res.json())
            .then((data: { valid?: boolean; action_type?: string; entity_type?: string; entity_id?: string; expires_at?: string; consumed_at?: string | null }) => {
                if (data.valid && data.action_type === "customer_reschedule" && data.entity_type === "schedule" && data.entity_id) {
                    setRescheduleResolve({
                        token: token.trim(),
                        action_type: data.action_type,
                        entity_type: data.entity_type,
                        entity_id: data.entity_id,
                        expires_at: data.expires_at ?? "",
                        consumed_at: data.consumed_at ?? null,
                    });
                    setCurrentStep("slot_selection");
                } else {
                    if (!data.valid) {
                        if (data.consumed_at) setRescheduleError("This link has already been used.");
                        else if (data.expires_at && new Date(data.expires_at) <= new Date()) setRescheduleError("This link has expired.");
                        else setRescheduleError("This link is invalid.");
                    } else {
                        setRescheduleError("This link is not valid for rescheduling.");
                    }
                }
            })
            .catch(() => setRescheduleError("Something went wrong. Please try again."))
            .finally(() => setRescheduleLoading(false));
    }, [searchParams]);

    // Scroll to top when showing booking confirmation so user sees success message
    useEffect(() => {
        if (currentStep === "confirmed" && typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "auto" });
        }
    }, [currentStep]);

    useEffect(() => {
        return () => {
            if (refineDebounceRef.current) {
                clearTimeout(refineDebounceRef.current);
                refineDebounceRef.current = null;
            }
        };
    }, []);

    // Resolve email/phone from multiple sources (runs on mount + when searchParams change)
    useEffect(() => {
        if (debug) {
            setResolvedEmail("test@example.com");
            setResolvedPhone("+15415551234");
            setResolvedFirstName("Test");
            setResolvedLastName("User");
            setIdentityHydrated(true);
            return;
        }

        // Priority 1: URL params
        const queryEmail = searchParams?.get("email");
        const queryPhone = searchParams?.get("phone");
        const queryFirstName = searchParams?.get("first_name");
        const queryLastName = searchParams?.get("last_name");
        if (queryEmail || queryPhone) {
            setResolvedEmail(queryEmail || null);
            setResolvedPhone(queryPhone || null);
            setResolvedFirstName(queryFirstName || null);
            setResolvedLastName(queryLastName || null);
            setIdentityHydrated(true);
            return;
        }

        // Priority 2: alloy_booking_prefill (sessionStorage then localStorage — same shape as quote form writes)
        try {
            const prefill = sessionStorage.getItem("alloy_booking_prefill") ||
                localStorage.getItem("alloy_booking_prefill");
            if (prefill) {
                const prefillData = JSON.parse(prefill) as Record<string, unknown>;
                const prefillEmail = typeof prefillData.email === "string" ? prefillData.email.trim() || null : null;
                const prefillPhone = typeof prefillData.phone === "string" ? prefillData.phone.trim() || null : null;
                if (prefillEmail || prefillPhone) {
                    setResolvedEmail(prefillEmail || null);
                    setResolvedPhone(prefillPhone || null);
                    setResolvedFirstName(typeof prefillData.first_name === "string" ? prefillData.first_name.trim() || null : null);
                    setResolvedLastName(typeof prefillData.last_name === "string" ? prefillData.last_name.trim() || null : null);
                    setIdentityHydrated(true);
                    return;
                }
            }
        } catch (e) {
            console.warn("Failed to load prefill:", e);
        }

        // Priority 3: Stored quote objects (alloy_quote_v1 / cleaning_quote / alloy_cleaning_quote)
        try {
            const storedQuoteRaw =
                localStorage.getItem("alloy_quote_v1") ||
                localStorage.getItem("cleaning_quote") ||
                sessionStorage.getItem("alloy_cleaning_quote") ||
                sessionStorage.getItem("cleaning_quote");
            if (storedQuoteRaw) {
                const parsedQuote = JSON.parse(storedQuoteRaw) as Record<string, unknown>;
                const quoteEmail = typeof parsedQuote.email === "string" ? parsedQuote.email.trim() || null : null;
                const quotePhone = typeof parsedQuote.phone === "string" ? parsedQuote.phone.trim() || null : null;
                if (quoteEmail || quotePhone) {
                    setResolvedEmail(quoteEmail || null);
                    setResolvedPhone(quotePhone || null);
                    setResolvedFirstName(typeof parsedQuote.first_name === "string" ? parsedQuote.first_name.trim() || null : null);
                    setResolvedLastName(typeof parsedQuote.last_name === "string" ? parsedQuote.last_name.trim() || null : null);
                    setIdentityHydrated(true);
                    return;
                }
            }
        } catch (e) {
            console.warn("Failed to load contact from quote:", e);
        }

        setResolvedEmail(null);
        setResolvedPhone(null);
        setResolvedFirstName(null);
        setResolvedLastName(null);
        setIdentityHydrated(true);
    }, [debug, searchParams]);

    // Prefill quote-start form with resolved email/phone/name when they become available
    useEffect(() => {
        if (resolvedEmail || resolvedPhone || resolvedFirstName || resolvedLastName) {
            setQuoteStartForm((f) => ({
                ...f,
                ...(resolvedEmail && { email: resolvedEmail }),
                ...(resolvedPhone && { phone: resolvedPhone }),
                ...(resolvedFirstName && { first_name: resolvedFirstName }),
                ...(resolvedLastName && { last_name: resolvedLastName }),
            }));
        }
    }, [resolvedEmail, resolvedPhone, resolvedFirstName, resolvedLastName]);

    // Background lead capture: when user lands with prefill (query params / storage) and we have
    // email or phone but no quote-start IDs yet, call quote-start once so we don't lose the lead.
    // Manual test: incognito → /book-v2?email=...&phone=...&first_name=... → check Network for
    // POST /api/book-v2/quote-start and Supabase opportunity with metadata.source = web_quote.
    useEffect(() => {
        if (!mounted || debug) return;
        if (!resolvedEmail && !resolvedPhone) return;

        let zip: string | null = null;
        try {
            zip = searchParams?.get("zip") ?? searchParams?.get("postal_code") ?? null;
            if (!zip) {
                const prefill = sessionStorage.getItem("alloy_booking_prefill") || localStorage.getItem("alloy_booking_prefill");
                if (prefill) {
                    const prefillData = JSON.parse(prefill);
                    zip = prefillData.postal_code ?? prefillData.zip ?? null;
                }
            }
            if (!zip) {
                const stored = localStorage.getItem("alloy_quote_v1") || sessionStorage.getItem("alloy_quote_v1");
                if (stored) {
                    const parsed = JSON.parse(stored);
                    zip = parsed.postalCode ?? parsed.zip ?? parsed.postal_code ?? null;
                }
            }
        } catch {
            // ignore
        }

        maybeCreateLeadFromPrefill({
            email: resolvedEmail,
            phone: resolvedPhone,
            first_name: resolvedFirstName,
            last_name: resolvedLastName,
            zip,
            square_footage: quoteStartForm.square_footage || undefined,
            cleaning_frequency: quoteStartForm.cleaning_frequency,
        });
    }, [mounted, debug, resolvedEmail, resolvedPhone, resolvedFirstName, resolvedLastName, searchParams, quoteStartForm.square_footage, quoteStartForm.cleaning_frequency]);

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
                try {
                    const parsedQuote: QuoteResponse = JSON.parse(storedQuote);
                    console.log("[BOOK_V2] Loaded quote from storage:", parsedQuote);
                    
                    // Normalize quote (set default frequency_label for one-time bookings)
                    const normalizedQuote = normalizeQuote(parsedQuote);
                    console.log("[BOOK_V2] Normalized quote:", normalizedQuote);
                    
                    setQuote(normalizedQuote);
                    
                    // Check readiness
                    const { ready, missingFields } = isQuoteReady(normalizedQuote);
                    setHasQuote(ready);
                    
                    if (ready) {
                        // Always show "Your Quote" step first when user has a quote (focal step before scheduling)
                        setCurrentStep("refine_quote");
                    } else {
                        setCurrentStep("quote_start");
                        console.warn("[BOOK_V2] Quote loaded but not ready - missing required fields:", missingFields);
                        console.warn("[BOOK_V2] Normalized quote object:", JSON.stringify(normalizedQuote, null, 2));
                    }
                } catch (e) {
                    console.error("[BOOK_V2] Failed to parse quote from storage:", e);
                    setHasQuote(false);
                }
            } else {
                console.warn("[BOOK_V2] No quote found in storage");
                setHasQuote(false);
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
                
                const elementStyle = {
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
                };
                
                const cardNumberElement = elementsInstance.create("cardNumber", { style: elementStyle });
                const cardExpiryElement = elementsInstance.create("cardExpiry", { style: elementStyle });
                const cardCvcElement = elementsInstance.create("cardCvc", { style: elementStyle });
                
                setCardNumber(cardNumberElement);
                setCardExpiry(cardExpiryElement);
                setCardCvc(cardCvcElement);
            } catch (err) {
                console.error("Failed to initialize Stripe:", err);
                setPaymentError("Failed to load payment form. Please refresh the page.");
            }
        };

        initializeStripe();
    }, [mounted, isPaymentUnlocked, resolvedEmail, resolvedPhone, stripe]);

    // Mount Stripe elements when ready (only on client, only once)
    useEffect(() => {
        if (!mounted) return;
        if (!cardNumber || !cardExpiry || !cardCvc || !isPaymentUnlocked) return;
        if (!cardNumberRef.current || !cardExpiryRef.current || !cardCvcRef.current) return;
        
        // Check if already mounted
        if (cardNumberRef.current.hasChildNodes()) {
            return;
        }

        try {
            cardNumber.mount(cardNumberRef.current);
            cardExpiry.mount(cardExpiryRef.current);
            cardCvc.mount(cardCvcRef.current);
        } catch (e) {
            console.error("Failed to mount Stripe elements:", e);
        }

        return () => {
            try {
                if (cardNumber && cardNumberRef.current?.hasChildNodes()) {
                    cardNumber.unmount();
                }
                if (cardExpiry && cardExpiryRef.current?.hasChildNodes()) {
                    cardExpiry.unmount();
                }
                if (cardCvc && cardCvcRef.current?.hasChildNodes()) {
                    cardCvc.unmount();
                }
            } catch (e) {
                // Ignore unmount errors
            }
        };
    }, [mounted, cardNumber, cardExpiry, cardCvc, isPaymentUnlocked]);

    // Sync refine step state from quote when entering refine_quote (selectedAddonKeys = source of truth for checkboxes)
    useEffect(() => {
        if (!quote || currentStep !== "refine_quote") return;
        const freqLabel = (quote.frequency_label || "").toLowerCase();
        const nextFreq: "one_time" | "weekly" | "biweekly" | "monthly" =
            freqLabel.includes("weekly") && !freqLabel.includes("bi") ? "weekly"
                : freqLabel.includes("bi") || freqLabel.includes("2 week") ? "biweekly"
                : freqLabel.includes("monthly") ? "monthly"
                : "one_time";
        setRefineFrequency(nextFreq);
        const addonsList = quote.addons ?? [];
        const keys: string[] = addonsList
            .map((a) => {
                const withId = a as { id?: string; name?: string };
                if (withId.id && typeof withId.id === "string") return withId.id.trim().toLowerCase();
                if (withId.name && (ADDON_IDS as readonly string[]).includes(withId.name))
                    return ADDON_ID_TO_KEY[withId.name as AddOnId];
                return null;
            })
            .filter((x): x is string => x != null && x.length > 0);
        setSelectedAddonKeys(keys);
    }, [quote, currentStep]);

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

    const applyRefineAndPersist = useCallback(
        async (
            frequency: "one_time" | "weekly" | "biweekly" | "monthly",
            addonKeys: string[],
            options?: { revertKeys?: string[] }
        ) => {
            const quoteInput = quote?.quote_input;
            const squareFootage =
                quoteInput?.square_footage ||
                (quote as QuoteResponse & { quote_input?: { square_footage?: string } })?.quote_input?.square_footage;
            if (!squareFootage?.trim()) {
                console.warn("[BOOK_V2] Refine: no square_footage in quote_input, skip API");
                return;
            }
            const requestId = ++refineRequestIdRef.current;
            setRefineError(null);
            setRefineLoading(true);
            try {
                const opportunityId =
                    typeof window !== "undefined" ? localStorage.getItem("alloy_opportunity_id") : null;
                const res = await fetch("/api/book-v2/quote-refine", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        square_footage: squareFootage.trim(),
                        cleaning_frequency: frequency,
                        add_ons: addonKeys,
                        opportunity_id: opportunityId || undefined,
                        zip: quoteInput?.zip,
                    }),
                });
                const data = await res.json();
                if (requestId !== refineRequestIdRef.current) return;
                if (!res.ok || !data.ok) {
                    setRefineError(data.message || "Could not update quote.");
                    if (options?.revertKeys != null) setSelectedAddonKeys(options.revertKeys);
                    return;
                }
                if (Array.isArray(data.available_addons)) {
                    setAvailableAddons(data.available_addons);
                }
                if (Array.isArray(data.available_frequencies)) {
                    setAvailableFrequencies(data.available_frequencies);
                }
                const qo = data.quote_output;
                const addonsForStore = Array.isArray(qo?.addons)
                    ? (qo.addons as Array<{ id?: string; label?: string; price?: number }>).map((a) => ({
                          name: a.label ?? (a.id as string) ?? "",
                          price: typeof a.price === "number" ? a.price : null,
                          id: a.id ?? undefined,
                      }))
                    : [];
                const updated: QuoteResponse = {
                    ...quote!,
                    estimated_price: qo?.estimated_price ?? quote?.estimated_price,
                    first_clean_price: qo?.first_clean_price ?? qo?.estimated_price ?? quote?.first_clean_price,
                    recurring_price: qo?.recurring_price ?? undefined,
                    frequency_label: qo?.frequency_label ?? quote?.frequency_label ?? "One-time",
                    discount_label: (qo as { discount_label?: string | null })?.discount_label ?? quote?.discount_label ?? undefined,
                    addons: addonsForStore,
                    addons_total: typeof qo?.addons_total === "number" ? qo.addons_total : undefined,
                };
                setQuote(normalizeQuote(updated));
                const addOnIds = addonKeys
                    .map((k) => ADDON_KEY_TO_ID[k] ?? null)
                    .filter((x): x is AddOnId => x != null);
                const toStore = {
                    ...updated,
                    quote_input: { ...quoteInput, cleaning_frequency: frequency, add_ons: addOnIds },
                };
                try {
                    const json = JSON.stringify(toStore);
                    localStorage.setItem("alloy_quote_v1", json);
                    sessionStorage.setItem("alloy_quote_v1", json);
                } catch (e) {
                    console.warn("Persist quote failed", e);
                }
            } finally {
                if (requestId === refineRequestIdRef.current) setRefineLoading(false);
            }
        },
        [quote]
    );

    // Fetch available_addons once when entering refine step (so prices show before user toggles)
    useEffect(() => {
        if (currentStep !== "refine_quote" || !quote || availableAddons !== null) return;
        const squareFootage = quote.quote_input?.square_footage?.trim();
        if (!squareFootage) return;
        const freqLabel = (quote.frequency_label || "").toLowerCase();
        const freq: "one_time" | "weekly" | "biweekly" | "monthly" =
            freqLabel.includes("weekly") && !freqLabel.includes("bi") ? "weekly"
                : freqLabel.includes("bi") || freqLabel.includes("2 week") ? "biweekly"
                : freqLabel.includes("monthly") ? "monthly"
                : "one_time";
        const keys = (quote.addons ?? [])
            .map((a) => {
                const withId = a as { id?: string; name?: string };
                if (withId.id && typeof withId.id === "string") return withId.id.trim().toLowerCase();
                if (withId.name && (ADDON_IDS as readonly string[]).includes(withId.name))
                    return ADDON_ID_TO_KEY[withId.name as AddOnId];
                return null;
            })
            .filter((x): x is string => x != null && x.length > 0);
        applyRefineAndPersist(freq, keys);
    }, [currentStep, quote, availableAddons, applyRefineAndPersist]);

    const handleRefineFrequencyChange = (freq: "one_time" | "weekly" | "biweekly" | "monthly") => {
        setRefineFrequency(freq);
        setRefineError(null);
        applyRefineAndPersist(freq, selectedAddonKeys);
    };

    const handleRefineAddOnToggle = (addonKey: string) => {
        const prev = selectedAddonKeys;
        const next = prev.includes(addonKey) ? prev.filter((k) => k !== addonKey) : [...prev, addonKey];
        setSelectedAddonKeys(next);
        setRefineError(null);
        if (refineDebounceRef.current) {
            clearTimeout(refineDebounceRef.current);
            refineDebounceRef.current = null;
        }
        refineDebounceRef.current = setTimeout(() => {
            refineDebounceRef.current = null;
            applyRefineAndPersist(refineFrequency, next, { revertKeys: prev });
        }, 250);
    };

    const handleRefineContinue = () => {
        setQuoteRefreshMessage(null);
        try {
            localStorage.setItem(QUOTE_REFINED_KEY, "1");
            sessionStorage.setItem(QUOTE_REFINED_KEY, "1");
        } catch (e) {
            console.warn("Persist refined flag failed", e);
        }
        setCurrentStep(stepBeforeRefine ?? "slot_selection");
        setStepBeforeRefine(null);
    };

    const handleEditQuote = () => {
        setStepBeforeRefine(currentStep);
        setCurrentStep("refine_quote");
    };

    const handleQuoteStartSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const { first_name, last_name, zip, square_footage, cleaning_frequency, email, phone } = quoteStartForm;
        if (!first_name?.trim()) {
            setQuoteStartError("First name is required.");
            return;
        }
        if (!last_name?.trim()) {
            setQuoteStartError("Last name is required.");
            return;
        }
        if (!zip.trim()) {
            setQuoteStartError("ZIP code is required");
            return;
        }
        if (!square_footage?.trim()) {
            setQuoteStartError("Please select approximate square footage.");
            return;
        }
        if (!phone?.trim()) {
            setQuoteStartError("Phone number is required.");
            return;
        }
        if (!email?.trim()) {
            setQuoteStartError("Please enter your email so we can save your quote.");
            return;
        }
        setQuoteStartSubmitting(true);
        setQuoteStartError(null);
        try {
            // Send bucket key (e.g. "Under 1500 sq ft") — API accepts string or number
            const res = await fetch("/api/book-v2/quote-start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    first_name: first_name.trim(),
                    last_name: last_name.trim(),
                    zip: zip.trim(),
                    square_footage: square_footage.trim(),
                    cleaning_frequency: cleaning_frequency || "one_time",
                    email: email?.trim() || undefined,
                    phone: phone?.trim() || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                setQuoteStartError(data.message || "Could not save your quote. Please try again.");
                return;
            }
            try {
                if (data.contact_id) localStorage.setItem("alloy_contact_id", data.contact_id);
                if (data.customer_id) localStorage.setItem("alloy_customer_id", data.customer_id);
                if (data.opportunity_id) localStorage.setItem("alloy_opportunity_id", data.opportunity_id);
            } catch (e) {
                console.warn("localStorage set failed:", e);
            }
            const qo = data.quote_output;
            const storedQuote: QuoteResponse = {
                status: "ready",
                source: "local_pricing",
                estimated_price: qo?.estimated_price ?? undefined,
                first_clean_price: qo?.first_clean_price ?? qo?.estimated_price ?? undefined,
                recurring_price: qo?.recurring_price ?? undefined,
                frequency_label: qo?.frequency_label ?? "One-time",
                service: "Standard Cleaning",
                price_breakdown: undefined,
                addons: qo?.addons ?? [],
                quote_input: { zip: quoteStartForm.zip.trim(), square_footage: quoteStartForm.square_footage, cleaning_frequency: quoteStartForm.cleaning_frequency },
            };
            const quoteJson = JSON.stringify(storedQuote);
            localStorage.setItem("alloy_quote_v1", quoteJson);
            sessionStorage.setItem("alloy_quote_v1", quoteJson);
            setQuote(normalizeQuote(storedQuote));
            setHasQuote(true);
            setQuoteJustSaved(true);
            setResolvedFirstName(first_name.trim());
            setResolvedLastName(last_name.trim());
            setCurrentStep("refine_quote");
            setTimeout(() => setQuoteJustSaved(false), 8000);
        } catch (err) {
            console.error("Quote start failed:", err);
            setQuoteStartError("Something went wrong. Please try again.");
        } finally {
            setQuoteStartSubmitting(false);
        }
    };

    const handleSelectSlot = (slot: TimeSlot) => {
        setSelectedSlot(slot);
        setBookingError(null);
        // Don't auto-advance - require explicit confirmation
    };

    const handleConfirmSlot = () => {
        if (selectedSlot) {
            // Start a new booking attempt: fresh correlation id for this flow
            const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `attempt-${Date.now()}`;
            bookingAttemptIdRef.current = id;
            setBookingAttemptId(id);
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

    /** Submit inline email/phone on payment step; store in prefill + quote storage, then set resolved so Stripe loads */
    const handlePaymentIdentityContinue = async (e: React.FormEvent) => {
        e.preventDefault();
        const email = paymentIdentityEmail?.trim() || "";
        const phone = paymentIdentityPhone?.trim() || "";
        if (!email || !phone) {
            setPaymentIdentityError("Please enter both email and phone to continue.");
            return;
        }
        setPaymentIdentitySubmitting(true);
        setPaymentIdentityError(null);
        try {
            // Ensure we have contact/opportunity (same as quote flow)
            const existingPrefillRaw = typeof window !== "undefined"
                ? (sessionStorage.getItem("alloy_booking_prefill") || localStorage.getItem("alloy_booking_prefill"))
                : null;
            let prefillData: Record<string, unknown> = {};
            if (existingPrefillRaw) {
                try {
                    prefillData = JSON.parse(existingPrefillRaw);
                } catch {
                    // ignore
                }
            }
            const hasIds = typeof window !== "undefined" &&
                (localStorage.getItem("alloy_opportunity_id") || localStorage.getItem("alloy_contact_id") || localStorage.getItem("alloy_customer_id"));
            if (!hasIds) {
                const res = await fetch("/api/book-v2/quote-start", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email,
                        phone,
                        first_name: (resolvedFirstName ?? (prefillData.first_name as string))?.trim() || undefined,
                        last_name: (resolvedLastName ?? (prefillData.last_name as string))?.trim() || undefined,
                        zip: (prefillData.zip as string)?.trim() || (prefillData.postal_code as string)?.trim() || undefined,
                        cleaning_frequency: "one_time",
                        quote_context: { source: "book_v2_payment_identity", url: typeof window !== "undefined" ? window.location.href : "" },
                    }),
                });
                const data = await res.json();
                if (res.ok && data.ok) {
                    try {
                        if (data.contact_id) localStorage.setItem("alloy_contact_id", data.contact_id);
                        if (data.customer_id) localStorage.setItem("alloy_customer_id", data.customer_id);
                        if (data.opportunity_id) localStorage.setItem("alloy_opportunity_id", data.opportunity_id);
                    } catch {
                        // ignore
                    }
                }
            }
            // Store in same place quote flow uses (prefill)
            prefillData.email = email;
            prefillData.phone = phone;
            const jsonData = JSON.stringify(prefillData);
            sessionStorage.setItem("alloy_booking_prefill", jsonData);
            localStorage.setItem("alloy_booking_prefill", jsonData);
            // Update stored quote if present so future loads resolve identity from quote
            const quoteStorageKeys = ["alloy_quote_v1", "cleaning_quote", "alloy_cleaning_quote"];
            for (const key of quoteStorageKeys) {
                const raw = typeof window !== "undefined" ? (localStorage.getItem(key) || sessionStorage.getItem(key)) : null;
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        parsed.email = email;
                        parsed.phone = phone;
                        const updated = JSON.stringify(parsed);
                        localStorage.setItem(key, updated);
                        sessionStorage.setItem(key, updated);
                    } catch {
                        // ignore
                    }
                }
            }
            setResolvedEmail(email);
            setResolvedPhone(phone);
        } catch (err) {
            console.error("Payment identity save failed:", err);
            setPaymentIdentityError("Something went wrong. Please try again.");
        } finally {
            setPaymentIdentitySubmitting(false);
        }
    };

    const handleValidateDiscount = async () => {
        if (!discountCode.trim() || !quote) {
            setDiscountError("Please enter a discount code");
            return;
        }

        setIsValidatingDiscount(true);
        setDiscountError(null);
        const attemptId = getBookingAttemptId();
        if (process.env.NODE_ENV !== "production") {
            console.log("[BOOK_V2] booking_attempt_id=", attemptId);
        }

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
                    booking_attempt_id: attemptId,
                }),
            });

            const data = await response.json();
            if (process.env.NODE_ENV !== "production") {
                console.log("[BOOK_V2_DISCOUNT] booking_attempt_id=", attemptId, "status=", response.status, "body=", data);
            }

            if (response.status === 409) {
                const message = data.message ?? "That promo code has already been used for this customer.";
                setDiscountError(message);
                setDiscountData(null);
                return;
            }

            if (data.valid === true) {
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
                const message = data.message ?? (data.reason === "discount_already_used" ? "That promo code has already been used for this customer." : "Invalid discount code");
                setDiscountError(message);
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

        const phoneForConfirm = resolvedPhone?.trim();
        if (!phoneForConfirm) {
            setPaymentError("Phone number is required.");
            return;
        }
        if (!selectedSlot || !serviceDetails || !serviceDetailsValid || !stripe || !cardNumber || !cardExpiry || !cardCvc) {
            setPaymentError("Please complete all steps before submitting payment");
            return;
        }
        if (confirmInFlightRef.current) return;
        confirmInFlightRef.current = true;

        setIsProcessingPayment(true);
        setPaymentError(null);
        const attemptId = getBookingAttemptId();
        if (process.env.NODE_ENV !== "production") {
            console.log("[BOOK_V2] booking_attempt_id=", attemptId);
        }

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

            // Step 1: Create SetupIntent (pass quote contact_id/customer_id so backend can reuse existing lead)
            const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
            const setupContactId = typeof window !== "undefined" ? localStorage.getItem("alloy_contact_id") : null;
            const setupCustomerId = typeof window !== "undefined" ? localStorage.getItem("alloy_customer_id") : null;

            const createSetupIntentOnce = async (): Promise<string> => {
                const setupIntentResponse = await fetch(`${apiBaseUrl}/stripe/setup-intent`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        phone: resolvedPhone || prefillData.phone,
                        email: resolvedEmail || prefillData.email,
                        ghl_contact_id: prefillData.ghl_contact_id || null,
                        booking_attempt_id: attemptId,
                        contact_id: setupContactId || undefined,
                        customer_id: setupCustomerId || undefined,
                    }),
                });
                const setupIntentData = await setupIntentResponse.json();
                if (process.env.NODE_ENV !== "production") {
                    console.log("[BOOK_V2_SETUP_INTENT] booking_attempt_id=", attemptId, "status=", setupIntentResponse.status, "body=", setupIntentData);
                }
                if (!setupIntentResponse.ok) {
                    throw new Error(setupIntentData.detail || "Failed to create payment setup");
                }
                const secret = setupIntentData.client_secret;
                if (!secret) throw new Error("No client_secret from setup-intent");
                return secret;
            };

            let client_secret = await createSetupIntentOnce();

            // Step 2: Confirm SetupIntent with Stripe (retry once if "No such setupintent" — e.g. stale LIVE secret with TEST keys)
            const confirmPayloadStripe = {
                payment_method: {
                    card: cardNumber,
                    billing_details: {
                        name: `${resolvedFirstName || prefillData.first_name || ""} ${resolvedLastName || prefillData.last_name || ""}`.trim() || undefined,
                        email: resolvedEmail || prefillData.email,
                        phone: resolvedPhone || prefillData.phone,
                        address: { postal_code: postalCode || undefined },
                    },
                },
            };
            let confirmError = (await stripe.confirmCardSetup(client_secret, confirmPayloadStripe)).error;
            if (confirmError && typeof confirmError.message === "string" && confirmError.message.toLowerCase().includes("no such setupintent")) {
                if (process.env.NODE_ENV !== "production") {
                    console.log("[BOOK_V2_SETUP_INTENT] retrying with fresh SetupIntent after no such setupintent");
                }
                client_secret = await createSetupIntentOnce();
                confirmError = (await stripe.confirmCardSetup(client_secret, confirmPayloadStripe)).error;
            }
            if (confirmError) {
                throw new Error(confirmError.message || "Payment setup failed");
            }

            // Step 3: Confirm booking in Supabase (always run after successful Stripe setup)
            if (process.env.NODE_ENV !== "production") {
                console.log("[BOOK_V2_FLOW] about_to_call_confirm booking_attempt_id=", attemptId);
            }
            const storedContactId = typeof window !== "undefined" ? localStorage.getItem("alloy_contact_id") : null;
            const storedCustomerId = typeof window !== "undefined" ? localStorage.getItem("alloy_customer_id") : null;
            const storedOpportunityId = typeof window !== "undefined" ? localStorage.getItem("alloy_opportunity_id") : null;

            const quoteOutputForConfirm = quote
                ? {
                    estimated_price: quote.estimated_price,
                    first_clean_price: quote.first_clean_price,
                    recurring_price: quote.recurring_price ?? undefined,
                    frequency_label: quote.frequency_label ?? "One-time",
                    discount_label: quote.discount_label ?? undefined,
                    addons: quote.addons ?? [],
                    addons_total: quote.addons_total ?? undefined,
                }
                : undefined;
            const confirmPayload: Record<string, unknown> = {
                slot_start: selectedSlot.isoStart,
                slot_end: selectedSlot.isoEnd,
                timezone: timezone,
                quote_subtotal: quoteSubtotal,
                discount_amount: discountData?.discount_amount ?? 0,
                quote_total: discountData?.quote_total ?? quoteSubtotal,
                discount_code_id: discountData?.discount_code_id ?? null,
                discount_code: (discountData?.code ?? discountCode.trim()) || null,
                contact_email: resolvedEmail || prefillData.email,
                contact_phone: phoneForConfirm,
                contact_first_name: resolvedFirstName || prefillData.first_name,
                contact_last_name: resolvedLastName || prefillData.last_name,
                address: serviceDetails.address,
                city: serviceDetails.city,
                zip: quote?.quote_input?.zip ?? prefillData.zip ?? undefined,
                postal_code: quote?.quote_input?.postal_code ?? quote?.quote_input?.zip ?? prefillData.postal_code ?? prefillData.zip ?? undefined,
                state: prefillData.state ?? undefined,
                home_type: serviceDetails.home_type || undefined,
                bedrooms: serviceDetails.bedrooms,
                bathrooms: serviceDetails.bathrooms,
                access_method: serviceDetails.access_method,
                access_note: serviceDetails.access_note,
                additional_notes: serviceDetails.additional_notes,
                frequency_label: quote?.frequency_label || "One-time",
                first_clean_price: typeof quote?.first_clean_price === "number" ? quote.first_clean_price : undefined,
                recurring_price: typeof quote?.recurring_price === "number" ? quote.recurring_price : undefined,
                quote_input: quote?.quote_input ?? undefined,
                quote_output: quoteOutputForConfirm,
                booking_attempt_id: attemptId,
            };
            if (storedOpportunityId) confirmPayload.opportunity_id = storedOpportunityId;
            if (storedContactId) confirmPayload.contact_id = storedContactId;
            if (storedCustomerId) confirmPayload.customer_id = storedCustomerId;

            const bookingResponse = await fetch("/api/book-v2/confirm", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(confirmPayload),
            });

            const rawBody = await bookingResponse.text();
            console.log("[BOOK_V2_FLOW] confirm_response booking_attempt_id=", attemptId, "status=", bookingResponse.status, "body=", rawBody);
            let result: {
                ok?: boolean;
                message?: string;
                error?: string;
                detail?: string | unknown;
                job_id?: string;
                opportunity_id?: string;
                schedule_id?: string;
            } = {};
            try {
                if (rawBody) result = JSON.parse(rawBody);
            } catch {
                // non-JSON response (e.g. HTML error page)
            }
            if (process.env.NODE_ENV !== "production") {
                console.log("[BOOK_V2_FLOW] confirm_finished booking_attempt_id=", attemptId, "status=", bookingResponse.status, "body=", result);
            }

            if (!bookingResponse.ok || result.ok === false) {
                if (bookingResponse.status === 409 && result.error === "QUOTE_ID_MISMATCH") {
                    clearQuoteStorage();
                    setQuoteRefreshMessage("We refreshed your quote — please confirm it again.");
                    setCurrentStep("refine_quote");
                    setPaymentError(null);
                    setAvailableAddons(null);
                    setAvailableFrequencies(null);
                    return;
                }
                const detailStr =
                    result.detail == null ? null : typeof result.detail === "string" ? result.detail : JSON.stringify(result.detail);
                const message = result.message ?? result.error ?? detailStr ?? "Failed to confirm booking";
                setPaymentError(`${message}${attemptId ? ` (ID: ${attemptId})` : ""}`);
                return;
            }

            if (!result.job_id || !result.opportunity_id || !result.schedule_id) {
                setPaymentError(`Booking did not complete correctly. Please contact support. (ID: ${attemptId})`);
                return;
            }

            setBookingResult({
                schedule_id: result.schedule_id,
                job_id: result.job_id,
                opportunity_id: result.opportunity_id,
            });
            setCurrentStep("confirmed");
            resetBookingAttemptId();

            // Track InitiateCheckout when booking is confirmed
            trackMetaEvent("InitiateCheckout", {
                vertical: "cleaning",
                flow: "book",
            });

            // Track Purchase/CompleteRegistration when payment is saved and booking is complete
            const finalTotal = discountData?.quote_total || quoteSubtotal;
            trackMetaEvent("Purchase", {
                vertical: "cleaning",
                flow: "book",
                value: finalTotal,
                currency: "USD",
            });

            // Clear service details from storage
            try {
                localStorage.removeItem("alloy_book_v2_service_details");
            } catch (e) {
                // Ignore
            }
        } catch (err: any) {
            console.error("Payment/booking failed:", err);
            const msg = err.message || "Failed to complete booking. Please try again.";
            setPaymentError(attemptId ? `${msg} (ID: ${attemptId})` : msg);
        } finally {
            confirmInFlightRef.current = false;
            setIsProcessingPayment(false);
        }
    };

    // Reschedule flow: loading, error, success, or slot picker
    const rescheduleToken = searchParams?.get("reschedule_token");
    if (rescheduleToken?.trim()) {
        if (rescheduleLoading) {
            return (
                <div className="min-h-screen py-6 md:py-10">
                    <Section className="max-w-7xl">
                        <div className="max-w-md mx-auto bg-white rounded-xl border border-alloy-stone/20 shadow-sm p-6 text-center">
                            <p className="text-alloy-midnight/70">Loading…</p>
                        </div>
                    </Section>
                </div>
            );
        }
        if (rescheduleError) {
            return (
                <div className="min-h-screen py-6 md:py-10">
                    <Section className="max-w-7xl">
                        <div className="max-w-md mx-auto bg-white rounded-xl border border-alloy-stone/20 shadow-sm p-6 text-center">
                            <h2 className="text-xl font-semibold text-alloy-midnight mb-2">Unable to reschedule</h2>
                            <p className="text-alloy-midnight/70 text-sm mb-4">{rescheduleError}</p>
                            <a href="/" className="text-alloy-blue hover:underline text-sm">Go home</a>
                        </div>
                    </Section>
                </div>
            );
        }
        if (rescheduleResult) {
            const startDate = new Date(rescheduleResult.start_at);
            const endDate = new Date(rescheduleResult.end_at);
            const formatted = startDate.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
            return (
                <div className="min-h-screen py-6 md:py-10">
                    <Section className="max-w-7xl">
                        <div className="max-w-md mx-auto bg-white rounded-xl border border-alloy-stone/20 shadow-sm p-6 text-center">
                            <h2 className="text-xl font-semibold text-alloy-midnight mb-2">Appointment rescheduled</h2>
                            <p className="text-alloy-midnight/70 text-sm mb-4">Your appointment is now scheduled for {formatted}.</p>
                            <a href="/" className="text-alloy-blue hover:underline text-sm">Go home</a>
                        </div>
                    </Section>
                </div>
            );
        }
        if (rescheduleResolve) {
            const handleRescheduleConfirm = () => {
                if (!selectedSlot || rescheduleSubmitting) return;
                setRescheduleSubmitting(true);
                fetch("/api/action-links/consume-reschedule", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        token: rescheduleResolve.token,
                        start_at: selectedSlot.isoStart,
                        end_at: selectedSlot.isoEnd,
                        timezone,
                    }),
                })
                    .then((res) => res.json())
                    .then((data: { ok?: boolean; error?: string; start_at?: string; end_at?: string }) => {
                        if (data.ok && data.start_at && data.end_at) {
                            setRescheduleResult({ start_at: data.start_at, end_at: data.end_at });
                        } else {
                            setBookingError(data.error ?? "Failed to reschedule");
                        }
                    })
                    .catch(() => setBookingError("Failed to reschedule. Please try again."))
                    .finally(() => setRescheduleSubmitting(false));
            };
            return (
                <div className="min-h-screen py-6 md:py-10">
                    <Section className="max-w-7xl">
                        <div className="max-w-4xl mx-auto space-y-6">
                            <div className="bg-white rounded-xl overflow-hidden border border-alloy-stone/20 shadow-sm p-6">
                                <h2 className="text-xl font-bold text-alloy-midnight mb-2">Choose a new time</h2>
                                <p className="text-sm text-alloy-midnight/70 mb-6">Select an available slot below, then confirm to reschedule your appointment.</p>
                                <SlotPicker
                                    selectedSlot={selectedSlot}
                                    onSelectSlot={handleSelectSlot}
                                    onConfirmTime={handleRescheduleConfirm}
                                    timezone={timezone}
                                    error={bookingError}
                                />
                                <div className="mt-4">
                                    <a href="/" className="text-alloy-midnight/70 hover:underline text-sm">Back</a>
                                </div>
                            </div>
                        </div>
                    </Section>
                </div>
            );
        }
    }

    return (
        <div className="min-h-screen py-6 md:py-10">
            <Section className="max-w-7xl">
                {/* Step 1: Get a quote in 30 seconds (no quote yet) */}
                {currentStep === "quote_start" && !debug && (
                    <div className="bg-white rounded-xl overflow-hidden border border-alloy-stone/20 shadow-sm p-6 md:p-8 mb-5 max-w-4xl mx-auto w-full">
                        <h2 className="text-2xl font-bold text-alloy-midnight mb-2">
                            Get a quote in 30 seconds
                        </h2>
                        <p className="text-sm text-alloy-midnight/80 mb-6">
                            We’ll calculate your price and save it so you can book when you’re ready.
                        </p>
                        <form onSubmit={handleQuoteStartSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">First name *</label>
                                    <input
                                        type="text"
                                        value={quoteStartForm.first_name}
                                        onChange={(e) => setQuoteStartForm((f) => ({ ...f, first_name: e.target.value }))}
                                        placeholder="Jane"
                                        className="w-full px-3 py-2 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue"
                                        autoComplete="given-name"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">Last name *</label>
                                    <input
                                        type="text"
                                        value={quoteStartForm.last_name}
                                        onChange={(e) => setQuoteStartForm((f) => ({ ...f, last_name: e.target.value }))}
                                        placeholder="Doe"
                                        className="w-full px-3 py-2 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue"
                                        autoComplete="family-name"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">ZIP code *</label>
                                <input
                                    type="text"
                                    value={quoteStartForm.zip}
                                    onChange={(e) => setQuoteStartForm((f) => ({ ...f, zip: e.target.value }))}
                                    placeholder="e.g. 97702"
                                    className="w-full px-3 py-2 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue"
                                    maxLength={10}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">Approximate square footage *</label>
                                <select
                                    value={quoteStartForm.square_footage}
                                    onChange={(e) => setQuoteStartForm((f) => ({ ...f, square_footage: e.target.value }))}
                                    className="w-full px-3 py-2 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue"
                                >
                                    <option value="">Select</option>
                                    {SQUARE_FOOTAGE_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">Cleaning frequency</label>
                                <select
                                    value={quoteStartForm.cleaning_frequency}
                                    onChange={(e) => setQuoteStartForm((f) => ({ ...f, cleaning_frequency: e.target.value as "one_time" | "weekly" | "biweekly" | "monthly" }))}
                                    className="w-full px-3 py-2 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue"
                                >
                                    <option value="one_time">One-time</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="biweekly">Every 2 weeks</option>
                                    <option value="monthly">Monthly</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">Email (so we can save your quote)</label>
                                <input
                                    type="email"
                                    value={quoteStartForm.email}
                                    onChange={(e) => setQuoteStartForm((f) => ({ ...f, email: e.target.value }))}
                                    placeholder="you@example.com"
                                    className="w-full px-3 py-2 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">Phone *</label>
                                <input
                                    type="tel"
                                    required
                                    aria-required
                                    value={quoteStartForm.phone}
                                    onChange={(e) => setQuoteStartForm((f) => ({ ...f, phone: e.target.value }))}
                                    placeholder="(541) 555-0123"
                                    className="w-full px-3 py-2 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue"
                                />
                            </div>
                            {quoteStartError && <p className="text-sm text-red-600">{quoteStartError}</p>}
                            <button
                                type="submit"
                                disabled={quoteStartSubmitting}
                                className="w-full bg-alloy-blue text-white font-semibold px-6 py-3 rounded-lg hover:bg-alloy-blue/90 transition-colors disabled:opacity-50"
                            >
                                {quoteStartSubmitting ? "Saving…" : "Get my quote"}
                            </button>
                        </form>
                    </div>
                )}

                {/* Your Quote step: focal step after details; inline frequency + add-ons, then confirm */}
                {currentStep === "refine_quote" && hasQuote && quote && !debug && (
                    <div className="bg-white rounded-xl overflow-hidden border border-alloy-stone/20 shadow-sm p-6 md:p-8 mb-5 max-w-4xl mx-auto w-full">
                        {quoteRefreshMessage && (
                            <div className="mb-6 p-4 bg-alloy-juniper/15 border border-alloy-juniper/30 rounded-lg text-alloy-midnight">
                                <p className="text-sm font-medium text-alloy-pine">{quoteRefreshMessage}</p>
                            </div>
                        )}
                        <h2 className="text-2xl font-bold text-alloy-midnight mb-2">
                            Your Quote
                        </h2>
                        <p className="text-sm text-alloy-midnight/80 mb-6">
                            Review your price below. Change frequency or add-ons as needed—the quote updates as you go. When you&apos;re ready, confirm to pick a time.
                        </p>

                        {/* Quote breakdown: prominent at top */}
                        <div className="mb-6 p-4 bg-alloy-stone/10 rounded-lg space-y-2">
                            <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide">Quote breakdown</p>
                            <div className="flex items-baseline justify-between">
                                <span className="text-alloy-midnight">Base cleaning (first clean)</span>
                                <span className="font-semibold text-alloy-midnight">
                                    ${(quote.first_clean_price ?? 0).toFixed(2)}
                                </span>
                            </div>
                            {quote.addons && quote.addons.length > 0 && (
                                <>
                                    {quote.addons.map((a, idx) => (
                                        <div key={idx} className="flex items-baseline justify-between pl-2 text-sm">
                                            <span className="text-alloy-midnight/90">{a.name}</span>
                                            <span className="text-alloy-midnight/90">
                                                {a.price != null ? `$${a.price.toFixed(2)}` : "—"}
                                            </span>
                                        </div>
                                    ))}
                                    <div className="flex items-baseline justify-between border-t border-alloy-stone/20 pt-2 mt-1">
                                        <span className="text-alloy-midnight font-medium">Add-ons subtotal</span>
                                        <span className="font-semibold text-alloy-midnight">
                                            ${((quote.addons_total ?? quote.addons?.reduce((s, a) => s + (a.price ?? 0), 0) ?? 0)).toFixed(2)}
                                        </span>
                                    </div>
                                </>
                            )}
                            <div className="flex items-baseline justify-between border-t border-alloy-stone/20 pt-2 mt-1">
                                <span className="text-alloy-midnight font-semibold">Total (first visit)</span>
                                <span className="font-bold text-alloy-blue">
                                    ${(quote.estimated_price ?? quote.first_clean_price ?? 0).toFixed(2)}
                                </span>
                            </div>
                            {quote.recurring_price != null && quote.recurring_price > 0 && quote.frequency_label && (
                                <div className="flex items-baseline justify-between pt-1">
                                    <span className="text-alloy-midnight">
                                        Recurring ({quote.discount_label ? `${quote.frequency_label} — ${quote.discount_label}` : quote.frequency_label})
                                    </span>
                                    <span className="font-bold text-alloy-juniper">
                                        ${quote.recurring_price.toFixed(2)}/visit
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Change frequency: full labels, wrap allowed */}
                        <div className="mb-6">
                            <p className="text-sm font-semibold text-alloy-midnight mb-3">Cleaning frequency</p>
                            <div className="flex flex-wrap gap-2">
                                {(["one_time", "weekly", "biweekly", "monthly"] as const).map((freq) => (
                                    <button
                                        key={freq}
                                        type="button"
                                        onClick={() => handleRefineFrequencyChange(freq)}
                                        disabled={refineLoading}
                                        className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-normal break-words text-left ${
                                            refineFrequency === freq
                                                ? "bg-alloy-blue text-white"
                                                : "bg-alloy-stone/20 text-alloy-midnight hover:bg-alloy-stone/30"
                                        } disabled:opacity-50`}
                                    >
                                        {getFrequencyDisplayLabel(freq, availableFrequencies)}
                                    </button>
                                ))}
                            </div>
                            {refineLoading && <p className="text-xs text-alloy-midnight/60 mt-2">Updating price…</p>}
                        </div>

                        {/* Add-ons: optimistic checkboxes (selectedAddonKeys); prices from DB via availableAddons */}
                        <div className="mb-6">
                            <p className="text-sm font-semibold text-alloy-midnight mb-3">Add-ons</p>
                            <div className="space-y-2">
                                {ADDON_IDS.map((id) => {
                                    const addonKey = ADDON_ID_TO_KEY[id];
                                    const dbAddon = availableAddons?.find((a) => a.id === addonKey);
                                    const price = dbAddon?.price ?? null;
                                    return (
                                        <label key={id} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedAddonKeys.includes(addonKey)}
                                                onChange={() => handleRefineAddOnToggle(addonKey)}
                                                disabled={refineLoading}
                                                className="rounded border-alloy-stone/50 text-alloy-blue focus:ring-alloy-blue"
                                            />
                                            <span className="text-sm text-alloy-midnight">
                                                {dbAddon?.label ?? id}
                                                {price != null && <span className="text-alloy-midnight/70 ml-1">— ${price.toFixed(2)}</span>}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                            {refineError && <p className="text-sm text-red-600 mt-2">{refineError}</p>}
                        </div>

                        <button
                            type="button"
                            onClick={handleRefineContinue}
                            className="w-full bg-alloy-blue text-white font-semibold px-6 py-3 rounded-lg hover:bg-alloy-blue/90 transition-colors"
                        >
                            Confirm Quote
                        </button>
                    </div>
                )}

                {/* Fallback message if no quote and not on quote_start step */}
                {!hasQuote && !debug && currentStep !== "quote_start" && currentStep !== "refine_quote" && (
                    <div className="bg-white rounded-xl overflow-hidden border border-alloy-stone/20 shadow-sm p-6 md:p-8 mb-5 max-w-4xl mx-auto w-full text-center">
                        <h2 className="text-2xl font-bold text-alloy-midnight mb-3">
                            Please start your quote first
                        </h2>
                        <p className="text-sm text-alloy-midnight/80 mb-6">
                            To book a cleaning, please fill out the quote form above or on our services page.
                        </p>
                        <a
                            href="/book-v2"
                            className="inline-block bg-alloy-blue text-white font-semibold px-6 py-3 rounded-lg hover:bg-alloy-blue/90 transition-colors"
                        >
                            Get a Quote
                        </a>
                    </div>
                )}

                {/* Single-column stacked layout: Quote → Time Slot → Service Details → Payment */}
                {hasQuote && currentStep !== "confirmed" && currentStep !== "refine_quote" && (
                    <div className="space-y-6 max-w-4xl mx-auto">
                        {quoteJustSaved && (
                            <div className="bg-alloy-juniper/15 border border-alloy-juniper/30 rounded-lg px-4 py-3 text-alloy-midnight">
                                <p className="text-sm font-medium text-alloy-pine">
                                    Quote saved — continue to pick a time.
                                </p>
                            </div>
                        )}

                        {/* Card 1: Your Quote */}
                        <div className="bg-white rounded-xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-5">
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

                                <div className="pt-2">
                                    <button
                                        type="button"
                                        onClick={handleEditQuote}
                                        className="text-xs text-alloy-midnight/60 hover:text-alloy-blue hover:underline"
                                    >
                                        Change quote
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Card 2: Time Slot */}
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
                                <SlotPicker
                                    selectedSlot={selectedSlot}
                                    onSelectSlot={handleSelectSlot}
                                    onConfirmTime={handleConfirmSlot}
                                    timezone={timezone}
                                    error={bookingError}
                                />
                            ) : (
                                <div className="bg-alloy-stone/10 rounded-lg p-4">
                                    <p className="text-sm text-alloy-midnight/70">
                                        <strong>{selectedSlot?.timeWindow}</strong> on{" "}
                                        {mounted ? selectedSlot?.start.toLocaleDateString("en-US", {
                                            weekday: "long",
                                            month: "long",
                                            day: "numeric",
                                            timeZone: timezone,
                                        }) : selectedSlot?.start.toISOString().split("T")[0]}
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

                        {/* Card 3: Service Details */}
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
                                                Payment unlocked — complete your booking below.
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <ServiceDetailsForm
                                            initialData={quote?.quote_input?.home_type ? { home_type: quote.quote_input.home_type } : undefined}
                                            onDataChange={handleServiceDetailsChange}
                                        />
                                        {serviceDetailsValid && (
                                            <div className="mt-6 pt-6 border-t border-alloy-stone/20">
                                                <button
                                                    onClick={handleConfirmServiceDetails}
                                                    className="w-full sm:w-auto sm:px-6 px-4 py-2.5 bg-alloy-blue text-white font-semibold rounded-lg hover:bg-alloy-blue/90 transition-colors text-sm"
                                                >
                                                    Confirm Details
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {/* Card 4: Payment (with summary at top) */}
                        <div className="bg-white rounded-xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-5">
                            <h3 className="text-lg font-bold text-alloy-midnight mb-4">
                                Payment
                            </h3>

                            {!isPaymentUnlocked ? (
                                <div className="bg-alloy-stone/20 rounded-lg p-4 text-center">
                                    <p className="text-xs text-alloy-midnight/60">
                                        Complete the steps above to unlock payment
                                    </p>
                                </div>
                            ) : !mounted ? (
                                <div className="bg-alloy-stone/20 rounded-lg p-4 text-center">
                                    <p className="text-xs text-alloy-midnight/60">Loading...</p>
                                </div>
                            ) : !identityHydrated ? (
                                <div className="bg-alloy-stone/20 rounded-lg p-4 text-center">
                                    <p className="text-xs text-alloy-midnight/60">Loading...</p>
                                </div>
                            ) : !resolvedEmail || !resolvedPhone ? (
                                <div className="bg-alloy-stone/20 rounded-lg p-4">
                                    <p className="text-xs text-alloy-midnight/60 mb-3">
                                        Enter your email and phone to load payment.
                                    </p>
                                    <form onSubmit={handlePaymentIdentityContinue} className="space-y-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">Email</label>
                                            <input
                                                type="email"
                                                value={paymentIdentityEmail}
                                                onChange={(e) => { setPaymentIdentityEmail(e.target.value); setPaymentIdentityError(null); }}
                                                placeholder="you@example.com"
                                                className="w-full px-3 py-2 border border-alloy-stone/40 rounded-lg text-sm text-alloy-midnight placeholder:text-alloy-midnight/40 focus:outline-none focus:ring-2 focus:ring-alloy-blue/50"
                                                autoComplete="email"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">Phone *</label>
                                            <input
                                                type="tel"
                                                required
                                                aria-required
                                                value={paymentIdentityPhone}
                                                onChange={(e) => { setPaymentIdentityPhone(e.target.value); setPaymentIdentityError(null); }}
                                                placeholder="+1 555 123 4567"
                                                className="w-full px-3 py-2 border border-alloy-stone/40 rounded-lg text-sm text-alloy-midnight placeholder:text-alloy-midnight/40 focus:outline-none focus:ring-2 focus:ring-alloy-blue/50"
                                                autoComplete="tel"
                                            />
                                        </div>
                                        {paymentIdentityError && <p className="text-sm text-red-600">{paymentIdentityError}</p>}
                                        <button
                                            type="submit"
                                            disabled={paymentIdentitySubmitting}
                                            className="w-full sm:w-auto px-6 py-2.5 bg-alloy-blue text-white font-semibold rounded-lg hover:bg-alloy-blue/90 transition-colors text-sm disabled:opacity-60"
                                        >
                                            {paymentIdentitySubmitting ? "Saving…" : "Continue"}
                                        </button>
                                    </form>
                                </div>
                            ) : (
                                <>
                                    {/* Payment summary: this job total + scheduled date/time */}
                                    {(() => {
                                        const basePrice =
                                            (typeof quote?.first_clean_price === "number" && quote.first_clean_price > 0
                                                ? quote.first_clean_price
                                                : typeof quote?.estimated_price === "number" && quote.estimated_price > 0
                                                    ? quote.estimated_price
                                                    : null);
                                        const firstVisitTotal = basePrice != null && basePrice > 0
                                            ? (discountData?.quote_total ?? basePrice)
                                            : null;
                                        return (
                                            <div className="mb-6 p-4 bg-alloy-stone/10 rounded-lg border border-alloy-stone/20 space-y-2">
                                                <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide">
                                                    This job total
                                                </p>
                                                {firstVisitTotal != null ? (
                                                    <p className="text-xl font-bold text-alloy-blue">
                                                        ${firstVisitTotal.toFixed(2)}
                                                    </p>
                                                ) : (
                                                    <p className="text-sm text-alloy-midnight/70">Calculating…</p>
                                                )}
                                                {selectedSlot && (
                                                    <p className="text-sm text-alloy-midnight/70 mt-2">
                                                        Scheduled: {selectedSlot.timeWindow}
                                                        {mounted && (
                                                            <> · {selectedSlot.start.toLocaleDateString("en-US", {
                                                                weekday: "long",
                                                                month: "long",
                                                                day: "numeric",
                                                                timeZone: timezone,
                                                            })}</>
                                                        )}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    <form onSubmit={handlePaymentSubmit} className="space-y-4">
                                        <div className="bg-alloy-juniper/10 border border-alloy-juniper/20 rounded-lg p-3">
                                            <p className="text-xs font-semibold text-alloy-midnight mb-1">
                                                No charge today.
                                            </p>
                                            <p className="text-xs text-alloy-midnight/70 leading-relaxed">
                                                We'll save your card to hold your appointment. You'll only be charged after the cleaning is completed and confirmed.
                                            </p>
                                        </div>

                                        <div className="space-y-4">
                                            {!stripe || !cardNumber || !cardExpiry || !cardCvc ? (
                                                <div className="px-4 py-8 border border-alloy-stone/30 rounded-lg bg-alloy-stone/10 flex items-center justify-center">
                                                    <div className="text-center">
                                                        <div className="w-6 h-6 border-2 border-alloy-blue border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                                                        <p className="text-xs text-alloy-midnight/60">Loading payment form...</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div>
                                                        <label className="block text-xs font-medium text-alloy-midnight mb-2">
                                                            Card Number
                                                        </label>
                                                        <div
                                                            ref={cardNumberRef}
                                                            className="px-4 py-3 border border-alloy-stone/30 rounded-lg min-h-[50px]"
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-xs font-medium text-alloy-midnight mb-2">
                                                                Expiration
                                                            </label>
                                                            <div
                                                                ref={cardExpiryRef}
                                                                className="px-4 py-3 border border-alloy-stone/30 rounded-lg min-h-[50px]"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-alloy-midnight mb-2">
                                                                CVC
                                                            </label>
                                                            <div
                                                                ref={cardCvcRef}
                                                                className="px-4 py-3 border border-alloy-stone/30 rounded-lg min-h-[50px]"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-alloy-midnight mb-2">
                                                            ZIP Code
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={postalCode}
                                                            onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                                                            placeholder="12345"
                                                            className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-transparent"
                                                            maxLength={5}
                                                        />
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {paymentError && (
                                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                                <p className="text-xs text-red-800">{paymentError}</p>
                                            </div>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={isProcessingPayment || !stripe || !cardNumber || !cardExpiry || !cardCvc || !resolvedEmail || !resolvedPhone}
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
                                </>
                            )}
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
                                    {mounted ? selectedSlot.start.toLocaleDateString("en-US", {
                                        weekday: "long",
                                        month: "long",
                                        day: "numeric",
                                        timeZone: timezone,
                                    }) : selectedSlot.start.toISOString().split("T")[0]}
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
