"use client";

import { useState } from "react";

const SQUARE_FOOTAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "Under 1500 sq ft", label: "Under 1,500 sq ft" },
  { value: "1501–2,000 sq ft", label: "1,501 – 2,000 sq ft" },
  { value: "2,001-2,600 sq ft", label: "2,001 – 2,600 sq ft" },
  { value: "2,601-3,200 sq ft", label: "2,601 – 3,200 sq ft" },
  { value: "3,201-4,000 sq ft", label: "3,201 – 4,000 sq ft" },
  { value: "4,001-5,500 sq ft", label: "4,001 – 5,500 sq ft" },
  { value: "Over 5,500 sq ft", label: "Over 5,500 sq ft" },
];

export type QuickQuoteCampaignMode = {
  id: "firstfree4x60";
};

interface CleaningQuickQuoteFormProps {
  onSuccess: () => void;
  /** Recurring-only frequencies; standard cleaning implied (quote-start path). */
  campaignQuoteMode?: QuickQuoteCampaignMode;
}

export default function CleaningQuickQuoteForm({
  onSuccess,
  campaignQuoteMode,
}: CleaningQuickQuoteFormProps) {
  const isCampaignFirstFree = campaignQuoteMode?.id === "firstfree4x60";
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    zip: "",
    square_footage: "",
    cleaning_frequency: (isCampaignFirstFree ? "weekly" : "one_time") as
      | "one_time"
      | "weekly"
      | "biweekly"
      | "monthly",
    email: "",
    phone: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smsConsent, setSmsConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { first_name, last_name, zip, square_footage, cleaning_frequency, email, phone } = form;
    if (!first_name?.trim()) {
      setError("First name is required.");
      return;
    }
    if (!last_name?.trim()) {
      setError("Last name is required.");
      return;
    }
    if (!zip.trim()) {
      setError("ZIP code is required");
      return;
    }
    if (!square_footage?.trim()) {
      setError("Please select approximate square footage.");
      return;
    }
    if (!phone?.trim()) {
      setError("Phone number is required.");
      return;
    }
    if (!email?.trim()) {
      setError("Please enter your email so we can save your quote.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setConsentError(null);
    try {
      const identityKeys = ["alloy_person_id", "alloy_contact_id", "alloy_customer_id", "alloy_opportunity_id"];
      try {
        identityKeys.forEach((k) => {
          localStorage.removeItem(k);
          sessionStorage.removeItem(k);
        });
      } catch {
        // ignore
      }
      const res = await fetch("/api/book-v2/quote-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          zip: zip.trim(),
          square_footage: square_footage.trim(),
          cleaning_frequency: isCampaignFirstFree ? cleaning_frequency || "weekly" : cleaning_frequency || "one_time",
          email: email?.trim() || undefined,
          phone: phone.trim(),
          sms_consent: smsConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.message || "Could not save your quote. Please try again.");
        return;
      }
      try {
        if (data.person_id) localStorage.setItem("alloy_person_id", data.person_id);
        if (data.contact_id) localStorage.setItem("alloy_contact_id", data.contact_id);
        if (data.opportunity_id) localStorage.setItem("alloy_opportunity_id", data.opportunity_id);
      } catch (e) {
        console.warn("localStorage set failed:", e);
      }
      const qo = data.quote_output;
      const storedQuote = {
        status: "ready",
        source: "local_pricing",
        estimated_price: qo?.estimated_price ?? undefined,
        first_clean_price: qo?.first_clean_price ?? qo?.estimated_price ?? undefined,
        recurring_price: qo?.recurring_price ?? undefined,
        frequency_label: qo?.frequency_label ?? "One-time",
        service: "Standard Cleaning",
        price_breakdown: undefined,
        addons: qo?.addons ?? [],
        quote_input: {
          zip: zip.trim(),
          square_footage: square_footage.trim(),
          cleaning_frequency: isCampaignFirstFree ? cleaning_frequency || "weekly" : cleaning_frequency || "one_time",
        },
        email: email?.trim() || undefined,
        phone: phone?.trim() || undefined,
        first_name: first_name?.trim() || undefined,
        last_name: last_name?.trim() || undefined,
      };
      const quoteJson = JSON.stringify(storedQuote);
      localStorage.setItem("alloy_quote_v1", quoteJson);
      sessionStorage.setItem("alloy_quote_v1", quoteJson);

      // Persist contact for BookV2 (same key + shape as BookV2 reads: alloy_booking_prefill)
      const prefillData: Record<string, string | undefined> = {
        email: email?.trim() || undefined,
        phone: phone?.trim() || undefined,
        first_name: first_name?.trim() || undefined,
        last_name: last_name?.trim() || undefined,
        zip: zip?.trim() || undefined,
        postal_code: zip?.trim() || undefined,
      };
      if (isCampaignFirstFree) {
        prefillData.campaign = "firstfree4x60";
        prefillData.discount_program_code = "FIRSTFREE4X60";
        prefillData.campaign_source = "quote_modal_firstfree4x60";
      }
      const prefillJson = JSON.stringify(prefillData);
      try {
        sessionStorage.setItem("alloy_booking_prefill", prefillJson);
        localStorage.setItem("alloy_booking_prefill", prefillJson);
      } catch (e) {
        console.warn("alloy_booking_prefill set failed:", e);
      }

      onSuccess();
    } catch (err) {
      console.error("Quote start failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const labelBase =
    "block text-xs font-semibold text-alloy-midnight/80 uppercase tracking-wider mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-0">
      {/* Contact — name & location */}
      <div className="space-y-4 pb-6 border-b border-alloy-stone/50">
        <p className="public-form-section-title">
          Your details
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelBase}>First name *</label>
            <input
              type="text"
              value={form.first_name}
              onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              placeholder="e.g. Jamie"
              className="public-form-input"
              maxLength={80}
              autoComplete="given-name"
            />
          </div>
          <div>
            <label className={labelBase}>Last name *</label>
            <input
              type="text"
              value={form.last_name}
              onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              placeholder="e.g. Smith"
              className="public-form-input"
              maxLength={80}
              autoComplete="family-name"
            />
          </div>
        </div>
        <div>
          <label className={labelBase}>ZIP code *</label>
          <input
            type="text"
            value={form.zip}
            onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
            placeholder="e.g. 97702"
            className="public-form-input"
            maxLength={10}
          />
        </div>
      </div>

      {/* Home & schedule */}
      <div className="space-y-4 py-6 border-b border-alloy-stone/50">
        <p className="public-form-section-title">
          Home & schedule
        </p>
        <div>
          <label className={labelBase}>Approximate square footage *</label>
          <select
            value={form.square_footage}
            onChange={(e) => setForm((f) => ({ ...f, square_footage: e.target.value }))}
            className="public-form-input"
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
          <label className={labelBase}>Cleaning frequency</label>
          <select
            value={form.cleaning_frequency}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                cleaning_frequency: e.target.value as "one_time" | "weekly" | "biweekly" | "monthly",
              }))
            }
            className="public-form-input"
          >
            {!isCampaignFirstFree && <option value="one_time">One-time</option>}
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>

      {/* Contact — email & phone */}
      <div className="space-y-4 py-6 border-b border-alloy-stone/50">
        <p className="public-form-section-title">
          How we&apos;ll reach you
        </p>
        <div>
          <label className={labelBase}>Email (so we can save your quote)</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@example.com"
            className="public-form-input"
          />
        </div>
        <div>
          <label className={labelBase}>Phone *</label>
          <input
            type="tel"
            required
            aria-required
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="(541) 555-0123"
            className="public-form-input"
          />
          <p className="mt-1.5 text-xs text-alloy-midnight/55">
            Phone is required for booking. SMS is optional — consent below.
          </p>
        </div>
      </div>

      {/* Consent */}
      <div className="pt-6">
        <label className="flex items-start gap-3 text-sm text-alloy-midnight/80 cursor-pointer">
          <input
            type="checkbox"
            checked={smsConsent}
            onChange={(e) => {
              setSmsConsent(e.target.checked);
              setConsentError(null);
            }}
            className="mt-0.5 h-4 w-4 rounded border-alloy-stone/60 text-alloy-juniper focus:ring-2 focus:ring-alloy-juniper/25 focus:ring-offset-0 transition-colors"
          />
          <span className="leading-relaxed">
            By checking this box, you agree to receive transactional SMS from Alloy about your quote and appointments. Message and data rates may apply. Reply STOP to opt out. Consent is not required to purchase.
          </span>
        </label>
        {consentError && <p className="mt-2 text-sm text-red-600">{consentError}</p>}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="public-form-cta public-btn-primary mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? "Saving…" : isCampaignFirstFree ? "Get my recurring quote" : "Get my quote"}
      </button>
    </form>
  );
}
