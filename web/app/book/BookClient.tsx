"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Section from "@/components/Section";
import Accordion from "@/components/Accordion";
import { REDIRECT_DELAY_MS } from "@/lib/ui";

// Import clean React-safe GHL booking embed component
import GhlBookingEmbed from "@/components/GhlBookingEmbed";

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

    // State for ensuring ghl_contact_id exists before showing booking widget
    const [isEnsuringContactId, setIsEnsuringContactId] = useState(false);
    const [contactIdReady, setContactIdReady] = useState(false);
    const [contactIdError, setContactIdError] = useState<string | null>(null);
    const [resolvedContactId, setResolvedContactId] = useState<string | null>(null);

    // Discount code state
    const [discountCode, setDiscountCode] = useState("");
    const [discountData, setDiscountData] = useState<DiscountData | null>(null);
    const [discountError, setDiscountError] = useState<string | null>(null);
    const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);

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
            setFetchStatus("error");
            setQuote(null);
        }
    }, []);

    // Validate discount code
    const handleValidateDiscount = async () => {
        if (!discountCode.trim()) {
            setDiscountError("Please enter a discount code");
            return;
        }

        setIsValidatingDiscount(true);
        setDiscountError(null);

        try {
            const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
            
            // Get quote subtotal (first cleaning price)
            const quoteSubtotal = 
                (typeof quote?.first_clean_price === "number" && quote.first_clean_price > 0)
                    ? quote.first_clean_price
                    : (typeof quote?.estimated_price === "number" && quote.estimated_price > 0)
                        ? quote.estimated_price
                        : 0;

            if (quoteSubtotal === 0) {
                setDiscountError("Quote price not available");
                setIsValidatingDiscount(false);
                return;
            }

            // Get contact info from prefill or search params
            const prefill = sessionStorage.getItem("alloy_booking_prefill") ||
                localStorage.getItem("alloy_booking_prefill");
            let ghlContactId: string | undefined;
            let emailParam: string | undefined;
            let phoneParam: string | undefined;

            if (prefill) {
                try {
                    const prefillData = JSON.parse(prefill);
                    ghlContactId = prefillData.ghl_contact_id;
                    emailParam = prefillData.email || email || undefined;
                    phoneParam = prefillData.phone || phone || undefined;
                } catch (e) {
                    console.warn("Failed to parse prefill for discount validation:", e);
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
                    ghl_contact_id: ghlContactId,
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

                // Immediately redeem if ghl_contact_id exists
                if (ghlContactId) {
                    console.log("[DISCOUNT] Applying discount, immediately redeeming...", {
                        code: discountCode.trim().toUpperCase(),
                        ghl_contact_id: ghlContactId,
                        discount_amount: data.discount_amount,
                        quote_total: data.quote_total,
                    });
                    
                    try {
                        const redeemResponse = await fetch(`${apiBaseUrl}/discounts/redeem`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                code: discountCode.trim().toUpperCase(),
                                ghl_contact_id: ghlContactId,
                                email: emailParam,
                                phone: phoneParam,
                                opportunity_id: null,
                                job_id: null,
                                quote_subtotal: quoteSubtotal,
                                discount_amount: data.discount_amount,
                                quote_total: data.quote_total,
                            }),
                        });

                        const redeemData = await redeemResponse.json();
                        console.log("[DISCOUNT] Redeem response:", {
                            status: redeemResponse.status,
                            success: redeemData.success,
                            reason: redeemData.reason,
                        });

                        if (!redeemData.success && redeemData.reason === "already_used") {
                            // Remove discount from UI and storage
                            setDiscountData(null);
                            setDiscountCode("");
                            setDiscountError("This discount code has already been used");
                            
                            // Remove from prefill
                            const prefill = sessionStorage.getItem("alloy_booking_prefill") ||
                                localStorage.getItem("alloy_booking_prefill");
                            if (prefill) {
                                try {
                                    const prefillData = JSON.parse(prefill);
                                    delete prefillData.discount_code;
                                    delete prefillData.discount_code_id;
                                    delete prefillData.discount_amount;
                                    delete prefillData.quote_total;
                                    const jsonData = JSON.stringify(prefillData);
                                    sessionStorage.setItem("alloy_booking_prefill", jsonData);
                                    localStorage.setItem("alloy_booking_prefill", jsonData);
                                } catch (e) {
                                    console.warn("Failed to remove discount from prefill:", e);
                                }
                            }
                        }
                    } catch (redeemError) {
                        console.error("[DISCOUNT] Failed to redeem discount:", redeemError);
                        // Don't fail the validation - redemption can happen later
                    }
                } else {
                    console.log("[DISCOUNT] Discount validated but ghl_contact_id not available yet, will redeem after lead submission");
                }
            } else {
                if (data.reason === "already_used") {
                    setDiscountError("This discount code has already been used");
                } else if (data.reason === "contact_required") {
                    setDiscountError("Please complete your contact information first");
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

    // Redeem discount code after lead submission
    const redeemDiscount = async (ghlContactId: string, opportunityId?: string) => {
        if (!discountData) return;

        try {
            const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
            
            const quoteSubtotal = 
                (typeof quote?.first_clean_price === "number" && quote.first_clean_price > 0)
                    ? quote.first_clean_price
                    : (typeof quote?.estimated_price === "number" && quote.estimated_price > 0)
                        ? quote.estimated_price
                        : 0;

            // Get email/phone from prefill or search params for fallback contact resolution
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
                    console.warn("Failed to parse prefill for discount redeem:", e);
                }
            }

            if (!emailParam && !phoneParam) {
                emailParam = email || undefined;
                phoneParam = phone || undefined;
            }

            const response = await fetch(`${apiBaseUrl}/discounts/redeem`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    code: discountData.code,
                    ghl_contact_id: ghlContactId,
                    email: emailParam,
                    phone: phoneParam,
                    opportunity_id: opportunityId,
                    job_id: null,
                    quote_subtotal: quoteSubtotal,
                    discount_amount: discountData.discount_amount,
                    quote_total: discountData.quote_total,
                }),
            });

            const data = await response.json();

            if (!data.success && data.reason === "already_used") {
                // Remove discount from UI and storage
                setDiscountData(null);
                setDiscountCode("");
                setDiscountError("This discount code has already been used");
                
                const prefill = sessionStorage.getItem("alloy_booking_prefill") ||
                    localStorage.getItem("alloy_booking_prefill");
                if (prefill) {
                    try {
                        const prefillData = JSON.parse(prefill);
                        delete prefillData.discount_code;
                        delete prefillData.discount_code_id;
                        delete prefillData.discount_amount;
                        delete prefillData.quote_total;
                        const jsonData = JSON.stringify(prefillData);
                        sessionStorage.setItem("alloy_booking_prefill", jsonData);
                        localStorage.setItem("alloy_booking_prefill", jsonData);
                    } catch (e) {
                        console.warn("Failed to remove discount from prefill:", e);
                    }
                }
            }
        } catch (error) {
            console.error("Failed to redeem discount code:", error);
        }
    };

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
                        console.log("[STAGING DEBUG] BookClient: Initialized alloy_booking_prefill from alloy_lead_form_data", {
                            storage_key: "alloy_booking_prefill",
                            has_session_storage: typeof sessionStorage !== "undefined",
                            has_local_storage: typeof localStorage !== "undefined",
                            data_keys: Object.keys(cleanedData)
                        });
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
            if (isStaging) {
                console.error("[STAGING DEBUG] BookClient: Failed to initialize from form data", {
                    error: String(e),
                    storage_key: "alloy_booking_prefill"
                });
            }
            console.warn("Failed to initialize alloy_booking_prefill from form data:", e);
        }
    }, []);

    // Ensure ghl_contact_id exists before showing booking widget (Standard Cleaning only)
    useEffect(() => {
        const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";

        // Only for Standard Cleaning
        if (!quote || quote.service === "Move-Out / Heavy Clean") {
            // For Move-Out, allow widget to show immediately
            setContactIdReady(true);
            return;
        }

        // Check if contact_id already exists
        let existingPrefill: any = null;
        try {
            const stored = sessionStorage.getItem("alloy_booking_prefill") ||
                localStorage.getItem("alloy_booking_prefill");
            if (stored) {
                existingPrefill = JSON.parse(stored);
                if (existingPrefill.ghl_contact_id) {
                    if (isStaging) {
                        console.log("[STAGING] ghl_contact_id already exists, ready to show widget");
                    }
                    setResolvedContactId(existingPrefill.ghl_contact_id);
                    setContactIdReady(true);
                    return;
                }
            }
        } catch (e) {
            console.warn("Failed to read existing prefill:", e);
        }

        // Contact_id doesn't exist, need to submit lead form
        setIsEnsuringContactId(true);
        setContactIdError(null);

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

        // Validate phone and email exist
        if (!formData || !formData.phone || !formData.email) {
            const errorMsg = "Missing form data. Please go back and complete the quote form.";
            setContactIdError(errorMsg);
            setIsEnsuringContactId(false);
            if (isStaging) {
                console.error("[STAGING] Cannot ensure contact_id: missing phone or email");
            }
            return;
        }

        // Submit lead to backend
        if (isStaging) {
            console.log("[STAGING] Ensuring ghl_contact_id before showing booking widget");
        }

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

        // Submit with 10 second timeout
        if (isStaging) {
            console.log("[STAGING DEBUG] BookClient: About to submit lead", {
                api_base_url: apiBaseUrl,
                endpoint: `${apiBaseUrl}/leads/cleaning`,
                has_phone: !!formData.phone,
                has_email: !!formData.email
            });
        }

        const submitPromise = fetch(`${apiBaseUrl}/leads/cleaning`, {
            method: "POST",
            body: submitFormData,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("timeout")), 10000);
        });

        Promise.race([submitPromise, timeoutPromise])
            .then(async (response) => {
                if (response instanceof Response) {
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        const errorMsg = errorData.detail || "Failed to create contact. Please try again.";
                        setContactIdError(errorMsg);
                        setIsEnsuringContactId(false);
                        if (isStaging) {
                            console.error("[STAGING] Lead submission failed:", {
                                status: response.status,
                                error: errorData
                            });
                        }
                        return;
                    }

                    const backendResult = await response.json();
                    if (isStaging) {
                        console.log("[STAGING] Lead submission successful, contact_id:", backendResult.contact_id);
                    }

                    // Redeem discount if present
                    if (backendResult.contact_id && discountData) {
                        await redeemDiscount(backendResult.contact_id, backendResult.opportunity_id);
                    }

                    // Store ghl_contact_id in prefill
                    if (backendResult.contact_id) {
                        try {
                            if (isStaging) {
                                console.log("[STAGING DEBUG] BookClient: Writing session data after contact_id resolution", {
                                    api_base_url: apiBaseUrl,
                                    contact_id: backendResult.contact_id,
                                    storage_key: "alloy_booking_prefill"
                                });
                            }

                            const prefillData = {
                                ...existingPrefill,
                                ghl_contact_id: backendResult.contact_id,
                                phone: formData.phone,
                                email: formData.email,
                                first_name: formData.first_name,
                                last_name: formData.last_name,
                            };

                            const jsonData = JSON.stringify(prefillData);
                            sessionStorage.setItem("alloy_booking_prefill", jsonData);
                            localStorage.setItem("alloy_booking_prefill", jsonData);

                            if (isStaging) {
                                console.log("[STAGING DEBUG] BookClient: Session data written successfully", {
                                    storage_key: "alloy_booking_prefill",
                                    has_session_storage: typeof sessionStorage !== "undefined",
                                    has_local_storage: typeof localStorage !== "undefined",
                                    data_keys: Object.keys(prefillData)
                                });
                            }

                            setResolvedContactId(backendResult.contact_id);
                            setContactIdReady(true);
                            setIsEnsuringContactId(false);

                            if (isStaging) {
                                console.log("[STAGING] ghl_contact_id stored, widget ready to show");
                            }
                        } catch (e) {
                            if (isStaging) {
                                console.error("[STAGING DEBUG] BookClient: Failed to write session data", {
                                    error: String(e),
                                    storage_key: "alloy_booking_prefill"
                                });
                            }
                            console.warn("Failed to store ghl_contact_id:", e);
                            setContactIdError("Contact created but failed to save. Please refresh and try again.");
                            setIsEnsuringContactId(false);
                        }
                    } else {
                        const errorMsg = "Contact created but no ID returned. Please try again.";
                        setContactIdError(errorMsg);
                        setIsEnsuringContactId(false);
                    }
                }
            })
            .catch((error) => {
                if (isStaging) {
                    console.error("[STAGING DEBUG] BookClient: Lead submission failed", {
                        api_base_url: apiBaseUrl,
                        endpoint: `${apiBaseUrl}/leads/cleaning`,
                        error_type: error.message === "timeout" ? "timeout" : "error",
                        error_message: String(error)
                    });
                }

                if (error.message === "timeout") {
                    const errorMsg = "Request timed out. Please try again.";
                    setContactIdError(errorMsg);
                    if (isStaging) {
                        console.warn("[STAGING] Lead submission timeout");
                    }
                } else {
                    const errorMsg = "We couldn't start your booking. Please try again.";
                    setContactIdError(errorMsg);
                    if (isStaging) {
                        console.error("[STAGING] Lead submission error:", error);
                    }
                }
                setIsEnsuringContactId(false);
            });
    }, [quote]);

    // Submit lead to backend/GHL if quote exists and ghl_contact_id is missing (Standard Cleaning only)
    // This is the background submission that runs in parallel (non-blocking)
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

                    // Redeem discount if present
                    if (backendResult.contact_id && discountData) {
                        await redeemDiscount(backendResult.contact_id, backendResult.opportunity_id);
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
                                                const basePrice =
                                                    (typeof quote.first_clean_price === "number" &&
                                                        quote.first_clean_price > 0
                                                        ? quote.first_clean_price
                                                        : typeof quote.estimated_price === "number" &&
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
                                                            onClick={async () => {
                                                                // Unredeem discount in Supabase
                                                                const prefill = sessionStorage.getItem("alloy_booking_prefill") ||
                                                                    localStorage.getItem("alloy_booking_prefill");
                                                                let ghlContactId: string | undefined;
                                                                let emailParam: string | undefined;
                                                                let phoneParam: string | undefined;

                                                                if (prefill) {
                                                                    try {
                                                                        const prefillData = JSON.parse(prefill);
                                                                        ghlContactId = prefillData.ghl_contact_id;
                                                                        emailParam = prefillData.email || email || undefined;
                                                                        phoneParam = prefillData.phone || phone || undefined;
                                                                    } catch (e) {
                                                                        console.warn("Failed to parse prefill for unredeem:", e);
                                                                    }
                                                                }

                                                                if (!emailParam && !phoneParam) {
                                                                    emailParam = email || undefined;
                                                                    phoneParam = phone || undefined;
                                                                }

                                                                if (ghlContactId || emailParam || phoneParam) {
                                                                    try {
                                                                        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
                                                                        console.log("[DISCOUNT] Unredeeming discount...", {
                                                                            code: discountData.code,
                                                                            ghl_contact_id: ghlContactId,
                                                                        });

                                                                        const response = await fetch(`${apiBaseUrl}/discounts/unredeem`, {
                                                                            method: "POST",
                                                                            headers: {
                                                                                "Content-Type": "application/json",
                                                                            },
                                                                            body: JSON.stringify({
                                                                                code: discountData.code,
                                                                                ghl_contact_id: ghlContactId,
                                                                                email: emailParam,
                                                                                phone: phoneParam,
                                                                            }),
                                                                        });

                                                                        const data = await response.json();
                                                                        console.log("[DISCOUNT] Unredeem response:", {
                                                                            status: response.status,
                                                                            released: data.released,
                                                                            reason: data.reason,
                                                                        });

                                                                        if (!data.released && data.reason === "not_found_or_linked") {
                                                                            console.log("[DISCOUNT] Redemption already linked to opportunity/job, cannot unredeem");
                                                                        }
                                                                    } catch (error) {
                                                                        console.error("[DISCOUNT] Failed to unredeem discount:", error);
                                                                        // Continue with UI removal even if unredeem fails
                                                                    }
                                                                }

                                                                // Remove from UI and storage
                                                                setDiscountData(null);
                                                                setDiscountCode("");
                                                                setDiscountError(null);
                                                                
                                                                // Remove from prefill
                                                                if (prefill) {
                                                                    try {
                                                                        const prefillData = JSON.parse(prefill);
                                                                        delete prefillData.discount_code;
                                                                        delete prefillData.discount_code_id;
                                                                        delete prefillData.discount_amount;
                                                                        delete prefillData.quote_total;
                                                                        const jsonData = JSON.stringify(prefillData);
                                                                        sessionStorage.setItem("alloy_booking_prefill", jsonData);
                                                                        localStorage.setItem("alloy_booking_prefill", jsonData);
                                                                    } catch (e) {
                                                                        console.warn("Failed to remove discount from prefill:", e);
                                                                    }
                                                                }
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
                            {(() => {
                                // For Move-Out, always show widget
                                if (quote && quote.service === "Move-Out / Heavy Clean") {
                                    return (
                                        <>
                                            <GhlBookingEmbed
                                                phone={phone}
                                                email={email}
                                                firstName={firstName}
                                                lastName={lastName}
                                                contactId={null}
                                            />
                                            <p className="text-sm text-alloy-midnight/60 mt-4 text-center">
                                                You&apos;ll pay after the clean is completed. We&apos;ll text to confirm details.
                                            </p>
                                        </>
                                    );
                                }

                                // For Standard Cleaning, ensure contact_id is ready
                                if (isEnsuringContactId) {
                                    return (
                                        <div className="min-h-[1200px] md:min-h-[900px] flex items-center justify-center">
                                            <div className="text-center">
                                                <div className="mb-4">
                                                    <div className="w-12 h-12 border-4 border-alloy-blue border-t-transparent rounded-full animate-spin mx-auto"></div>
                                                </div>
                                                <p className="text-alloy-midnight font-semibold">Preparing booking...</p>
                                                <p className="text-sm text-alloy-midnight/60 mt-2">
                                                    Setting up your account
                                                </p>
                                            </div>
                                        </div>
                                    );
                                }

                                if (contactIdError) {
                                    return (
                                        <div className="min-h-[1200px] md:min-h-[900px] flex items-center justify-center">
                                            <div className="text-center max-w-md">
                                                <div className="mb-4">
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
                                                <h3 className="text-lg font-bold text-alloy-midnight mb-2">
                                                    We couldn&apos;t start your booking
                                                </h3>
                                                <p className="text-alloy-midnight/70 mb-6">
                                                    {contactIdError}
                                                </p>
                                                <button
                                                    onClick={() => window.location.reload()}
                                                    className="inline-block bg-alloy-blue text-white font-semibold px-6 py-3 rounded-lg hover:bg-alloy-blue/90 transition-colors"
                                                >
                                                    Try Again
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }

                                // Show widget only when contact_id is ready
                                if (contactIdReady) {
                                    return (
                                        <>
                                            <GhlBookingEmbed
                                                phone={phone}
                                                email={email}
                                                firstName={firstName}
                                                lastName={lastName}
                                                contactId={resolvedContactId}
                                            />
                                            <p className="text-sm text-alloy-midnight/60 mt-4 text-center">
                                                You&apos;ll pay after the clean is completed. We&apos;ll text to confirm details.
                                            </p>
                                        </>
                                    );
                                }

                                // Default: show loading (shouldn't reach here, but safety fallback)
                                return (
                                    <div className="min-h-[1200px] md:min-h-[900px] flex items-center justify-center">
                                        <p className="text-alloy-midnight/70">Loading...</p>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>

                {/* Booking Success Modal */}
                {showBookingSuccess && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl border border-[#59678b]/40">
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

