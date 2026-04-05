"use client";

import { useState, useEffect, useMemo } from "react";
import { FALLBACK_SQFT_TIERS } from "@/lib/book-v2/loadCleaningPricingCatalog";
import { BOOKING_BATHROOM_OPTIONS, BOOKING_BEDROOM_OPTIONS } from "@/lib/book-v2/bookingBedBathOptions";

export type SpecialtyCleaningType = "move_out" | "heavy_clean";

interface SpecialtyCleaningQuoteFormProps {
  cleaningType: SpecialtyCleaningType;
  onSuccess?: () => void;
}

const DEFAULT_HOME = [
  { value: "Single-Family Home", label: "Single-Family Home" },
  { value: "Apartment / Condo", label: "Apartment / Condo" },
  { value: "Townhome", label: "Townhome" },
  { value: "Duplex", label: "Duplex" },
  { value: "Other", label: "Other" },
];

export default function SpecialtyCleaningQuoteForm({ cleaningType, onSuccess }: SpecialtyCleaningQuoteFormProps) {
  const [sqftTiers, setSqftTiers] = useState<Array<{ sqft_key: string; sqft_label: string }> | null>(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    zip: "",
    square_footage: "",
    street_address: "",
    city: "",
    state: "",
    preferred_service_date: "",
    home_type: "",
    bedrooms: "",
    bathrooms: "",
    notes: "",
    email: "",
    phone: "",
  });
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/booking-config")
      .then((r) => r.json())
      .then((data: { ok?: boolean; square_footage_tiers?: Array<{ sqft_key: string; sqft_label: string }> }) => {
        if (cancelled || !data?.ok || !data.square_footage_tiers?.length) return;
        setSqftTiers(data.square_footage_tiers);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const squareFootageOptions = useMemo(() => {
    const tiers =
      sqftTiers && sqftTiers.length > 0
        ? sqftTiers
        : FALLBACK_SQFT_TIERS.map((t) => ({ sqft_key: t.sqft_key, sqft_label: t.sqft_label ?? t.sqft_key }));
    return tiers.map((t) => ({ value: t.sqft_key, label: t.sqft_label }));
  }, [sqftTiers]);

  const title =
    cleaningType === "move_out" ? "Move-out clean estimate" : "Heavy / deep clean estimate";
  const blurb =
    cleaningType === "move_out"
      ? "Tell us about your move-out timeline and property. We’ll follow up with a transparent custom quote."
      : "Tell us about your home and what you need. We’ll follow up with a transparent custom quote.";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.first_name?.trim()) {
      setError("First name is required.");
      return;
    }
    if (!form.last_name?.trim()) {
      setError("Last name is required.");
      return;
    }
    if (!form.zip.trim()) {
      setError("ZIP code is required.");
      return;
    }
    if (!form.square_footage?.trim()) {
      setError("Please select approximate square footage.");
      return;
    }
    if (!form.street_address.trim()) {
      setError("Street address is required.");
      return;
    }
    if (!form.city.trim()) {
      setError("City is required.");
      return;
    }
    if (!form.preferred_service_date?.trim()) {
      setError("Preferred service date is required.");
      return;
    }
    if (!form.phone?.trim()) {
      setError("Phone number is required.");
      return;
    }
    if (!form.email?.trim()) {
      setError("Email is required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/book-v2/specialty-quote-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cleaning_type: cleaningType,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          zip: form.zip.trim(),
          square_footage: form.square_footage.trim(),
          street_address: form.street_address.trim(),
          city: form.city.trim(),
          state: form.state.trim() || undefined,
          preferred_service_date: form.preferred_service_date.trim(),
          home_type: form.home_type.trim() || undefined,
          bedrooms: form.bedrooms.trim() || undefined,
          bathrooms: form.bathrooms.trim() || undefined,
          notes: form.notes.trim() || undefined,
          email: form.email.trim(),
          phone: form.phone.trim(),
          sms_consent: smsConsent,
          quote_context: {
            source: "specialty_native_form",
            url: typeof window !== "undefined" ? window.location.href : "",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Could not save your request. Please try again.");
        return;
      }
      setDone(true);
      onSuccess?.();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const labelBase =
    "block text-xs font-semibold text-alloy-midnight/80 uppercase tracking-wider mb-1.5";

  if (done) {
    return (
      <div className="rounded-xl border border-alloy-juniper/30 bg-alloy-juniper/10 p-6 text-alloy-midnight">
        <p className="text-lg font-semibold text-alloy-pine mb-2">Thanks — we’ve got your details</p>
        <p className="text-sm text-alloy-midnight/80">
          Our team will review your specialty cleaning request and reach out with a personalized estimate. If you need a
          standard recurring or one-time home cleaning with instant pricing, you can use{" "}
          <a href="/book-v2" className="text-alloy-juniper font-medium underline">
            book online
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-alloy-midnight mb-1">{title}</h2>
        <p className="text-sm text-alloy-midnight/75">{blurb}</p>
      </div>

      <div className="space-y-4 pb-4 border-b border-alloy-stone/40">
        <p className="public-form-section-title">Your details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelBase}>First name *</label>
            <input
              type="text"
              value={form.first_name}
              onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              className="public-form-input"
              autoComplete="given-name"
            />
          </div>
          <div>
            <label className={labelBase}>Last name *</label>
            <input
              type="text"
              value={form.last_name}
              onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              className="public-form-input"
              autoComplete="family-name"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelBase}>Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="public-form-input"
              autoComplete="email"
            />
          </div>
          <div>
            <label className={labelBase}>Phone *</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="public-form-input"
              autoComplete="tel"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 pb-4 border-b border-alloy-stone/40">
        <p className="public-form-section-title">Property</p>
        <div>
          <label className={labelBase}>ZIP code *</label>
          <input
            type="text"
            value={form.zip}
            onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
            className="public-form-input"
            maxLength={10}
            autoComplete="postal-code"
          />
        </div>
        <div>
          <label className={labelBase}>Approximate square footage *</label>
          <select
            value={form.square_footage}
            onChange={(e) => setForm((f) => ({ ...f, square_footage: e.target.value }))}
            className="public-form-input"
          >
            <option value="">Select</option>
            {squareFootageOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelBase}>Street address *</label>
          <input
            type="text"
            value={form.street_address}
            onChange={(e) => setForm((f) => ({ ...f, street_address: e.target.value }))}
            className="public-form-input"
            autoComplete="street-address"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelBase}>City *</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              className="public-form-input"
              autoComplete="address-level2"
            />
          </div>
          <div>
            <label className={labelBase}>State</label>
            <input
              type="text"
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              className="public-form-input"
              autoComplete="address-level1"
            />
          </div>
        </div>
        <div>
          <label className={labelBase}>Home type</label>
          <select
            value={form.home_type}
            onChange={(e) => setForm((f) => ({ ...f, home_type: e.target.value }))}
            className="public-form-input"
          >
            <option value="">Select (optional)</option>
            {DEFAULT_HOME.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelBase}>Bedrooms</label>
            <select
              value={form.bedrooms}
              onChange={(e) => setForm((f) => ({ ...f, bedrooms: e.target.value }))}
              className="public-form-input"
            >
              <option value="">Select (optional)</option>
              {BOOKING_BEDROOM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelBase}>Bathrooms</label>
            <select
              value={form.bathrooms}
              onChange={(e) => setForm((f) => ({ ...f, bathrooms: e.target.value }))}
              className="public-form-input"
            >
              <option value="">Select (optional)</option>
              {BOOKING_BATHROOM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelBase}>Preferred service date *</label>
          <input
            type="date"
            value={form.preferred_service_date}
            onChange={(e) => setForm((f) => ({ ...f, preferred_service_date: e.target.value }))}
            className="public-form-input"
          />
        </div>
        <div>
          <label className={labelBase}>Anything else we should know?</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="public-form-input min-h-[100px] resize-y"
            rows={4}
            placeholder="e.g. empty home, extra focus areas, timing constraints"
          />
        </div>
      </div>

      <div>
        <label className="flex items-start gap-3 text-sm text-alloy-midnight/80 cursor-pointer">
          <input
            type="checkbox"
            checked={smsConsent}
            onChange={(e) => setSmsConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-alloy-stone/60 text-alloy-juniper"
          />
          <span className="leading-relaxed">
            By checking this box, you agree to receive transactional SMS from Alloy about your request. Message and data
            rates may apply. Reply STOP to opt out.
          </span>
        </label>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="public-form-cta public-btn-primary w-full sm:w-auto disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Request estimate"}
      </button>

      <p className="text-xs text-alloy-midnight/55">
        For standard home cleaning with online pricing and scheduling, use{" "}
        <a href="/book-v2" className="text-alloy-juniper underline font-medium">
          Book online
        </a>
        .
      </p>
    </form>
  );
}
