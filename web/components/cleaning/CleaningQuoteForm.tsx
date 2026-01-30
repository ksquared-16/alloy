"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { REDIRECT_DELAY_MS } from "@/lib/ui";
import {
    type CleaningQuoteInput,
    type CleaningQuoteResult,
    type ServiceType,
    type CleaningFrequencyOption,
    type SquareFootageOption,
    type AddOnId,
    type AddOnFrequencyOption,
    type ServiceHomeType,
} from "@/lib/pricing/cleaningPricing";
import {
    getQuotePricingFromSupabase,
    convertSupabaseResultToQuoteResult,
} from "@/lib/pricing/supabasePricing";
import PrimaryButton from "@/components/PrimaryButton";
import { compressImage, validateImageSize } from "@/lib/images/resizeCompress";
import { buildBookingUrl } from "@/lib/booking";

type FormState = {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    postalCode: string;
    homeType: ServiceHomeType | "";
    serviceType: ServiceType | "";
    squareFootage: SquareFootageOption | "";
    cleaningFrequency: CleaningFrequencyOption | "";
    preferredServiceDate: string;
    addOns: AddOnId[];
    addOnFrequency: AddOnFrequencyOption | "";
    streetAddress: string;
    photos: File[];
};

type ValidationErrors = Partial<Record<keyof FormState | "consent" | "submit" | "photos", string>>;

const INITIAL_FORM: FormState = {
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    postalCode: "",
    homeType: "",
    serviceType: "",
    squareFootage: "",
    cleaningFrequency: "",
    preferredServiceDate: "",
    addOns: [],
    addOnFrequency: "",
    streetAddress: "",
    photos: [],
};

function validate(form: FormState): ValidationErrors {
    const errors: ValidationErrors = {};

    if (!form.firstName.trim()) errors.firstName = "First name is required.";
    if (!form.lastName.trim()) errors.lastName = "Last name is required.";

    if (!form.phone.trim()) {
        errors.phone = "Phone number is required.";
    } else if (!/^[0-9+().\-\s]{7,}$/.test(form.phone.trim())) {
        errors.phone = "Please enter a valid phone number.";
    }

    if (!form.email.trim()) {
        errors.email = "Email is required.";
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
        errors.email = "Please enter a valid email address.";
    }

    if (!form.postalCode.trim()) {
        errors.postalCode = "Postal code is required.";
    }

    if (!form.homeType) errors.homeType = "Home type is required.";
    if (!form.serviceType) errors.serviceType = "Service type is required.";
    if (!form.squareFootage) errors.squareFootage = "Approximate size is required.";

    const isMoveOut = form.serviceType === "Move-Out / Heavy Clean";

    // Frequency is only required for Standard Cleaning
    if (!isMoveOut && !form.cleaningFrequency) {
        errors.cleaningFrequency = "Cleaning frequency is required.";
    }

    // Move-Out specific requirements
    if (isMoveOut) {
        if (!form.preferredServiceDate?.trim()) {
            errors.preferredServiceDate = "Please provide a preferred service date.";
        }
        if (!form.streetAddress.trim()) {
            errors.streetAddress = "Street address is required for move-out cleaning.";
        }
        if (form.photos.length < 4) {
            errors.photos = "Please upload at least 4 photos showcasing different areas of your home.";
        } else if (form.photos.length > 4) {
            errors.photos = "Please upload no more than 4 photos.";
        }
        // Validate individual photo sizes (3MB limit after compression)
        const MAX_PHOTO_SIZE_AFTER = 3 * 1024 * 1024; // 3MB after compression
        for (const photo of form.photos) {
            if (!validateImageSize(photo, MAX_PHOTO_SIZE_AFTER)) {
                errors.photos = `Photo "${photo.name}" is too large (${(photo.size / 1024 / 1024).toFixed(1)}MB). Please try a different image.`;
                break;
            }
        }
    }

    // Add-ons frequency only required if add-ons are selected (and not Move-Out, and not One-time)
    const isOneTime = form.cleaningFrequency === "One-time";
    if (!isMoveOut && !isOneTime && form.addOns.length > 0 && !form.addOnFrequency) {
        errors.addOnFrequency = "Please select how often you want add-ons.";
    }

    return errors;
}

interface CleaningQuoteFormProps {
    onQuoteCalculated?: (quote: CleaningQuoteResult, input: CleaningQuoteInput) => void;
    variant?: "light" | "dark";
    onSuccess?: (bookingUrl?: string) => void;
    mode?: "page" | "modal";
}

