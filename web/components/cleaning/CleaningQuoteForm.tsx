"use client";

import { useState } from "react";
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

type FormState = CleaningQuoteInput;

type ValidationErrors = Partial<Record<keyof FormState | "consent", string>>;

const INITIAL_FORM: FormState = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  postalCode: "",
  homeType: "Single-Family Home",
  serviceType: "Standard Cleaning",
  squareFootage: "Under 1500 sq ft",
  cleaningFrequency: "One-time",
  preferredServiceDate: "",
  addOns: [],
  addOnFrequency: "",
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
  } else if (!/^[^@\s]+@\S+\.\S+$/.test(form.email.trim())) {
    errors.email = "Please enter a valid email address.";
  }

  if (!form.postalCode.trim()) {
    errors.postalCode = "Please enter your postal code.";
  }

  if (!form.homeType) errors.homeType = "Home type is required.";
  if (!form.serviceType) errors.serviceType = "Service type is required.";
  if (!form.squareFootage) errors squareFootage = "Approximate size is required.";
  if (!form.cleaningFrequency)
    errors.cleaningFrequency = "Cleaning frequency is required.";

  if (form.serviceType === "Move-Out / Heavy Clean" && !form.preferredServiceDate?.trim()) {
    errors.preferredServiceDate = "Please provide a preferred service date.";
  }

  if (form.addOns.length > 0 && !form.addOnFrequency) {
    errors.addOnFrequency = "Please select how often you want add-ons.";
  }

  return errors;
}

interface CleaningQuoteFormProps {
  onQuoteCalculated?: (quote: CleaningQuoteResult, input: CleaningQuoteInput) => void;
}

