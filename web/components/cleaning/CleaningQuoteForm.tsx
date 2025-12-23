"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    calculateCleaningQuote,
    type CleaningQuoteInput,
    type CleaningQuoteResult,
    type ServiceType,
    type CleaningFrequencyOption,
    type SquareFootageOption,
    type AddOnId,
    type AddOnFrequencyOption,
    type ServiceHomeType,
} from "@/lib/pricing/cleaningPricing";
import PrimaryButton from "@/components/PrimaryButton";

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
        }
    }

    // Add-ons frequency only required if add-ons are selected
    if (form.addOns.length > 0 && !form.addOnFrequency) {
        errors.addOnFrequency = "Please select how often you want add-ons.";
    }

    return errors;
}

interface CleaningQuoteFormProps {
    onQuoteCalculated?: (quote: CleaningQuoteResult, input: CleaningQuoteInput) => void;
    variant?: "light" | "dark";
}

export default function CleaningQuoteForm({
    onQuoteCalculated,
    variant = "light",
}: CleaningQuoteFormProps) {
    const router = useRouter();
    const [form, setForm] = useState<FormState>(INITIAL_FORM);
    const [consent, setConsent] = useState(false);
    const [errors, setErrors] = useState<ValidationErrors>({});
    const [quote, setQuote] = useState<CleaningQuoteResult | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showMoveOutSuccess, setShowMoveOutSuccess] = useState(false);

    const isDark = variant === "dark";

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
            if (field === "serviceType" && value === "Move-Out / Heavy Clean") {
                updated.cleaningFrequency = "";
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

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setForm((prev) => ({ ...prev, photos: files }));
        setErrors((prev) => ({ ...prev, photos: undefined }));
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
                addOns: form.addOns,
                addOnFrequency: form.addOnFrequency || undefined,
            };

            // For Standard Cleaning: Calculate quote immediately and show it
            if (!isMoveOut) {
                const result = calculateCleaningQuote(cleanInput);

                // Store quote in sessionStorage for /book page
                try {
                    sessionStorage.setItem("alloy_cleaning_quote", JSON.stringify(result));
                } catch (e) {
                    console.warn("Failed to store quote in sessionStorage:", e);
                }

                // Normalize phone for URL (ensure +1 format)
                let normalizedPhone = cleanInput.phone.trim();
                const digits = normalizedPhone.replace(/\D/g, "");
                if (digits.length === 10) {
                    normalizedPhone = "+1" + digits;
                } else if (!normalizedPhone.startsWith("+")) {
                    normalizedPhone = "+" + digits;
                }

                // Redirect to booking page immediately (don't wait for backend)
                router.push(`/book?phone=${encodeURIComponent(normalizedPhone)}`);
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
            if (cleanInput.addOns.length > 0) {
                formData.append("extras_add_ons", JSON.stringify(cleanInput.addOns));
            }
            if (cleanInput.addOnFrequency) {
                formData.append("addons__frequency", cleanInput.addOnFrequency);
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

                        // Only handle errors, success is already handled
                        if (!response.ok || (backendResult.ok === false)) {
                            console.warn("Backend submission warning:", backendResult.message || "Unknown error");
                        }
                    }
                })
                .catch((error) => {
                    if (error.message === "timeout") {
                        // Timeout - backend is slow (cold start), but continue anyway
                        console.log("Backend submission taking longer than expected, continuing...");
                    } else {
                        console.warn("Backend submission error (non-blocking):", error);
                    }
                });

            // Handle Move-Out: Show success message and redirect
            if (isMoveOut) {
                setShowMoveOutSuccess(true);
                setTimeout(() => {
                    router.push("/");
                }, 2000);
            }
        } catch (error) {
            console.error("Error submitting lead:", error);
            setErrors((prev) => ({ ...prev, submit: (error as Error).message }));
        } finally {
            setIsSubmitting(false);
        }
    };

    const isMoveOut = form.serviceType === "Move-Out / Heavy Clean";

    const hasReadyQuote =
        quote &&
        quote.status === "ready" &&
        typeof quote.first_clean_price === "number" &&
        quote.first_clean_price > 0;

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
                            <option value="4,0001-5,500 sq ft">4,0001-5,500 sq ft</option>
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
                            <option value="Weekly (40% Off)">Weekly (40% Off)</option>
                            <option value="Bi-Weekly (30% Off)">Bi-Weekly (30% Off)</option>
                            <option value="Monthly (20% Off)">Monthly (20% Off)</option>
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

                {/* Add-ons */}
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

                {/* Add-on Frequency – only when add-ons selected */}
                {form.addOns.length > 0 && (
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
                            <option value="Not sure yet - let’s decide later">
                                Not sure yet - let’s decide later
                            </option>
                        </select>
                        {errors.addOnFrequency && (
                            <p className="mt-1 text-xs text-alloy-ember">{errors.addOnFrequency}</p>
                        )}
                    </div>
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
                        <PrimaryButton type="submit" className="w-full md:w-auto" disabled={isSubmitting}>
                            {isSubmitting ? "Submitting…" : "Get my quote"}
                        </PrimaryButton>
                    )}
                </div>
            </form>

            {/* Quote summary (local, instant) - condensed layout */}
            {quote && (
                <div className="mt-4 rounded-xl border border-alloy-stone/30 bg-white p-3 md:p-4 shadow-sm">
                    {hasReadyQuote && quote.first_clean_price != null && quote.first_clean_price > 0 ? (
                        <div className="space-y-2.5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {/* First Cleaning */}
                                <div className="rounded-lg border border-alloy-stone/40 bg-alloy-stone/20 px-3 py-2.5 min-h-[80px] flex flex-col justify-center">
                                    <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-1">
                                        First Cleaning
                                    </p>
                                    <p className="text-2xl md:text-3xl font-bold text-alloy-blue leading-tight">
                                        ${quote.first_clean_price.toFixed(2)}
                                    </p>
                                </div>

                                {/* Recurring (if any) */}
                                {quote.recurring_price != null && quote.recurring_price > 0 && quote.frequency_label ? (
                                    <div className="rounded-lg border border-alloy-stone/40 bg-white px-3 py-2.5 min-h-[80px] flex flex-col justify-center">
                                        <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-1">
                                            {quote.frequency_label} Cleaning
                                            {quote.discount_label && (
                                                <span className="normal-case text-[11px] text-alloy-midnight/70 ml-1">
                                                    ({quote.discount_label})
                                                </span>
                                            )}
                                        </p>
                                        <div className="flex items-baseline gap-1">
                                            <p className="text-2xl md:text-3xl font-bold text-alloy-juniper leading-tight">
                                                ${quote.recurring_price.toFixed(2)}
                                            </p>
                                            <span className="text-[11px] text-alloy-midnight/60">per visit</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-alloy-stone/40 bg-white px-3 py-2.5 min-h-[80px] flex flex-col justify-center">
                                        <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-1">
                                            Recurring Cleaning
                                        </p>
                                        <p className="text-sm text-alloy-midnight/70">One-time service</p>
                                    </div>
                                )}
                            </div>

                            {/* Add-ons list (compact) */}
                            {quote.addons && quote.addons.length > 0 && (
                                <div className="pt-1 border-t border-alloy-stone/20">
                                    <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-1.5">
                                        Add-ons
                                    </p>
                                    <div className="space-y-1">
                                        {quote.addons.map((addon, idx) => (
                                            <div
                                                key={idx}
                                                className="flex justify-between items-center text-sm text-alloy-midnight/85"
                                            >
                                                <span>{addon.name}</span>
                                                <span className="font-medium">
                                                    {addon.price != null && addon.price > 0
                                                        ? `$${addon.price.toFixed(2)}`
                                                        : "Included in quote"}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Breakdown link */}
                            {quote.price_breakdown && (
                                <details className="mt-1">
                                    <summary className="text-xs text-alloy-midnight/70 cursor-pointer hover:text-alloy-midnight">
                                        See full price breakdown
                                    </summary>
                                    <pre className="mt-1.5 whitespace-pre-line text-xs text-alloy-midnight/80 leading-relaxed">
                                        {quote.price_breakdown}
                                    </pre>
                                </details>
                            )}

                            {/* Continue to booking CTA */}
                            {form.phone && (
                                <div className="pt-2 border-t border-alloy-stone/20">
                                    <PrimaryButton
                                        onClick={() => {
                                            const phoneParam = encodeURIComponent(form.phone.trim());
                                            router.push(`/book?phone=${phoneParam}`);
                                        }}
                                        className="w-full md:w-auto"
                                    >
                                        Continue to booking
                                    </PrimaryButton>
                                </div>
                            )}
                        </div>
                    ) : quote.status === "pending" ? (
                        <div className="py-3">
                            <p className="text-sm font-medium text-alloy-midnight">
                                Generating your quote…
                            </p>
                            <p className="text-xs text-alloy-midnight/70 mt-1">
                                Please wait a moment while we calculate your pricing.
                            </p>
                        </div>
                    ) : (
                        <div className="py-3">
                            <p className="text-sm font-medium text-alloy-midnight">
                                We&apos;re reviewing your details and will confirm your quote shortly.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Move-Out success message */}
            {showMoveOutSuccess && (
                <div className="mt-4 rounded-lg border border-alloy-juniper/30 bg-alloy-juniper/10 p-6 text-center">
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
            )}
        </div>
    );
}


