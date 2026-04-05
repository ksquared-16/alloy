"use client";

import { useState, useEffect, useMemo } from "react";
import { catalogFrequencyChoices } from "@/lib/book-v2/catalogFrequencyChoices";
import { FALLBACK_SQFT_TIERS } from "@/lib/book-v2/loadCleaningPricingCatalog";
import type { PricingFrequencyRow } from "@/lib/book-v2/loadCleaningPricingCatalog";
import {
    formatFrequencyRowDisplayLabel,
    frequencyRowForRpcKey,
    inferLegacyCleaningFrequencyApiKey,
    resolveRpcFrequencyKey,
} from "@/lib/book-v2/resolveCleaningFrequencyRpc";

export type QuickQuoteCampaignMode = {
  id: "firstfree4x120";
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
  const isCampaignFirstFree = campaignQuoteMode?.id === "firstfree4x120";
  const [sqftTiers, setSqftTiers] = useState<Array<{ sqft_key: string; sqft_label: string }> | null>(null);
  const [pricingFreqRows, setPricingFreqRows] = useState<PricingFrequencyRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/booking-config")
      .then((r) => r.json())
      .then(
        (data: {
          ok?: boolean;
          square_footage_tiers?: Array<{ sqft_key: string; sqft_label: string }>;
          pricing_frequencies?: PricingFrequencyRow[];
        }) => {
          if (cancelled || !data?.ok) return;
          if (data.square_footage_tiers?.length) setSqftTiers(data.square_footage_tiers);
          if (data.pricing_frequencies?.length) setPricingFreqRows(data.pricing_frequencies);
        }
      )
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
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    zip: "",
    square_footage: "",
    cleaning_frequency_key: isCampaignFirstFree ? "weekly" : "",
    cleaning_type: "standard" as "standard" | "move_out" | "heavy_clean",
    email: "",
    phone: "",
  });

  const quickFreqOptions = useMemo(
    () => catalogFrequencyChoices(pricingFreqRows, isCampaignFirstFree),
    [pricingFreqRows, isCampaignFirstFree]
  );

  useEffect(() => {
    if (!pricingFreqRows.length) return;
    setForm((f) => {
      if (f.cleaning_frequency_key && f.cleaning_frequency_key.trim()) return f;
      const opts = catalogFrequencyChoices(pricingFreqRows, isCampaignFirstFree);
      return { ...f, cleaning_frequency_key: opts[0]?.value ?? "one_time" };
    });
  }, [pricingFreqRows, isCampaignFirstFree]);

  useEffect(() => {
    if (!isCampaignFirstFree || !pricingFreqRows.length) return;
    setForm((f) => {
      if (f.cleaning_frequency_key && f.cleaning_frequency_key !== "one_time") return f;
      const firstRec = pricingFreqRows.find((r) => r.is_recurring);
      return { ...f, cleaning_frequency_key: firstRec?.frequency_key ?? "weekly" };
    });
  }, [isCampaignFirstFree, pricingFreqRows]);
  const [submitting, setSubmitting] = useState(false);
  const [handoffVisible, setHandoffVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smsConsent, setSmsConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { first_name, last_name, zip, square_footage, cleaning_frequency_key, cleaning_type, email, phone } =
      form;
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
    setHandoffVisible(false);
    setError(null);
    setConsentError(null);
    let succeeded = false;
    try {
      if (cleaning_type !== "standard") {
        try {
          const prefillJson = JSON.stringify({
            email: email?.trim() || undefined,
            phone: phone?.trim() || undefined,
            first_name: first_name?.trim() || undefined,
            last_name: last_name?.trim() || undefined,
            zip: zip?.trim() || undefined,
            postal_code: zip?.trim() || undefined,
          });
          sessionStorage.setItem("alloy_booking_prefill", prefillJson);
          localStorage.setItem("alloy_booking_prefill", prefillJson);
        } catch {
          // ignore
        }
        window.location.href = `/book-v2?cleaning_type=${encodeURIComponent(cleaning_type)}`;
        return;
      }

      const identityKeys = ["alloy_person_id", "alloy_contact_id", "alloy_customer_id", "alloy_opportunity_id"];
      try {
        identityKeys.forEach((k) => {
          localStorage.removeItem(k);
          sessionStorage.removeItem(k);
        });
      } catch {
        // ignore
      }
      const freqSel = (cleaning_frequency_key && cleaning_frequency_key.trim()) || "one_time";
      const res = await fetch("/api/book-v2/quote-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          zip: zip.trim(),
          square_footage: square_footage.trim(),
          cleaning_frequency: freqSel,
          cleaning_type: "standard",
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
      succeeded = true;
      try {
        if (data.person_id) localStorage.setItem("alloy_person_id", data.person_id);
        if (data.contact_id) localStorage.setItem("alloy_contact_id", data.contact_id);
        if (data.opportunity_id) localStorage.setItem("alloy_opportunity_id", data.opportunity_id);
      } catch (e) {
        console.warn("localStorage set failed:", e);
      }
      const qo = data.quote_output;
      const rpcK = resolveRpcFrequencyKey(freqSel, pricingFreqRows);
      const legacyK = inferLegacyCleaningFrequencyApiKey(rpcK, pricingFreqRows);
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
          cleaning_frequency: legacyK,
          cleaning_frequency_key: rpcK || null,
          cleaning_type: "standard",
        },
        email: email?.trim() || undefined,
        phone: phone?.trim() || undefined,
        first_name: first_name?.trim() || undefined,
        last_name: last_name?.trim() || undefined,
      };
      const quoteJson = JSON.stringify(storedQuote);
      localStorage.setItem("alloy_quote_v1", quoteJson);
      sessionStorage.setItem("alloy_quote_v1", quoteJson);

      // Legacy /book (BookClient): reads cleaning_quote / alloy_cleaning_quote — keep in sync with quick quote
      try {
        localStorage.setItem("cleaning_quote", quoteJson);
        sessionStorage.setItem("alloy_cleaning_quote", quoteJson);
        sessionStorage.setItem("cleaning_quote", quoteJson);
      } catch (e) {
        console.warn("legacy quote storage set failed:", e);
      }

      const row = frequencyRowForRpcKey(rpcK, pricingFreqRows);
      const cleaningFrequencyLabel = row ? formatFrequencyRowDisplayLabel(row) : "One-time";
      const leadFormPayload = {
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        postal_code: zip.trim(),
        home_type: "Single-Family Home",
        service_type: "Standard Cleaning",
        approximate_square_footage: square_footage.trim(),
        cleaning_frequency: cleaningFrequencyLabel,
      };
      try {
        sessionStorage.setItem("alloy_lead_form_data", JSON.stringify(leadFormPayload));
      } catch (e) {
        console.warn("alloy_lead_form_data set failed:", e);
      }

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
        prefillData.campaign = "firstfree4x120";
        prefillData.discount_program_code = "FIRSTFREE4X120";
        prefillData.campaign_source = "quote_modal_firstfree4x120";
      }
      const prefillJson = JSON.stringify(prefillData);
      try {
        sessionStorage.setItem("alloy_booking_prefill", prefillJson);
        localStorage.setItem("alloy_booking_prefill", prefillJson);
      } catch (e) {
        console.warn("alloy_booking_prefill set failed:", e);
      }

      setSubmitting(false);
      setHandoffVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => onSuccess());
      });
    } catch (err) {
      console.error("Quote start failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      if (!succeeded) setSubmitting(false);
    }
  };

  const labelBase =
    "block text-xs font-semibold text-alloy-midnight/80 uppercase tracking-wider mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="relative space-y-0">
      {(submitting || handoffVisible) && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-[inherit] bg-white/93 px-6 text-center backdrop-blur-[1px]"
          aria-live="polite"
        >
          <div className="h-10 w-10 rounded-full border-[3px] border-alloy-juniper border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-alloy-midnight">
            {handoffVisible ? "Quote saved — taking you to the next step…" : "Saving your quote…"}
          </p>
        </div>
      )}
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
            {squareFootageOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelBase}>Type of clean</label>
          <select
            value={form.cleaning_type}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                cleaning_type: e.target.value as "standard" | "move_out" | "heavy_clean",
              }))
            }
            className="public-form-input"
          >
            <option value="standard">Standard recurring / one-time home cleaning</option>
            <option value="move_out">Move-out clean</option>
            <option value="heavy_clean">Heavy / deep clean</option>
          </select>
        </div>
        <div>
          <label className={labelBase}>Cleaning frequency</label>
          <select
            value={form.cleaning_frequency_key || quickFreqOptions[0]?.value || "one_time"}
            onChange={(e) => setForm((f) => ({ ...f, cleaning_frequency_key: e.target.value }))}
            disabled={form.cleaning_type !== "standard"}
            className="public-form-input disabled:opacity-50"
          >
            {quickFreqOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {form.cleaning_type !== "standard" && (
            <p className="mt-1.5 text-xs text-alloy-midnight/55">Frequency applies to standard home cleaning only.</p>
          )}
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
