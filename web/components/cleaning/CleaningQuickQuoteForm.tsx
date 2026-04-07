"use client";

import { useState, useEffect, useMemo } from "react";
import type { PublicFieldDef } from "@/components/public/ConfigurableFieldSections";
import { catalogFrequencyChoices } from "@/lib/book-v2/catalogFrequencyChoices";
import { FALLBACK_SQFT_TIERS } from "@/lib/book-v2/loadCleaningPricingCatalog";
import type { PricingFrequencyRow } from "@/lib/book-v2/loadCleaningPricingCatalog";
import {
  BOOKING_BATHROOM_OPTIONS,
  BOOKING_BEDROOM_OPTIONS,
} from "@/lib/book-v2/bookingBedBathOptions";
import {
  bookingBathroomSelectOptionsFromFields,
  bookingBedroomSelectOptionsFromFields,
  fetchPublicFieldDefinitions,
  fieldOptionsByKey,
  homeTypeSelectOptionsFromBookingConfig,
  squareFootageSelectOptionsFromBookingConfig,
  squareFootageSelectOptionsFromLocationFields,
} from "@/lib/public/fetchPublicFieldDefinitions";
import {
  MAX_SPECIALTY_QUOTE_PHOTO_BYTES,
  SPECIALTY_QUOTE_PHOTO_ACCEPT,
  SPECIALTY_QUOTE_PHOTO_FORM_KEYS,
  SPECIALTY_QUOTE_PHOTO_LABELS,
  type SpecialtyQuotePhotoFormKey,
} from "@/lib/book-v2/specialtyQuotePhotos";
import {
  formatFrequencyRowDisplayLabel,
  frequencyRowForRpcKey,
  inferLegacyCleaningFrequencyApiKey,
  resolveRpcFrequencyKey,
} from "@/lib/book-v2/resolveCleaningFrequencyRpc";

export type QuickQuoteCampaignMode = {
  id: "firstfree4x120";
};

export type QuickQuoteCompleteDetail = { kind: "standard" } | { kind: "specialty" };

interface CleaningQuickQuoteFormProps {
  onComplete: (detail: QuickQuoteCompleteDetail) => void;
  /** Recurring-only frequencies; standard cleaning implied (quote-start path). */
  campaignQuoteMode?: QuickQuoteCampaignMode;
  /** From campaign modal: strip `campaign` query and reopen standard quote (one-time / specialty). */
  onSwitchToStandardQuote?: () => void;
}

type CleaningTypeKey = "standard" | "move_out" | "heavy_clean";

/** If `specialty_cleaning_type` option set is missing from the org, keep these keys aligned with that set. */
const DOCUMENTED_FALLBACK_SPECIALTY_CLEANING_TYPES: { value: CleaningTypeKey; label: string }[] = [
  { value: "move_out", label: "Move-out cleaning" },
  { value: "heavy_clean", label: "Heavy / deep cleaning" },
];

