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

interface CleaningQuickQuoteFormProps {
  onSuccess: () => void;
}

export default function CleaningQuickQuoteForm({ onSuccess }: CleaningQuickQuoteFormProps) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    zip: "",
    square_footage: "",
    cleaning_frequency: "one_time" as "one_time" | "weekly" | "biweekly" | "monthly",
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
    if (!email?.trim() && !phone?.trim()) {
      setError("Please enter your email or phone so we can save your quote.");
      return;
    }
    if (!smsConsent) {
      setConsentError("You must agree to receive SMS updates.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setConsentError(null);
    try {
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
        setError(data.message || "Could not save your quote. Please try again.");
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
        quote_input: { zip: zip.trim(), square_footage: square_footage.trim(), cleaning_frequency: cleaning_frequency || "one_time" },
      };
      const quoteJson = JSON.stringify(storedQuote);
      localStorage.setItem("alloy_quote_v1", quoteJson);
      sessionStorage.setItem("alloy_quote_v1", quoteJson);
      onSuccess();
    } catch (err) {
      console.error("Quote start failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">First name *</label>
          <input
            type="text"
            value={form.first_name}
            onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
            placeholder="e.g. Jamie"
            className="w-full px-3 py-2 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue"
            maxLength={80}
            autoComplete="given-name"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">Last name *</label>
          <input
            type="text"
            value={form.last_name}
            onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
            placeholder="e.g. Smith"
            className="w-full px-3 py-2 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue"
            maxLength={80}
            autoComplete="family-name"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">ZIP code *</label>
        <input
          type="text"
          value={form.zip}
          onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
          placeholder="e.g. 97702"
          className="w-full px-3 py-2 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue"
          maxLength={10}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">Approximate square footage *</label>
        <select
          value={form.square_footage}
          onChange={(e) => setForm((f) => ({ ...f, square_footage: e.target.value }))}
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
          value={form.cleaning_frequency}
          onChange={(e) => setForm((f) => ({ ...f, cleaning_frequency: e.target.value as "one_time" | "weekly" | "biweekly" | "monthly" }))}
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
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          placeholder="you@example.com"
          className="w-full px-3 py-2 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-alloy-midnight/70 uppercase tracking-wide mb-1">Phone (optional)</label>
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="(541) 555-0123"
          className="w-full px-3 py-2 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-blue"
        />
      </div>
      <div className="pt-1">
        <label className="flex items-start gap-2 text-xs text-alloy-midnight/80 cursor-pointer">
          <input
            type="checkbox"
            checked={smsConsent}
            onChange={(e) => {
              setSmsConsent(e.target.checked);
              setConsentError(null);
            }}
            className="mt-0.5 h-4 w-4 rounded border-alloy-stone/70 text-alloy-juniper focus:ring-alloy-juniper"
          />
          <span>
            I agree to receive transactional SMS messages from Alloy regarding my quote, appointment updates, and service notifications. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Consent is not a condition of purchase.
          </span>
        </label>
        {consentError && <p className="mt-1 text-xs text-red-600">{consentError}</p>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-alloy-blue text-white font-semibold px-6 py-3 rounded-lg hover:bg-alloy-blue/90 transition-colors disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Get my quote"}
      </button>
    </form>
  );
}