export default function CleaningQuoteForm({ onQuoteCalculated }: CleaningQuoteFormProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [quote, setQuote] = useState<CleaningQuoteResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const toggleAddOn = (id: AddOnId) => {
    setForm((prev) => {
      const exists = prev.addOns.includes(id);
      const next = exists ? prev.addOns.conჍce(a) => a !== id) : [...prev.addOns, id];
      return {
        ...prev,
        addOns: next,
        addOnFrequency: next.length === 0 ? "" : prev.addOnFrequency,
      };
    });
    setErrors((prev) => ({ ...prev, addOnFrequency: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
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
      const cleanInput: CleaningQuoteInput = {
        ...form,
        preferredServiceDate: form.preferredServiceDate?.trim() || undefined,
        addOnFrequency: form.addOnFrequency || (undefined as AddOnFrequencyOption | undefined),
      };

      const result = calculateCleaningQuote(cleanInput);
      setQuote(result);
      onQuoteCalculated?.(result, cleanInput);

      // TODO(Phase 2): POST cleanInput + result to backend `/leads/cleaning` for logging / storage.
      // TODO(Phase 3): Backend should upsert contact + create/update GHL opportunity + store pricing.
    } finally {
      setIsSubmitting(false);
    }
  };

  const isMoveOut = form.serviceType === "Move-Out / Heavy Clean";

  return (
    <div className="space-y-4">
      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* First Name */}
          <div>
            <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">
              First Name<span className="text-alloy-ember ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={form.firstName}
              onChange={(e) => handleChange("firstName", e.target.value)}
              className="w-full rounded-md border border-alloy-stone/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-alloy-blue bg-white"
            />
            {errors.firstName && (
              <p className="mt-1 text-xs text-alloy-ember">{errors.firstName}</p>
            )}
          </div>

          {/* Last Name */}
          <div>
            <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">
              Last Name<span className="text-alloy-ember ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={form.lastName}
              onChange={(e) => handleChange("lastName", e.target.value)}
              className="w-full rounded-md border border-alloy-stone/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-alloy-blue bg-white"
            />
            {errors.lastName && (
              <p className="mt-1 text-xs text-alloy-ember">{errors.lastName}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">
              Phone<span className="text-alloy-ember ml-0.5">*</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              className="w-full rounded-md border border-alloy-stone/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloy-blue focus:border-alloy-blue bg-white"
            />
            {errors.phone && <p className="mt-1 text-xs text-alloy-ember">{errors.phone}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">
              Email<span className="text-alloy-ember ml-0.5">*</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              className="w-full rounded-md border border-alloy-stone/60 px-3 py-2 text-sm bg-white"
            />
            {errors.email && <p className="mt-1 text-xs text-alloy-ember">{errors.email}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Postal Code */}
          <div>
            <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">
              Postal Code<span className="text-alloy-ember ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={form.postalCode}
              onChange={(e) => handleChange("postalCode", e.target.value)}
              className="w-full rounded-md border	border-alloy-stone/60 px-3 py-2 text-sm bg-white"
            />
            {errors.postalCode && (
              <p className="mt-1 text-xs text-alloy-ember">{errors.postalCode}</p>
            )}
          </div>

          {/* Home Type */}
          <div>
            <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">
              Home Type<span className="text-alloy-ember ml-0.5">*</span>
            </label>
            <select
              value={form.homeType}
              onChange={(e) => handleChange("homeType", e.target.value as ServiceHomeType)}
              className="w-full rounded-md border border-alloy-stone/60 px-3 py-2 text-sm bg-white"
            >
              <option value="">Select an option</option>
              <option value="Apartment / Condo">Apartment / Condo</option>
              <option value="Single-Family Home">Single-Family Home</option>
              <option value="Townhome">Townhome</option>
              <option value="Other">Other</option>
            </select>
            {errors.homeType && (
              <p className="mt-1 text-xs text-alloy-midnight/70">{errors.homeType}</p>
            )}
          </div>
        </div>

        {/* Service Type & Square Footage */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">
              Service Type<span className="text-alloy-ember ml-0.5">*</span>
            </label>
            <select
              value={form.serviceType}
              onChange={(e) => handleChange("serviceType", e.target.value as ServiceType)}
              className="w-full rounded-md border border-alloy-stone/60 px-3 py-2 text-sm bg white"
            >
              <option value="">Select a service</option>
              <option value="Standard Cleaning">Standard Cleaning</option>
              <option value="Move-Out / Heavy Clean">Move-Out / Heavy Clean</option>
            </select>
            {errors.serviceType && (
              <p className="mt-1 text-xs text-alloy-midnight/70">{errors.serviceType}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">
              Approximate Square Footage<span className="text-alloy-ember ml-0.5">*</span>
            </label>
            <select
              value={form.squareFootage}
              onChange={(e) =>
                handleChange("squareFootage", e.target.value as SquareFootageOption)
              }
              className="w-full rounded-md border border-alloy-stone/60 px-3 py-2 text-sm bg white"
            >
              <option value="">Select an option</option>
              <option value="Under 1500 sq ft">Under 1500 sq ft</option>
              <option value="1501–2,000 sq ft">1501–2,000 sq ft</option>
              <option value="2,001-2,600 sq ft">2,001-2,600 sq ft</option>
              <option value="2,601-3,200 sq ft">2,601-3,200 sq ft</option>
              <option value="3,201-4,000 sq ft">3,201-4,000 sq ft</option>
              <option value="4,0001-5,500 sq ft">4,0001-5,500 sq ft</option>
            </select>
            {errors.squareFootage && (
              <p className="mt-1 text-xs text-alloy-ember">{errors.squareFootage}</p>
            )}
          </div>
        </div>

        {/* Cleaning Frequency */}
        <div>
          <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">
            Cleaning Frequency<span className="text-alloy-ember ml-0.5">*</span>
          </label>
          <select
            value={form.cleaningFrequency}
            onChange={(e) =>
              handleChange("cleaningFrequency", e.target.value as CleaningFrequencyOption)
            }
            className="w-full rounded-md border border-alloy-stone/60 px-3 py-2 text-sm bg-white"
          >
            <option value="">Select a frequency</option>
            <option value="One-time">One-time</option>
            <option value="Weekly (15% Off)">Weekly (15% Off)</option>
            <option value="Bi-Weekly (10% Off)">Bi-Weekly (10% Off)</option>
            <option value="Monthly (5% Off)">Monthly (5% Off)</option>
          </select>
          {errors.cleaningFrequency && (
            <p className="mt-1 text-xs text-alloy-ember">{errors.cleaningFrequency}</p>
          )}
        </div>

        {/* Preferred Service Date – only for Move-Out / Heavy Clean */}
        {isMoveOut && (
          <div>
            <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">
              Preferred Service Date<span className="text-alloy-ember ml-0.5">*</span>
            </label>
            <input
              type="date"
              value={form.preferredServiceDate || ""}
              onChange={(e) => handleChange("preferredServiceDate", e.target.value)}
              className="w-full rounded-md border border-alloy-stone/60 px-3 py-2 text-sm bg-white"
            />
            {errors.preferredServiceDate && (
              <p className="mt-1 text-xs text-alloy-ember">{errors.preferredэвэр}</p>
            )}
          </div>
        )}

        {/* Add-ons */}
        <div>
          <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">
            Add-ons
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(["Fridge", "Oven", "Cabinets", "Windows & Blinds", "Pet Hair", "Baseboards"] as AddOnId[]).map(
              (id) => {
                const checked = form.addOns.includes(id);
                return (
                  <label
                    key={id}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors ${
                      checked
                        ? "border-alloy-juniper bg-alloy-stone/20"
                        : "border-alloy-stone/50 hover:border-alloy-juniper/60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAddOn(id)}
                      className="h-4 w-4 rounded border-alloy-stone/60 text-alloy-juniper focus:ring-alloy-juniper"
                    />
                    <span className="text-alloy-midnight">{id}</span>
                  </label>
                );
              },
            )}
          </div>
        </div>

        {/* Add-on Frequency – only when add-ons selected */}
        {form.addOns.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">
              Add-ons Frequency<span className="text-alloy-ember ml-0.5">*</span>
            </label>
            <select
              value={form.addOnFrequency}
              onChange={(e) =>
                handleChange("addOnFrequency", e.target.value as AddOnFrequencyOption | "")
              }
              className="w-full rounded-md border border-alloy-stone/60 px-3 py-2 text-sm bg-white"
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
          <label className="flex items-start gap-2 text-xs text-alloy-midnight/80">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setErrors((prev) => ({ ...prev, consent: undefined }));
              }}
              className="mt-0.5 h-4 w-4 rounded border-alloy-stone/60 text-alloy-juniper focus:ring-alloy-juniper"
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

        {/* Submit */}
        <div className="pt-2">
          <PrimaryButton type="submit" className="w-full md:w-auto" disabled={isSubmitting}>
            {isSubmitting ? "Calculating…" : "Get my quote"}
          </PrimaryButton>
        </div>
      </form>

      {/* Quote summary (local, instant) */}
      {quote && (
        <div className="mt-4 rounded-xl border border-alloy-stone/30 bg-white p-4 shadow-sm">
          {quote.status === "ready" && quote.first_clean_price != null ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* First cleaning or one-time */}
                <div className="rounded-lg border border-alloy-stone/40 bg-alloy-stone/20 px-3 py-3">
                  <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-1">
                    {quote.recurring_price ? "First cleaning" : "One-time cleaning"}
                  </p>
                  <p className="text-2xl font-bold text-alloy-blue">
                    ${quote.first_clean_price.toFixed(2)}
                  </p>
                </div>

                {/* Recurring (if any) */}
                {quote.recurring_price != null && quote.frequency_label && (
                  <div className="rounded-lg border border-alloy-stone/40 bg-white px-3 py-3">
                    <p className="text-xs fontsemibold text-alloy-midnight/60 uppercase tracking-wide mb-1">
                      {quote.frequency_label} cleaning
                      {quote.discount_label && (
                        <span className="ml-1 text-[11px] text-alloy-midnight/70">
                          ({quote.discount_label})
                        </span>
                      )}
                    </p>
                    <p className="text-2xl font-bold text-alloy-juniper">
                      ${quote.recurring_price.toFixed(2)}
                      <span className="ml-1 text-[11px] text-alloy-midnight/60">per visit</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Add-ons list + total */}
              {quote.addons && quote.addons.length > 0 && (
                <div className="pt-1">
                  <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-1">
                    Add-ons
                  </p>
                  <div className="space-y-1">
                    {quote.addons.map((addon, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-sm text-alloy-midnight/85"
                      >
                        <span>{addon.name}</span>
                        <span>
                          {addon.price != null ? `$${addon.price.toFixed(2)}` : "Included in quote"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Breakdown link */}
              {quote.price_breakdown && (
                <details className="mt-1">
                  <summary className="text-xs text-alloy-midnight/70 cursor-pointer">
                    See full price breakdown
                  </summary>
                  <pre className="mt-1 whitespace-pre-line text-xs text-alloy-midnight/80">
                    {quote.price_breakdown}
                  </pre>
                </details>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-alloy-midnight">
                We&apos;re reviewing your details and will confirm your quote shortly.
              </p>
              {quote.price_breakdown && (
                <pre className="mt-1 whitespace-pre-line text-xs text-alloy-midnight/80">
                  {quote.price_breakdown}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* Move-out messaging for manual quotes (no calendar in this component) */}
      {quote && quote.service === "Move-Out / Heavy Clean" && (
        <div className="mt-4 rounded-lg border border-alloy-stone/40 bg-alloy-stone/40 p-4 text-sm text-alloy-midnight/85">
          <p className="font-semibold mb-1">Manual quote required</p>
          <p>
            We&apos;ll review your information and provide a personalized move-out / heavy clean
            quote shortly. You won&apos;t be charged until you confirm.
          </p>
        </div>
      )}
    </div>
  );
}