export default function CleaningQuickQuoteForm({
  onComplete,
  campaignQuoteMode,
  onSwitchToStandardQuote,
}: CleaningQuickQuoteFormProps) {
  const isCampaignFirstFree = campaignQuoteMode?.id === "firstfree4x120";
  const [locationFieldDefs, setLocationFieldDefs] = useState<PublicFieldDef[]>([]);
  const [opportunitySpecialtyFieldDefs, setOpportunitySpecialtyFieldDefs] = useState<PublicFieldDef[]>([]);
  const [pricingFreqRows, setPricingFreqRows] = useState<PricingFrequencyRow[]>([]);
  const [bookingCfgSqft, setBookingCfgSqft] = useState<
    { sqft_key: string; sqft_label: string }[] | null
  >(null);
  const [bookingCfgHomeTypes, setBookingCfgHomeTypes] = useState<
    { key: string; label: string }[] | null
  >(null);
  const [bookingCfgBedroomOpts, setBookingCfgBedroomOpts] = useState<
    { value: string; label: string }[] | null
  >(null);
  const [bookingCfgBathroomOpts, setBookingCfgBathroomOpts] = useState<
    { value: string; label: string }[] | null
  >(null);
  const [bookingCfgSpecialtyOpts, setBookingCfgSpecialtyOpts] = useState<
    { value: string; label: string }[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchPublicFieldDefinitions({ entityType: "location", verticalSlug: "cleaning" }),
      fetchPublicFieldDefinitions({ entityType: "opportunity", sectionKeys: ["specialty_quote"] }),
      fetch("/api/public/booking-config").then((r) => r.json()),
    ])
      .then(([loc, opp, cfg]) => {
        if (cancelled) return;
        if (loc?.ok && Array.isArray(loc.fields)) setLocationFieldDefs(loc.fields);
        else setLocationFieldDefs([]);
        if (opp?.ok && Array.isArray(opp.fields)) setOpportunitySpecialtyFieldDefs(opp.fields);
        else setOpportunitySpecialtyFieldDefs([]);
        const data = cfg as {
          ok?: boolean;
          pricing_frequencies?: PricingFrequencyRow[];
          square_footage_tiers?: { sqft_key: string; sqft_label: string }[];
          home_types?: { key: string; label: string }[];
          bedroom_options?: { value: string; label: string }[];
          bathroom_options?: { value: string; label: string }[];
          specialty_cleaning_type_options?: { value: string; label: string }[];
        };
        if (data?.ok && data.pricing_frequencies?.length) setPricingFreqRows(data.pricing_frequencies);
        if (data?.ok) {
          setBookingCfgSqft(data.square_footage_tiers?.length ? data.square_footage_tiers : null);
          setBookingCfgHomeTypes(data.home_types?.length ? data.home_types : null);
          setBookingCfgBedroomOpts(data.bedroom_options?.length ? data.bedroom_options : null);
          setBookingCfgBathroomOpts(data.bathroom_options?.length ? data.bathroom_options : null);
          setBookingCfgSpecialtyOpts(
            data.specialty_cleaning_type_options?.length ? data.specialty_cleaning_type_options : null
          );
        } else {
          setBookingCfgSqft(null);
          setBookingCfgHomeTypes(null);
          setBookingCfgBedroomOpts(null);
          setBookingCfgBathroomOpts(null);
          setBookingCfgSpecialtyOpts(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLocationFieldDefs([]);
          setOpportunitySpecialtyFieldDefs([]);
          setBookingCfgSqft(null);
          setBookingCfgHomeTypes(null);
          setBookingCfgBedroomOpts(null);
          setBookingCfgBathroomOpts(null);
          setBookingCfgSpecialtyOpts(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const squareFootageOptions = useMemo(() => {
    const fromDefs = squareFootageSelectOptionsFromLocationFields(locationFieldDefs);
    if (fromDefs?.length) return fromDefs;
    const fromCfg = squareFootageSelectOptionsFromBookingConfig(bookingCfgSqft ?? undefined);
    if (fromCfg?.length) return fromCfg;
    return FALLBACK_SQFT_TIERS.map((t) => ({
      value: t.sqft_key,
      label: t.sqft_label ?? t.sqft_key,
    }));
  }, [locationFieldDefs, bookingCfgSqft]);

  const homeTypeOptions = useMemo(() => {
    return (
      fieldOptionsByKey(locationFieldDefs, "home_type") ??
      homeTypeSelectOptionsFromBookingConfig(bookingCfgHomeTypes ?? undefined) ?? [
        { value: "house", label: "House" },
        { value: "condo", label: "Condo" },
        { value: "apartment", label: "Apartment" },
        { value: "townhome", label: "Townhome" },
      ]
    );
  }, [locationFieldDefs, bookingCfgHomeTypes]);

  const bedOptions = useMemo(() => {
    return (
      bookingBedroomSelectOptionsFromFields(locationFieldDefs) ??
      (bookingCfgBedroomOpts?.length ? bookingCfgBedroomOpts : null) ??
      BOOKING_BEDROOM_OPTIONS
    );
  }, [locationFieldDefs, bookingCfgBedroomOpts]);

  const bathOptions = useMemo(() => {
    return (
      bookingBathroomSelectOptionsFromFields(locationFieldDefs) ??
      (bookingCfgBathroomOpts?.length ? bookingCfgBathroomOpts : null) ??
      BOOKING_BATHROOM_OPTIONS
    );
  }, [locationFieldDefs, bookingCfgBathroomOpts]);

  const cleaningTypeSelectOptions = useMemo(() => {
    const fromDefs = fieldOptionsByKey(opportunitySpecialtyFieldDefs, "specialty_cleaning_type");
    const fromCfg = bookingCfgSpecialtyOpts?.length ? bookingCfgSpecialtyOpts : null;
    const specialtySource = fromDefs?.length ? fromDefs : fromCfg;
    const specialty =
      specialtySource && specialtySource.length > 0
        ? specialtySource.map((o) => ({ value: o.value as CleaningTypeKey, label: o.label }))
        : DOCUMENTED_FALLBACK_SPECIALTY_CLEANING_TYPES;
    return [{ value: "standard" as const, label: "Standard cleaning" }, ...specialty];
  }, [opportunitySpecialtyFieldDefs, bookingCfgSpecialtyOpts]);

  const [cleaningType, setCleaningType] = useState<CleaningTypeKey>("standard");
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    zip: "",
    square_footage: "",
    cleaning_frequency_key: isCampaignFirstFree ? "weekly" : "",
    email: "",
    phone: "",
    street_address: "",
    city: "",
    preferred_service_date: "",
    home_type: "",
    beds: "",
    baths: "",
    specialty_notes: "",
  });

  const [specialtyPhotos, setSpecialtyPhotos] = useState<
    Partial<Record<SpecialtyQuotePhotoFormKey, File | null>>
  >({});

  const quickFreqOptions = useMemo(
    () => catalogFrequencyChoices(pricingFreqRows, isCampaignFirstFree),
    [pricingFreqRows, isCampaignFirstFree]
  );

  const isSpecialtyCleaning = cleaningType === "move_out" || cleaningType === "heavy_clean";

  useEffect(() => {
    if (!pricingFreqRows.length) return;
    setForm((f) => {
      if (f.cleaning_frequency_key && f.cleaning_frequency_key.trim()) return f;
      const opts = catalogFrequencyChoices(pricingFreqRows, isCampaignFirstFree);
      const next = isCampaignFirstFree
        ? opts[0]?.value ?? "weekly"
        : opts.find((o) => o.value === "one_time")?.value ?? opts[0]?.value ?? "one_time";
      return { ...f, cleaning_frequency_key: next };
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

  useEffect(() => {
    if (!isSpecialtyCleaning) return;
    setForm((f) => ({ ...f, cleaning_frequency_key: "one_time" }));
  }, [isSpecialtyCleaning, cleaningType]);

  const [submitting, setSubmitting] = useState(false);
  const [handoffVisible, setHandoffVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smsConsent, setSmsConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [specialtyDone, setSpecialtyDone] = useState(false);

  const setSpecialtyPhoto = (key: SpecialtyQuotePhotoFormKey, file: File | null) => {
    setSpecialtyPhotos((prev) => ({ ...prev, [key]: file }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const {
      first_name,
      last_name,
      zip,
      square_footage,
      cleaning_frequency_key,
      email,
      phone,
      street_address,
      city,
      preferred_service_date,
      home_type,
      beds,
      baths,
      specialty_notes,
    } = form;
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

    if (isSpecialtyCleaning) {
      if (!street_address.trim() || !city.trim()) {
        setError("Street address and city are required.");
        return;
      }
      if (!preferred_service_date.trim()) {
        setError("Preferred service date is required.");
        return;
      }
      if (!home_type.trim()) {
        setError("Please select a home type.");
        return;
      }
      if (!beds.trim() || !baths.trim()) {
        setError("Beds and baths are required.");
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
    }

    setSubmitting(true);
    setHandoffVisible(false);
    setError(null);
    setConsentError(null);
    let succeeded = false;
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

      if (isSpecialtyCleaning) {
        const payload = {
          cleaning_type: cleaningType,
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          zip: zip.trim(),
          square_footage: square_footage.trim(),
          street_address: street_address.trim(),
          city: city.trim(),
          preferred_service_date: preferred_service_date.trim(),
          home_type: home_type.trim(),
          beds: beds.trim(),
          baths: baths.trim(),
          notes: specialty_notes.trim() || undefined,
          sms_consent: smsConsent,
          quote_context: {
            source: "quick_quote_modal",
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
        succeeded = true;
        try {
          if (data.person_id) localStorage.setItem("alloy_person_id", data.person_id);
          if (data.opportunity_id) localStorage.setItem("alloy_opportunity_id", data.opportunity_id);
        } catch (e) {
          console.warn("localStorage set failed:", e);
        }
        setSubmitting(false);
        setSpecialtyDone(true);
        onComplete({ kind: "specialty" });
        return;
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
        requestAnimationFrame(() => onComplete({ kind: "standard" }));
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

  if (specialtyDone) {
    return (
      <div className="rounded-xl border border-alloy-juniper/30 bg-alloy-juniper/10 p-6 text-alloy-midnight">
        <p className="text-lg font-semibold text-alloy-pine mb-2">Thanks — we&apos;ve got your details</p>
        <p className="text-sm text-alloy-midnight/80 leading-relaxed">
          Our team will review your photos and property details and follow up with a personalized estimate. For instant
          standard cleaning pricing, you can use{" "}
          <a href="/book-v2" className="text-alloy-juniper font-medium underline">
            book online
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="relative space-y-0">
      {(submitting || handoffVisible) && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-[inherit] bg-white/93 px-6 text-center backdrop-blur-[1px]"
          aria-live="polite"
        >
          <div className="h-10 w-10 rounded-full border-[3px] border-alloy-juniper border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-alloy-midnight">
            {handoffVisible
              ? "Quote saved — opening booking…"
              : isSpecialtyCleaning
                ? "Sending your request…"
                : "Saving your quote…"}
          </p>
        </div>
      )}
      {/* Contact — name & location */}
      <div className="space-y-4 pb-6 border-b border-alloy-stone/50">
        <p className="public-form-section-title">Your details</p>
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
        <p className="public-form-section-title">Home & schedule</p>
        <div>
          <label className={labelBase}>Cleaning type *</label>
          <select
            value={cleaningType}
            onChange={(e) => setCleaningType(e.target.value as CleaningTypeKey)}
            className="public-form-input"
            disabled={isCampaignFirstFree}
          >
            {cleaningTypeSelectOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {isCampaignFirstFree ? (
            <p className="mt-1.5 text-xs text-alloy-midnight/55">This offer applies to standard cleaning only.</p>
          ) : null}
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
        {!isSpecialtyCleaning && (
          <div>
            <label className={labelBase}>Cleaning frequency</label>
            <select
              value={form.cleaning_frequency_key || quickFreqOptions[0]?.value || "one_time"}
              onChange={(e) => setForm((f) => ({ ...f, cleaning_frequency_key: e.target.value }))}
              className="public-form-input"
            >
              {quickFreqOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {isCampaignFirstFree ? (
              <div className="mt-2 space-y-2 text-xs text-alloy-midnight/70 leading-relaxed">
                <p>
                  <strong className="text-alloy-midnight">Recurring cleaning only.</strong>
                </p>
                <p>
                  This offer applies to weekly, every-two-weeks, or monthly standard service — not one-time visits.
                </p>
                <p>
                  <strong className="text-alloy-midnight">Looking for a one-time clean?</strong>
                </p>
                <p>
                  We offer one-time, move-out, or heavy / deep clean services?{" "}
                  {onSwitchToStandardQuote ? (
                    <button
                      type="button"
                      onClick={onSwitchToStandardQuote}
                      className="text-alloy-juniper font-semibold underline underline-offset-2 hover:text-alloy-pine"
                    >
                      Use the regular quote form
                    </button>
                  ) : (
                    <a
                      href="/"
                      className="text-alloy-juniper font-semibold underline underline-offset-2 hover:text-alloy-pine"
                    >
                      Use the regular quote form
                    </a>
                  )}{" "}
                  instead (same quick quote experience, without this promotion).
                </p>
              </div>
            ) : (
              <p className="mt-1.5 text-xs text-alloy-midnight/55">
                Move-out and heavy cleans are priced as one-time jobs; choose those under Cleaning type to add details
                and photos.
              </p>
            )}
          </div>
        )}
        {isSpecialtyCleaning ? (
          <div className="space-y-4 pt-2 border-t border-alloy-stone/40">
            <p className="rounded-lg border border-alloy-juniper/20 bg-alloy-juniper/5 px-3 py-2 text-xs text-alloy-midnight/80 leading-relaxed">
              We need a little more information to give you an accurate quote — the next questions and photos help us
              understand your home.
            </p>
            <p className="text-sm font-medium text-alloy-midnight">Property & photos</p>
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
                  {bedOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
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
                  {bathOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-3">
              <p className={labelBase}>Photos * (one per room)</p>
              <p className="text-xs text-alloy-midnight/60 -mt-1 mb-2">
                JPEG, PNG, or WebP, up to 10MB each. These help us quote accurately.
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
                      setSpecialtyPhoto(key, file);
                    }}
                  />
                </div>
              ))}
            </div>
            <div>
              <label className={labelBase}>Notes (optional)</label>
              <textarea
                value={form.specialty_notes}
                onChange={(e) => setForm((f) => ({ ...f, specialty_notes: e.target.value }))}
                rows={3}
                className="public-form-input resize-none"
                placeholder="Anything else we should know?"
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Contact — email & phone */}
      <div className="space-y-4 py-6 border-b border-alloy-stone/50">
        <p className="public-form-section-title">How we&apos;ll reach you</p>
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
            By checking this box, you agree to receive transactional SMS from Alloy about your quote and appointments.
            Message and data rates may apply. Reply STOP to opt out. Consent is not required to purchase.
          </span>
        </label>
        {consentError && <p className="mt-2 text-sm text-red-600">{consentError}</p>}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="public-form-cta public-btn-primary mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting
          ? "Saving…"
          : isCampaignFirstFree
            ? "Get my recurring quote"
            : isSpecialtyCleaning
              ? "Submit for estimate"
              : "Get my quote"}
      </button>
    </form>
  );
}