export default function CleaningQuoteForm({
    onQuoteCalculated,
    variant = "light",
    onSuccess,
    mode = "page",
}: CleaningQuoteFormProps) {
    const router = useRouter();
    const [form, setForm] = useState<FormState>(INITIAL_FORM);
    const [consent, setConsent] = useState(false);
    const [errors, setErrors] = useState<ValidationErrors>({});
    const [quote, setQuote] = useState<CleaningQuoteResult | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showMoveOutSuccess, setShowMoveOutSuccess] = useState(false);
    const [isCalculatingQuote, setIsCalculatingQuote] = useState(false);

    const isDark = variant === "dark";
    const isMoveOut = form.serviceType === "Move-Out / Heavy Clean";

    // Calculate quote when relevant form fields change (for Standard Cleaning only)
    useEffect(() => {
        if (
            isMoveOut ||
            !form.serviceType ||
            !form.squareFootage ||
            !form.cleaningFrequency
        ) {
            setQuote(null);
            return;
        }

        // Debounce quote calculation
        const timeoutId = setTimeout(async () => {
            setIsCalculatingQuote(true);
            try {
                const supabaseResult = await getQuotePricingFromSupabase(
                    form.serviceType as ServiceType,
                    form.squareFootage as SquareFootageOption,
                    form.cleaningFrequency as CleaningFrequencyOption,
                    form.addOns as AddOnId[]
                );
                const result = convertSupabaseResultToQuoteResult(
                    supabaseResult,
                    form.serviceType as ServiceType,
                    form.cleaningFrequency as CleaningFrequencyOption,
                    form.addOns as AddOnId[]
                );
                setQuote(result);
                // Only call onQuoteCalculated in page mode during real-time calculation
                // In modal mode, onQuoteCalculated is called on submit to trigger transition
                if (onQuoteCalculated && mode === "page") {
                    const cleanInput: CleaningQuoteInput = {
                        firstName: form.firstName,
                        lastName: form.lastName,
                        phone: form.phone,
                        email: form.email,
                        postalCode: form.postalCode,
                        homeType: form.homeType as ServiceHomeType,
                        serviceType: form.serviceType as ServiceType,
                        squareFootage: form.squareFootage as SquareFootageOption,
                        cleaningFrequency: form.cleaningFrequency as CleaningFrequencyOption,
                        addOns: form.addOns as AddOnId[],
                        addOnFrequency: form.addOnFrequency as AddOnFrequencyOption | undefined,
                    };
                    onQuoteCalculated(result, cleanInput);
                }
            } catch (error) {
                console.error("Error calculating quote:", error);
                // Don't show error to user for real-time calculation
                // Only set quote to null so it doesn't show stale data
                setQuote(null);
            } finally {
                setIsCalculatingQuote(false);
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(timeoutId);
    }, [
        form.serviceType,
        form.squareFootage,
        form.cleaningFrequency,
        form.addOns,
        isMoveOut,
        onQuoteCalculated,
    ]);

    const labelClass =
        "block text-xs font-semibold uppercase tracking-wide mb-1 " +
        (isDark ? "text-white/80" : "text-alloy-midnight/70");
    const consentLabelClass =
        "flex items-start gap-2 text-xs " +
        (isDark ? "text-white/85" : "text-alloy-midnight/80");

    const inputBase =
        "w-full rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2";
    const inputClass =
        inputBase +
        (isDark
            ? " border border-white/70 bg-white/10 text-white placeholder-white/70 focus:ring-alloy-juniper focus:border-alloy-juniper"
            : " border border-alloy-stone/80 bg-white focus:ring-alloy-blue focus:border-alloy-blue");
    const selectClass = inputClass;
    const textInputClass = inputClass;
    const checkboxClass =
        (isDark
            ? "mt-0.5 h-4 w-4 rounded border-white/70 bg-transparent"
            : "mt-0.5 h-4 w-4 rounded border-alloy-stone/70") +
        " text-alloy-juniper focus:ring-alloy-juniper";

    const handleChange = <K extends keyof FormState>(field: K, value: FormState[K]) => {
        setForm((prev) => {
            const updated = { ...prev, [field]: value };
            // If service type changes to Move-Out, clear frequency (it's auto-set to One-time)
            // Also clear add-ons and add-on frequency (not used for Move-Out)
            if (field === "serviceType" && value === "Move-Out / Heavy Clean") {
                updated.cleaningFrequency = "";
                updated.addOns = [];
                updated.addOnFrequency = "";
            }
            // If service type changes to Standard, clear Move-Out specific fields
            if (field === "serviceType" && value === "Standard Cleaning") {
                updated.streetAddress = "";
                updated.photos = [];
                updated.preferredServiceDate = "";
            }
            return updated;
        });
        setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    const toggleAddOn = (id: AddOnId) => {
        setForm((prev) => {
            const exists = prev.addOns.includes(id);
            const next = exists ? prev.addOns.filter((a) => a !== id) : [...prev.addOns, id];
            return {
                ...prev,
                addOns: next,
                addOnFrequency: next.length === 0 ? "" : prev.addOnFrequency,
            };
        });
        setErrors((prev) => ({ ...prev, addOnFrequency: undefined }));
    };

    const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);

        // Enforce max 4 photos
        const selectedFiles = files.slice(0, 4);
        if (files.length > 4) {
            setErrors((prev) => ({ ...prev, photos: "Please select no more than 4 photos." }));
        } else {
            setErrors((prev) => ({ ...prev, photos: undefined }));
        }

        // Validate and compress photos
        const MAX_PHOTO_SIZE_BEFORE = 5 * 1024 * 1024; // 5MB before compression
        const MAX_PHOTO_SIZE_AFTER = 3 * 1024 * 1024; // 3MB after compression
        const compressedFiles: File[] = [];

        for (const file of selectedFiles) {
            // Check original size
            if (!validateImageSize(file, MAX_PHOTO_SIZE_BEFORE)) {
                setErrors((prev) => ({
                    ...prev,
                    photos: `Photo "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Please upload photos under 5MB each.`
                }));
                return;
            }

            try {
                // Show compression feedback (optional - could add a loading state here)
                const compressed = await compressImage(file, {
                    maxWidth: 1280,
                    maxHeight: 1280,
                    quality: 0.6,
                    maxSizeBytes: MAX_PHOTO_SIZE_AFTER,
                });

                // Validate compressed size
                if (compressed.size > MAX_PHOTO_SIZE_AFTER) {
                    setErrors((prev) => ({
                        ...prev,
                        photos: `Photo "${file.name}" is still too large after compression (${(compressed.size / 1024 / 1024).toFixed(1)}MB). Please try a different image.`
                    }));
                    return;
                }

                compressedFiles.push(compressed);
            } catch (error) {
                console.error("Failed to compress image:", error);
                setErrors((prev) => ({
                    ...prev,
                    photos: `Failed to process photo "${file.name}". Please try a different image.`
                }));
                return;
            }
        }

        setForm((prev) => ({ ...prev, photos: compressedFiles }));
    };

    const removePhoto = (index: number) => {
        setForm((prev) => ({
            ...prev,
            photos: prev.photos.filter((_, i) => i !== index),
        }));
        setErrors((prev) => ({ ...prev, photos: undefined }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const nextErrors = validate(form);
        if (!consent) {
            nextErrors.consent = "You must agree to receive SMS updates.";
        }

        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            return;
        }

        setIsSubmitting(true);
        try {
            const isMoveOut = form.serviceType === "Move-Out / Heavy Clean";

            // For Move-Out, auto-set frequency to One-time
            const cleaningFrequency = isMoveOut ? "One-time" : (form.cleaningFrequency as CleaningFrequencyOption);

            // Type assertion needed since form allows empty strings but CleaningQuoteInput doesn't
            // Validation ensures these are not empty before submission
            // For Move-Out, clear add-ons and add-on frequency (not used)
            const cleanInput: CleaningQuoteInput = {
                firstName: form.firstName,
                lastName: form.lastName,
                phone: form.phone,
                email: form.email,
                postalCode: form.postalCode,
                homeType: form.homeType as ServiceHomeType,
                serviceType: form.serviceType as ServiceType,
                squareFootage: form.squareFootage as SquareFootageOption,
                cleaningFrequency: cleaningFrequency,
                preferredServiceDate: form.preferredServiceDate?.trim() || undefined,
                addOns: isMoveOut ? [] : form.addOns,
                addOnFrequency: isMoveOut
                    ? undefined
                    : (form.cleaningFrequency === "One-time" && form.addOns.length > 0
                        ? "First cleaning only"
                        : (form.addOnFrequency || undefined)),
            };

            // For Standard Cleaning: Calculate quote and navigate to /book
            if (!isMoveOut) {
                const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";

                if (isStaging) {
                    console.log("[STAGING] Starting quote calculation for submission");
                }

                try {
                    // Wrap Supabase RPC call with timeout (10s)
                    const supabasePromise = getQuotePricingFromSupabase(
                        cleanInput.serviceType,
                        cleanInput.squareFootage,
                        cleaningFrequency,
                        cleanInput.addOns
                    );

                    const timeoutPromise = new Promise<never>((_, reject) => {
                        setTimeout(() => reject(new Error("Quote calculation timeout after 10 seconds")), 10000);
                    });

                    if (isStaging) {
                        console.log("[STAGING] Calling Supabase RPC with params:", {
                            serviceType: cleanInput.serviceType,
                            squareFootage: cleanInput.squareFootage,
                            frequency: cleaningFrequency,
                            addOns: cleanInput.addOns,
                        });
                    }

                    const supabaseResult = await Promise.race([
                        supabasePromise,
                        timeoutPromise,
                    ]);

                    if (isStaging) {
                        console.log("[STAGING] Supabase RPC success:", supabaseResult);
                    }

                    const result = convertSupabaseResultToQuoteResult(
                        supabaseResult,
                        cleanInput.serviceType,
                        cleaningFrequency,
                        cleanInput.addOns
                    );

                    // Store quote in localStorage for /book and /book-v2 pages
                    try {
                        if (isStaging) {
                            console.log("[STAGING] Storing quote to localStorage/sessionStorage", {
                                recurring_price: result.recurring_price,
                                frequency_label: result.frequency_label,
                                discount_label: result.discount_label,
                                price_breakdown: result.price_breakdown
                            });
                        }
                        // Store in multiple keys for compatibility
                        const quoteJson = JSON.stringify(result);
                        localStorage.setItem("cleaning_quote", quoteJson);
                        localStorage.setItem("alloy_quote_v1", quoteJson); // Shared key for /book-v2
                        // Also store in sessionStorage for backward compatibility
                        sessionStorage.setItem("alloy_cleaning_quote", quoteJson);
                        sessionStorage.setItem("cleaning_quote", quoteJson);
                    } catch (e) {
                        console.warn("Failed to store quote:", e);
                    }

                    // Store complete form data for potential resubmission on /payment
                    try {
                        const formDataForStorage = {
                            first_name: cleanInput.firstName,
                            last_name: cleanInput.lastName,
                            phone: cleanInput.phone,
                            email: cleanInput.email,
                            postal_code: cleanInput.postalCode,
                            home_type: cleanInput.homeType,
                            service_type: cleanInput.serviceType,
                            approximate_square_footage: cleanInput.squareFootage,
                            cleaning_frequency: cleaningFrequency,
                            preferred_service_date: cleanInput.preferredServiceDate || undefined,
                            extras_add_ons: isMoveOut ? undefined : (cleanInput.addOns.length > 0 ? JSON.stringify(cleanInput.addOns) : undefined),
                            addons__frequency: isMoveOut
                                ? undefined
                                : (cleanInput.cleaningFrequency === "One-time" && cleanInput.addOns.length > 0
                                    ? "First cleaning only"
                                    : (cleanInput.addOnFrequency || undefined)),
                            street_address: form.streetAddress.trim() || undefined,
                            estimated_price: result.estimated_price ? result.estimated_price.toFixed(2) : undefined,
                        };
                        sessionStorage.setItem("alloy_lead_form_data", JSON.stringify(formDataForStorage));
                        if (isStaging) {
                            console.log("[STAGING] Stored form data:", formDataForStorage);
                        }
                    } catch (e) {
                        console.warn("Failed to store form data in sessionStorage:", e);
                    }

                    // If in modal mode, build booking URL and call onSuccess to close modal and navigate
                    if (mode === "modal") {
                        // Build booking URL with all prefill parameters
                        const bookingUrl = buildBookingUrl({
                            phone: cleanInput.phone,
                            email: cleanInput.email,
                            firstName: cleanInput.firstName,
                            lastName: cleanInput.lastName,
                            estimatedPrice: result.estimated_price ?? undefined,
                        });
                        setIsSubmitting(false);
                        // Call onSuccess with booking URL - modal will close and navigate
                        if (onSuccess) {
                            onSuccess(bookingUrl);
                        }
                        return; // Exit early, modal will handle navigation
                    }

                    // Build booking URL with all prefill parameters to ensure GHL matches existing contact
                    const bookingUrl = buildBookingUrl({
                        phone: cleanInput.phone,
                        email: cleanInput.email,
                        firstName: cleanInput.firstName,
                        lastName: cleanInput.lastName,
                        estimatedPrice: result.estimated_price ?? undefined,
                    });

                    // Navigate to /book page (page mode only)
                    router.push(bookingUrl);
                    return; // Exit early, don't continue with backend submission
                } catch (error) {
                    if (isStaging) {
                        console.error("[STAGING] Error calculating quote:", error);
                        console.error("[STAGING] Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
                    } else {
                        console.error("Error calculating quote for submission:", error);
                    }
                    // If quote calculation fails, show error and stop submission
                    setErrors((prev) => ({
                        ...prev,
                        submit: "Failed to calculate quote. Please try again or contact us directly.",
                    }));
                    setIsSubmitting(false);
                    return;
                }
            }

            // Submit to backend in background (non-blocking)
            const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
            const formData = new FormData();
            formData.append("first_name", cleanInput.firstName);
            formData.append("last_name", cleanInput.lastName);
            formData.append("phone", cleanInput.phone);
            formData.append("email", cleanInput.email);
            formData.append("postal_code", cleanInput.postalCode);
            formData.append("home_type", cleanInput.homeType);
            formData.append("service_type", cleanInput.serviceType);
            formData.append("approximate_square_footage", cleanInput.squareFootage);
            formData.append("cleaning_frequency", cleaningFrequency);
            if (cleanInput.preferredServiceDate) {
                formData.append("preferred_service_date", cleanInput.preferredServiceDate);
            }
            // Only send add-ons for Standard Cleaning (not Move-Out)
            if (!isMoveOut && cleanInput.addOns.length > 0) {
                formData.append("extras_add_ons", JSON.stringify(cleanInput.addOns));
            }
            if (!isMoveOut && cleanInput.addOns.length > 0) {
                // For one-time cleaning, set to "First cleaning only"; otherwise use selected value
                const addonFreq = cleanInput.cleaningFrequency === "One-time"
                    ? "First cleaning only"
                    : cleanInput.addOnFrequency;
                if (addonFreq) {
                    formData.append("addons__frequency", addonFreq);
                }
            }
            if (form.streetAddress.trim()) {
                formData.append("street_address", form.streetAddress.trim());
            }
            // Append photos (if any)
            form.photos.forEach((photo) => {
                formData.append("photos", photo);
            });

            // Fire-and-forget backend call with timeout guard
            const submitPromise = fetch(`${apiBaseUrl}/leads/cleaning`, {
                method: "POST",
                body: formData,
            });

            // Set timeout guard (3 seconds)
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error("timeout")), 3000);
            });

            Promise.race([submitPromise, timeoutPromise])
                .then(async (response) => {
                    if (response instanceof Response) {
                        const backendResult = await response.json();
                        console.log("Backend lead submission result:", backendResult);

                        // Handle errors
                        if (!response.ok || (backendResult.ok === false)) {
                            console.warn("Backend submission warning:", backendResult.message || "Unknown error");
                            return;
                        }

                        // Persist contact_id to booking prefill storage if available
                        // This is the PRIMARY identifier for contact resolution
                        if (backendResult.contact_id) {
                            try {
                                const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";
                                const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
                                
                                if (isStaging) {
                                    console.log("[STAGING DEBUG] CleaningQuoteForm: Writing session data", {
                                        api_base_url: apiBaseUrl,
                                        contact_id: backendResult.contact_id,
                                        storage_key: "alloy_booking_prefill"
                                    });
                                }
                                
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
                                prefillData.phone = form.phone;
                                prefillData.email = form.email;
                                prefillData.first_name = form.firstName;
                                prefillData.last_name = form.lastName;

                                // Store in both sessionStorage and localStorage for persistence
                                const jsonData = JSON.stringify(prefillData);
                                sessionStorage.setItem("alloy_booking_prefill", jsonData);
                                localStorage.setItem("alloy_booking_prefill", jsonData);

                                if (isStaging) {
                                    console.log("[STAGING DEBUG] CleaningQuoteForm: Session data written successfully", {
                                        storage_key: "alloy_booking_prefill",
                                        has_session_storage: typeof sessionStorage !== "undefined",
                                        has_local_storage: typeof localStorage !== "undefined",
                                        data_keys: Object.keys(prefillData)
                                    });
                                }

                                console.log("Lead submission: Stored ghl_contact_id as primary identifier", {
                                    ghl_contact_id: backendResult.contact_id,
                                    phone: form.phone,
                                    email: form.email
                                });
                            } catch (e) {
                                const isStaging = process.env.NEXT_PUBLIC_APP_ENV === "staging";
                                if (isStaging) {
                                    console.error("[STAGING DEBUG] CleaningQuoteForm: Failed to write session data", {
                                        error: String(e),
                                        storage_key: "alloy_booking_prefill"
                                    });
                                }
                                console.warn("Failed to persist contact_id:", e);
                            }
                        }

                        // If booking_url is provided, redirect to it
                        if (backendResult.booking_url) {
                            try {
                                const targetPath = new URL(backendResult.booking_url).pathname;
                                console.log("Redirecting to booking URL (pathname only):", targetPath);
                                router.push(targetPath);
                            } catch (e) {
                                console.warn("Invalid booking_url, falling back to /payment", backendResult.booking_url);
                                router.push("/payment");
                            }
                            return;
                        }

                        // Fallback: Handle Move-Out with success message
                        if (isMoveOut) {
                            setShowMoveOutSuccess(true);
                            // Call onSuccess callback if provided (e.g., to close modal)
                            if (onSuccess) {
                                onSuccess();
                            }
                            setTimeout(() => {
                                router.push("/");
                            }, REDIRECT_DELAY_MS);
                        }
                    }
                })
                .catch((error) => {
                    if (error.message === "timeout") {
                        // Timeout - backend is slow (cold start), but continue anyway
                        console.log("Backend submission taking longer than expected, continuing...");
                        // Fallback: Handle Move-Out with success message
                        if (isMoveOut) {
                            setShowMoveOutSuccess(true);
                            // Call onSuccess callback if provided (e.g., to close modal)
                            if (onSuccess) {
                                onSuccess();
                            }
                            setTimeout(() => {
                                router.push("/");
                            }, REDIRECT_DELAY_MS);
                        }
                    } else {
                        console.warn("Backend submission error (non-blocking):", error);
                    }
                });
        } catch (error) {
            console.error("Error submitting lead:", error);
            setErrors((prev) => ({ ...prev, submit: (error as Error).message }));
        } finally {
            setIsSubmitting(false);
        }
    };

    const hasReadyQuote =
        quote &&
        quote.status === "ready" &&
        typeof quote.first_clean_price === "number" &&
        quote.first_clean_price > 0;

    // If Move-Out success, only show thank-you message
    if (showMoveOutSuccess) {
        return (
            <div className="space-y-4">
                <div className="rounded-lg border border-alloy-juniper/30 bg-alloy-juniper/10 p-6 text-center">
                    <p className="text-lg font-semibold text-alloy-midnight mb-2">
                        Thanks — your inquiry has been submitted.
                    </p>
                    <p className="text-sm text-alloy-midnight/80 mb-4">
                        Our team will review and reach out shortly with an estimate.
                    </p>
                    <p className="text-xs text-alloy-midnight/60">
                        Redirecting to homepage...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* First Name */}
                    <div>
                        <label className={labelClass}>
                            First Name<span className="text-alloy-ember ml-0.5">*</span>
                        </label>
                        <input
                            type="text"
                            value={form.firstName}
                            onChange={(e) => handleChange("firstName", e.target.value)}
                            className={textInputClass}
                        />
                        {errors.firstName && (
                            <p className="mt-1 text-xs text-alloy-ember">{errors.firstName}</p>
                        )}
                    </div>

                    {/* Last Name */}
                    <div>
                        <label className={labelClass}>
                            Last Name<span className="text-alloy-ember ml-0.5">*</span>
                        </label>
                        <input
                            type="text"
                            value={form.lastName}
                            onChange={(e) => handleChange("lastName", e.target.value)}
                            className={textInputClass}
                        />
                        {errors.lastName && (
                            <p className="mt-1 text-xs text-alloy-ember">{errors.lastName}</p>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Phone */}
                    <div>
                        <label className={labelClass}>
                            Phone<span className="text-alloy-ember ml-0.5">*</span>
                        </label>
                        <input
                            type="tel"
                            value={form.phone}
                            onChange={(e) => handleChange("phone", e.target.value)}
                            className={textInputClass}
                        />
                        {errors.phone && <p className="mt-1 text-xs text-alloy-ember">{errors.phone}</p>}
                    </div>

                    {/* Email */}
                    <div>
                        <label className={labelClass}>
                            Email<span className="text-alloy-ember ml-0.5">*</span>
                        </label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={(e) => handleChange("email", e.target.value)}
                            className={textInputClass}
                        />
                        {errors.email && <p className="mt-1 text-xs text-alloy-ember">{errors.email}</p>}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Postal Code */}
                    <div>
                        <label className={labelClass}>
                            Postal Code<span className="text-alloy-ember ml-0.5">*</span>
                        </label>
                        <input
                            type="text"
                            value={form.postalCode}
                            onChange={(e) => handleChange("postalCode", e.target.value)}
                            className={textInputClass}
                        />
                        {errors.postalCode && (
                            <p className="mt-1 text-xs text-alloy-ember">{errors.postalCode}</p>
                        )}
                    </div>

                    {/* Home Type */}
                    <div>
                        <label className={labelClass}>
                            Home Type<span className="text-alloy-ember ml-0.5">*</span>
                        </label>
                        <select
                            value={form.homeType}
                            onChange={(e) => handleChange("homeType", e.target.value as ServiceHomeType)}
                            className={selectClass}
                        >
                            <option value="">Select an option</option>
                            <option value="Apartment / Condo">Apartment / Condo</option>
                            <option value="Single-Family Home">Single-Family Home</option>
                            <option value="Townhome">Townhome</option>
                            <option value="Other">Other</option>
                        </select>
                        {errors.homeType && (
                            <p className="mt-1 text-xs text-alloy-ember">{errors.homeType}</p>
                        )}
                    </div>
                </div>

                {/* Service Type & Square Footage */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>
                            Service Type<span className="text-alloy-ember ml-0.5">*</span>
                        </label>
                        <select
                            value={form.serviceType}
                            onChange={(e) => handleChange("serviceType", e.target.value as ServiceType)}
                            className={selectClass}
                        >
                            <option value="">Select a service</option>
                            <option value="Standard Cleaning">Standard Cleaning</option>
                            <option value="Move-Out / Heavy Clean">Move-Out / Heavy Clean</option>
                        </select>
                        {errors.serviceType && (
                            <p className="mt-1 text-xs text-alloy-ember">{errors.serviceType}</p>
                        )}
                    </div>

                    <div>
                        <label className={labelClass}>
                            Approximate Square Footage<span className="text-alloy-ember ml-0.5">*</span>
                        </label>
                        <select
                            value={form.squareFootage}
                            onChange={(e) =>
                                handleChange("squareFootage", e.target.value as SquareFootageOption)
                            }
                            className={selectClass}
                        >
                            <option value="">Select an option</option>
                            <option value="Under 1500 sq ft">Under 1500 sq ft</option>
                            <option value="1501–2,000 sq ft">1501–2,000 sq ft</option>
                            <option value="2,001-2,600 sq ft">2,001-2,600 sq ft</option>
                            <option value="2,601-3,200 sq ft">2,601-3,200 sq ft</option>
                            <option value="3,201-4,000 sq ft">3,201-4,000 sq ft</option>
                            <option value="4,001-5,500 sq ft">4,0001-5,500 sq ft</option>
                            <option value="Over 5,500 sq ft">Over 5,500 sq ft</option>
                        </select>
                        {errors.squareFootage && (
                            <p className="mt-1 text-xs text-alloy-ember">{errors.squareFootage}</p>
                        )}
                    </div>
                </div>

                {/* Cleaning Frequency - only for Standard Cleaning */}
                {!isMoveOut && (
                    <div>
                        <label className={labelClass}>
                            Cleaning Frequency<span className="text-alloy-ember ml-0.5">*</span>
                        </label>
                        <select
                            value={form.cleaningFrequency}
                            onChange={(e) =>
                                handleChange("cleaningFrequency", e.target.value as CleaningFrequencyOption)
                            }
                            className={selectClass}
                        >
                            <option value="">Select a frequency</option>
                            <option value="One-time">One-time</option>
                            <option value="Weekly (30% Off)">Weekly (30% Off)</option>
                            <option value="Bi-Weekly (20% Off)">Bi-Weekly (20% Off)</option>
                            <option value="Monthly (10% Off)">Monthly (10% Off)</option>
                        </select>
                        {errors.cleaningFrequency && (
                            <p className="mt-1 text-xs text-alloy-ember">{errors.cleaningFrequency}</p>
                        )}
                    </div>
                )}

                {/* Move-Out / Heavy Clean specific fields */}
                {isMoveOut && (
                    <>
                        {/* Preferred Service Date */}
                        <div>
                            <label className={labelClass}>
                                Preferred Service Date<span className="text-alloy-ember ml-0.5">*</span>
                            </label>
                            <input
                                type="date"
                                value={form.preferredServiceDate || ""}
                                onChange={(e) => handleChange("preferredServiceDate", e.target.value)}
                                className={textInputClass}
                            />
                            {errors.preferredServiceDate && (
                                <p className="mt-1 text-xs text-alloy-ember">{errors.preferredServiceDate}</p>
                            )}
                        </div>

                        {/* Street Address */}
                        <div>
                            <label className={labelClass}>
                                Street Address<span className="text-alloy-ember ml-0.5">*</span>
                            </label>
                            <input
                                type="text"
                                value={form.streetAddress}
                                onChange={(e) => handleChange("streetAddress", e.target.value)}
                                placeholder="123 Main St"
                                className={textInputClass}
                            />
                            {errors.streetAddress && (
                                <p className="mt-1 text-xs text-alloy-ember">{errors.streetAddress}</p>
                            )}
                        </div>

                        {/* Photos Upload */}
                        <div>
                            <label className={labelClass}>
                                Photos<span className="text-alloy-ember ml-0.5">*</span>
                            </label>
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handlePhotoChange}
                                className={textInputClass}
                            />
                            <p className={`mt-1 text-sm ${isDark ? "text-white/80" : "text-alloy-midnight/70"}`}>
                                Please submit at least 4 photos showcasing different areas of your home. At a minimum include images of your Kitchen, Master Bedroom & Bath, Living Room.
                            </p>
                            {errors.photos && (
                                <p className="mt-1 text-xs text-alloy-ember">{errors.photos}</p>
                            )}

                            {/* Display selected photos */}
                            {form.photos.length > 0 && (
                                <div className="mt-2 space-y-2">
                                    <p className="text-xs text-alloy-midnight/70">
                                        Selected: {form.photos.length} photo{form.photos.length !== 1 ? "s" : ""}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {form.photos.map((photo, index) => (
                                            <div
                                                key={index}
                                                className="relative inline-flex items-center gap-1 bg-alloy-stone/40 rounded px-2 py-1 text-xs"
                                            >
                                                <span className="truncate max-w-[120px]">{photo.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removePhoto(index)}
                                                    className="text-alloy-ember hover:text-alloy-ember/80"
                                                    aria-label="Remove photo"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Add-ons - only for Standard Cleaning */}
                {!isMoveOut && (
                    <>
                        <div>
                            <label className={labelClass}>
                                Add-ons
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {(["Fridge", "Oven", "Cabinets", "Windows & Blinds", "Pet Hair", "Baseboards"] as AddOnId[]).map(
                                    (id) => {
                                        const checked = form.addOns.includes(id);
                                        return (
                                            <label
                                                key={id}
                                                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors ${checked
                                                    ? "border-alloy-juniper bg-alloy-stone/20"
                                                    : "border-alloy-stone/50 hover:border-alloy-juniper/60"
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleAddOn(id)}
                                                    className={checkboxClass}
                                                />
                                                <span className={isDark ? "text-white" : "text-alloy-midnight"}>{id}</span>
                                            </label>
                                        );
                                    },
                                )}
                            </div>
                        </div>

                        {/* Add-on Frequency – only when add-ons selected AND not One-time */}
                        {form.addOns.length > 0 && form.cleaningFrequency !== "One-time" && (
                            <div>
                                <label className={labelClass}>
                                    Add-ons Frequency<span className="text-alloy-ember ml-0.5">*</span>
                                </label>
                                <select
                                    value={form.addOnFrequency}
                                    onChange={(e) =>
                                        handleChange("addOnFrequency", e.target.value as AddOnFrequencyOption | "")
                                    }
                                    className={selectClass}
                                >
                                    <option value="">Select an option</option>
                                    <option value="First cleaning only">First cleaning only</option>
                                    <option value="Every cleaning">Every cleaning</option>
                                    <option value="Not sure yet - let's decide later">
                                        Not sure yet - let's decide later
                                    </option>
                                </select>
                                {errors.addOnFrequency && (
                                    <p className="mt-1 text-xs text-alloy-ember">{errors.addOnFrequency}</p>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* Consent */}
                <div className="pt-1">
                    <label className={consentLabelClass}>
                        <input
                            type="checkbox"
                            checked={consent}
                            onChange={(e) => {
                                setConsent(e.target.checked);
                                setErrors((prev) => ({ ...prev, consent: undefined }));
                            }}
                            className={checkboxClass}
                        />
                        <span>
                            By providing my phone number, I agree to receive SMS messages from Alloy regarding my
                            quote, appointment updates, and service notifications. Reply <strong>STOP</strong> to
                            unsubscribe.
                        </span>
                    </label>
                    {errors.consent && (
                        <p className="mt-1 text-xs text-alloy-ember">{errors.consent}</p>
                    )}
                </div>

                {/* Submit Error */}
                {errors.submit && (
                    <div className="rounded-md bg-alloy-ember/10 border border-alloy-ember/30 p-3">
                        <p className="text-sm text-alloy-ember">{errors.submit}</p>
                    </div>
                )}

                {/* Submit */}
                <div className="pt-2">
                    {isDark ? (
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full md:w-auto bg-white text-alloy-blue hover:bg-white/90 hover:shadow-lg font-semibold px-6 py-3 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? "Submitting…" : "Get my quote"}
                        </button>
                    ) : (
                        <div className="flex justify-center">
                            <PrimaryButton type="submit" className="w-full md:w-auto" disabled={isSubmitting}>
                                {isSubmitting ? "Submitting…" : "Get my quote"}
                            </PrimaryButton>
                        </div>
                    )}
                </div>
            </form>

        </div>
    );
}


