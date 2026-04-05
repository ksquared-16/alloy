"use client";

import { useState, useEffect, useMemo } from "react";
import type { PublicFieldDef } from "@/components/public/ConfigurableFieldSections";
import { FALLBACK_SQFT_TIERS } from "@/lib/book-v2/loadCleaningPricingCatalog";
import { BOOKING_BATHROOM_OPTIONS, BOOKING_BEDROOM_OPTIONS } from "@/lib/book-v2/bookingBedBathOptions";
import {
  fetchPublicFieldDefinitions,
  fieldOptionsByKey,
  squareFootageSelectOptionsFromLocationFields,
} from "@/lib/public/fetchPublicFieldDefinitions";
import {
  MAX_SPECIALTY_QUOTE_PHOTO_BYTES,
  SPECIALTY_QUOTE_PHOTO_ACCEPT,
  SPECIALTY_QUOTE_PHOTO_FORM_KEYS,
  SPECIALTY_QUOTE_PHOTO_LABELS,
  type SpecialtyQuotePhotoFormKey,
} from "@/lib/book-v2/specialtyQuotePhotos";

export type SpecialtyCleaningType = "move_out" | "heavy_clean";

interface SpecialtyCleaningQuoteFormProps {
  cleaningType: SpecialtyCleaningType;
  onSuccess?: () => void;
}

export default function SpecialtyCleaningQuoteForm({ cleaningType, onSuccess }: SpecialtyCleaningQuoteFormProps) {
  const [locationFieldDefs, setLocationFieldDefs] = useState<PublicFieldDef[]>([]);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    zip: "",
    square_footage: "",
    street_address: "",
    city: "",
    preferred_service_date: "",
    home_type: "",
    beds: "",
    baths: "",
    notes: "",
    email: "",
    phone: "",
  });
  const [smsConsent, setSmsConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [specialtyPhotos, setSpecialtyPhotos] = useState<
    Partial<Record<SpecialtyQuotePhotoFormKey, File | null>>
  >({});

  useEffect(() => {
    let cancelled = false;
    fetchPublicFieldDefinitions({ entityType: "location", verticalSlug: "cleaning" })
      .then((res) => {
        if (cancelled) return;
        if (res?.ok && Array.isArray(res.fields)) setLocationFieldDefs(res.fields);
        else setLocationFieldDefs([]);
      })
      .catch(() => {
        if (!cancelled) setLocationFieldDefs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const squareFootageOptions = useMemo(() => {
    const fromDefs = squareFootageSelectOptionsFromLocationFields(locationFieldDefs);
    if (fromDefs?.length) return fromDefs;
    return FALLBACK_SQFT_TIERS.map((t) => ({
      value: t.sqft_key,
      label: t.sqft_label ?? t.sqft_key,
    }));
  }, [locationFieldDefs]);

  const homeTypeOptions = useMemo(() => {
    return (
      fieldOptionsByKey(locationFieldDefs, "home_type") ?? [
        { value: "house", label: "House" },
        { value: "condo", label: "Condo" },
        { value: "apartment", label: "Apartment" },
        { value: "townhome", label: "Townhome" },
      ]
    );
  }, [locationFieldDefs]);

  const bedOptions = useMemo(() => {
    return fieldOptionsByKey(locationFieldDefs, "beds") ?? BOOKING_BEDROOM_OPTIONS;
  }, [locationFieldDefs]);

  const bathOptions = useMemo(() => {
    return fieldOptionsByKey(locationFieldDefs, "baths") ?? BOOKING_BATHROOM_OPTIONS;
  }, [locationFieldDefs]);

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
    if (!form.home_type?.trim()) {
      setError("Home type is required.");
      return;
    }
    if (!form.beds?.trim() || !form.baths?.trim()) {
      setError("Beds and baths are required.");
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
    for (const key of SPECIALTY_QUOTE_PHOTO_FORM_KEYS) {
      const f = specialtyPhotos[key];
      if (!f || f.size <= 0) {
        setError(`Please add a photo: ${SPECIALTY_QUOTE_PHOTO_LABELS[key]}.`);
        return;
      }
      if (f.size > MAX_SPECIALTY_QUOTE_PHOTO_BYTES) {
        setError("Each photo must be 10MB or smaller.");
        return;
      }
      if (!f.type.startsWith("image/")) {
        setError("Photos must be JPEG, PNG, or WebP.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        cleaning_type: cleaningType,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        zip: form.zip.trim(),
        square_footage: form.square_footage.trim(),
        street_address: form.street_address.trim(),
        city: form.city.trim(),
        preferred_service_date: form.preferred_service_date.trim(),
        home_type: form.home_type.trim(),
        beds: form.beds.trim(),
        baths: form.baths.trim(),
        notes: form.notes.trim() || undefined,
        email: form.email.trim(),
        phone: form.phone.trim(),
        sms_consent: smsConsent,
        quote_context: {
          source: "specialty_native_form",
          url: typeof window !== "undefined" ? window.location.href : "",
        },
      };
      const fd = new FormData();
      fd.set("payload", JSON.stringify(payload));
      for (const key of SPECIALTY_QUOTE_PHOTO_FORM_KEYS) {
        const file = specialtyPhotos[key];
        if (file) fd.set(key, file);
      }
      const res = await fetch("/api/book-v2/specialty-quote-start", {
        method: "POST",
        body: fd,
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
          <label className={labelBase}>Preferred service date *</label>
          <input
            type="date"
            value={form.preferred_service_date}
            onChange={(e) => setForm((f) => ({ ...f, preferred_service_date: e.target.value }))}
            className="public-form-input"
          />
        </div>
        <div>
          <label className={labelBase}>Home type *</label>
          <select
            value={form.home_type}
            onChange={(e) => setForm((f) => ({ ...f, home_type: e.target.value }))}
            className="public-form-input"
          >
            <option value="">Select</option>
            {homeTypeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelBase}>Beds *</label>
            <select
              value={form.beds}
              onChange={(e) => setForm((f) => ({ ...f, beds: e.target.value }))}
              className="public-form-input"
            >
              <option value="">Select</option>
              {bedOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelBase}>Baths *</label>
            <select
              value={form.baths}
              onChange={(e) => setForm((f) => ({ ...f, baths: e.target.value }))}
              className="public-form-input"
            >
              <option value="">Select</option>
              {bathOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-3">
          <p className={labelBase}>Photos * (one per room)</p>
          <p className="text-xs text-alloy-midnight/60 -mt-1 mb-1">
            JPEG, PNG, or WebP, up to 10MB each.
          </p>
          {SPECIALTY_QUOTE_PHOTO_FORM_KEYS.map((key) => (
            <div key={key}>
              <label className="block text-xs font-medium text-alloy-midnight mb-1">
                {SPECIALTY_QUOTE_PHOTO_LABELS[key]} *
              </label>
              <input
                type="file"
                accept={SPECIALTY_QUOTE_PHOTO_ACCEPT}
                className="block w-full text-sm text-alloy-midnight file:mr-3 file:rounded-lg file:border-0 file:bg-alloy-juniper/15 file:px-3 file:py-2 file:text-sm file:font-medium file:text-alloy-pine"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setSpecialtyPhotos((prev) => ({ ...prev, [key]: file }));
                }}
              />
            </div>
          ))}
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
