"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { createPortal } from "react-dom";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Match Get a Quote (`CleaningQuickQuoteForm`) label + input tokens */
const labelClass =
  "block text-xs font-semibold text-alloy-midnight/80 tracking-wider mb-1.5";
const inputClass = "public-form-input";
const ctaClass = "public-form-cta w-full disabled:opacity-50 disabled:cursor-not-allowed";

type Vertical = { id: string; name: string; slug: string };

interface VendorApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function VendorApplicationModal({ isOpen, onClose }: VendorApplicationModalProps) {
  const [mounted, setMounted] = useState(false);
  const [verticals, setVerticals] = useState<Vertical[]>([]);
  const [loadingVerticals, setLoadingVerticals] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    company_name: "",
    email: "",
    phone: "",
    address_line1: "",
    city: "",
    state: "",
    postal_code: "",
    owns_supplies: true,
    days_available: [] as string[],
    operating_hours_open: "",
    operating_hours_close: "",
    service_area_zip_codes: [] as string[],
    zipInput: "",
    vertical_ids: [] as string[],
    consent_contractor_agreement: false,
    consent_marketing: false,
    consent_legal: false,
    proof_of_insurance: null as File | null,
    drivers_license: null as File | null,
  });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingVerticals(true);
    fetch("/api/verticals")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setVerticals(data);
      })
      .catch(() => {
        if (!cancelled) setVerticals([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingVerticals(false);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      document.documentElement.style.overflow = "";
      setSubmitError(null);
      setSubmitSuccess(false);
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      document.documentElement.style.overflow = "";
    };
  }, [isOpen]);

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    },
    [isOpen, onClose]
  );
  useEffect(() => {
    if (isOpen) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, handleEsc]);

  const toggleDay = (day: string) => {
    setForm((f) => ({
      ...f,
      days_available: f.days_available.includes(day)
        ? f.days_available.filter((d) => d !== day)
        : [...f.days_available, day],
    }));
  };

  const addZip = () => {
    const zip = form.zipInput.replace(/\D/g, "").slice(0, 5);
    if (zip.length === 5 && !form.service_area_zip_codes.includes(zip)) {
      setForm((f) => ({
        ...f,
        service_area_zip_codes: [...f.service_area_zip_codes, zip],
        zipInput: "",
      }));
    }
  };

  const removeZip = (zip: string) => {
    setForm((f) => ({
      ...f,
      service_area_zip_codes: f.service_area_zip_codes.filter((z) => z !== zip),
    }));
  };

  const handleZipKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addZip();
    }
  };

  const toggleVertical = (id: string) => {
    setForm((f) => ({
      ...f,
      vertical_ids: f.vertical_ids.includes(id)
        ? f.vertical_ids.filter((v) => v !== id)
        : [...f.vertical_ids, id],
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!form.first_name?.trim() || !form.last_name?.trim()) {
      setSubmitError("First and last name are required.");
      return;
    }
    if (!form.email?.trim()) {
      setSubmitError("Email is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setSubmitError("Please enter a valid email address.");
      return;
    }
    if (!form.phone?.trim()) {
      setSubmitError("Phone is required.");
      return;
    }
    if (form.vertical_ids.length === 0) {
      setSubmitError("Select at least one service.");
      return;
    }
    if (!form.consent_contractor_agreement || !form.consent_legal) {
      setSubmitError("You must accept the required agreements.");
      return;
    }
    if (!form.proof_of_insurance || form.proof_of_insurance.size === 0) {
      setSubmitError("Proof of insurance file is required.");
      return;
    }
    if (!form.drivers_license || form.drivers_license.size === 0) {
      setSubmitError("Drivers license file is required.");
      return;
    }

    const invalidZip = form.service_area_zip_codes.find((z) => !/^\d{5}$/.test(z));
    if (invalidZip) {
      setSubmitError("Each zip code must be 5 digits.");
      return;
    }
    if (form.operating_hours_open && form.operating_hours_close && form.operating_hours_open >= form.operating_hours_close) {
      setSubmitError("Operating hours: open must be before close.");
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("first_name", form.first_name.trim());
      fd.set("last_name", form.last_name.trim());
      fd.set("company_name", form.company_name.trim());
      fd.set("email", form.email.trim());
      fd.set("phone", form.phone.trim());
      fd.set("address_line1", form.address_line1.trim());
      fd.set("city", form.city.trim());
      fd.set("state", form.state.trim());
      fd.set("postal_code", form.postal_code.trim());
      fd.set("owns_supplies", form.owns_supplies ? "true" : "false");
      form.days_available.forEach((d) => fd.append("days_available[]", d));
      fd.set("operating_hours_open", form.operating_hours_open);
      fd.set("operating_hours_close", form.operating_hours_close);
      form.service_area_zip_codes.forEach((z) => fd.append("service_area_zip_codes[]", z));
      form.vertical_ids.forEach((id) => fd.append("vertical_ids[]", id));
      fd.set("consent_contractor_agreement", form.consent_contractor_agreement ? "true" : "false");
      fd.set("consent_marketing", form.consent_marketing ? "true" : "false");
      fd.set("consent_legal", form.consent_legal ? "true" : "false");
      fd.set("proof_of_insurance", form.proof_of_insurance);
      fd.set("drivers_license", form.drivers_license);

      const res = await fetch("/api/vendor-application", {
        method: "POST",
        body: fd,
      });
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok || !data.ok) {
        setSubmitError(data.error || "Something went wrong. Please try again.");
        return;
      }
      setSubmitSuccess(true);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseAfterSuccess = () => {
    onClose();
  };

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ touchAction: "none" }}
    >
      <div
        className="bg-white rounded-xl overflow-hidden border border-alloy-stone/20 shadow-sm max-w-2xl w-full flex flex-col"
        style={{ maxHeight: "90dvh" }}
      >
        <div className="sticky top-0 bg-white border-b border-alloy-stone/20 px-4 sm:px-8 py-5 flex items-start justify-between gap-4 z-10 shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-alloy-midnight">Apply to join our team</h2>
            <p className="text-sm text-alloy-midnight/80 mt-1 max-w-xl">
              Tell us about your services and availability. We&apos;ll review your application and follow up shortly.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-alloy-midnight/60 hover:text-alloy-midnight transition-colors p-2 -mr-2 shrink-0 rounded-lg hover:bg-alloy-stone/10"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="p-4 sm:p-8">
            {submitSuccess ? (
              <div className="text-center py-6 sm:py-8">
                <div className="mb-4">
                  <svg className="w-16 h-16 mx-auto text-alloy-juniper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-alloy-midnight mb-2">Application received</h3>
                <p className="text-sm text-alloy-midnight/80 mb-6 max-w-md mx-auto">
                  We&apos;ve received your application and we&apos;re reviewing it. We&apos;ll reach out soon.
                </p>
                <button type="button" onClick={handleCloseAfterSuccess} className={ctaClass}>
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {submitError && <p className="text-sm text-red-600">{submitError}</p>}

                <div>
                  <span className={labelClass}>Services offered *</span>
                  {loadingVerticals ? (
                    <p className="text-sm text-alloy-midnight/60">Loading…</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {verticals.map((v) => (
                        <label
                          key={v.id}
                          className={`inline-flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors ${
                            form.vertical_ids.includes(v.id)
                              ? "border-alloy-juniper/50 bg-alloy-juniper/10 text-alloy-midnight"
                              : "border-alloy-stone/30 bg-white hover:border-alloy-stone/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={form.vertical_ids.includes(v.id)}
                            onChange={() => toggleVertical(v.id)}
                            className="rounded border-alloy-stone/40 text-alloy-juniper focus:ring-alloy-juniper/70"
                          />
                          <span>{v.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className={labelClass} htmlFor="vendor-service-area-zip-input">
                    Service area ZIP codes
                  </label>
                  <p className="text-xs text-alloy-midnight/70 leading-relaxed mb-2">
                    Enter <strong>all service area ZIP codes</strong> you cover (not your business address ZIP alone).
                    We use this list to match you with jobs in your area—<strong>missing ZIPs can mean you won&apos;t see
                    offers</strong> for customers there.
                  </p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {form.service_area_zip_codes.map((z) => (
                      <span
                        key={z}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-alloy-stone/15 border border-alloy-stone/25 rounded-lg text-sm"
                      >
                        {z}
                        <button type="button" onClick={() => removeZip(z)} className="text-alloy-midnight/60 hover:text-alloy-midnight" aria-label={`Remove ${z}`}>&times;</button>
                      </span>
                    ))}
                  </div>
                  <input
                    id="vendor-service-area-zip-input"
                    type="text"
                    value={form.zipInput}
                    onChange={(e) => setForm((f) => ({ ...f, zipInput: e.target.value }))}
                    onKeyDown={handleZipKeyDown}
                    onBlur={addZip}
                    placeholder="Type ZIP and press Enter"
                    className={inputClass}
                    maxLength={5}
                    autoComplete="off"
                  />
                </div>

                <div>
                  <span className={labelClass}>Own supplies?</span>
                  <div className="flex gap-4">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="owns_supplies"
                        checked={form.owns_supplies === true}
                        onChange={() => setForm((f) => ({ ...f, owns_supplies: true }))}
                        className="text-alloy-juniper focus:ring-alloy-juniper/70"
                      />
                      <span className="text-sm">Yes</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="owns_supplies"
                        checked={form.owns_supplies === false}
                        onChange={() => setForm((f) => ({ ...f, owns_supplies: false }))}
                        className="text-alloy-juniper focus:ring-alloy-juniper/70"
                      />
                      <span className="text-sm">No</span>
                    </label>
                  </div>
                </div>

                <div>
                  <span className={labelClass}>Days available</span>
                  <div className="flex flex-wrap gap-3">
                    {DAYS.map((d) => (
                      <label key={d} className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.days_available.includes(d)}
                          onChange={() => toggleDay(d)}
                            className="rounded border-alloy-stone/40 text-alloy-juniper focus:ring-alloy-juniper/70"
                        />
                        <span className="text-sm">{d}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Operating hours (open)</label>
                    <input
                      type="time"
                      value={form.operating_hours_open}
                      onChange={(e) => setForm((f) => ({ ...f, operating_hours_open: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Operating hours (close)</label>
                    <input
                      type="time"
                      value={form.operating_hours_close}
                      onChange={(e) => setForm((f) => ({ ...f, operating_hours_close: e.target.value }))}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>First name *</label>
                    <input
                      type="text"
                      value={form.first_name}
                      onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                      className={inputClass}
                      required
                      autoComplete="given-name"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Last name *</label>
                    <input
                      type="text"
                      value={form.last_name}
                      onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                      className={inputClass}
                      required
                      autoComplete="family-name"
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Company / business name</label>
                  <input
                    type="text"
                    value={form.company_name}
                    onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                    className={inputClass}
                    placeholder="Optional — helps when several people share one vendor"
                    autoComplete="organization"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Email *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      className={inputClass}
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Phone *</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      className={inputClass}
                      required
                      autoComplete="tel"
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Address</label>
                  <input
                    type="text"
                    value={form.address_line1}
                    onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))}
                    placeholder="Street address"
                    className={inputClass}
                    autoComplete="street-address"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="col-span-2 sm:col-span-2">
                    <label className={labelClass}>City</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                      className={inputClass}
                      autoComplete="address-level2"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>State</label>
                    <input
                      type="text"
                      value={form.state}
                      onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                      className={inputClass}
                      autoComplete="address-level1"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ZIP</label>
                    <input
                      type="text"
                      value={form.postal_code}
                      onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                      className={inputClass}
                      autoComplete="postal-code"
                      maxLength={10}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Proof of insurance *</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setForm((f) => ({ ...f, proof_of_insurance: e.target.files?.[0] ?? null }))}
                    className={inputClass}
                    required
                  />
                </div>

                <div>
                  <label className={labelClass}>Drivers license *</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setForm((f) => ({ ...f, drivers_license: e.target.files?.[0] ?? null }))}
                    className={inputClass}
                    required
                  />
                </div>

                <div className="space-y-3 border-t border-alloy-stone/20 pt-5">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.consent_contractor_agreement}
                      onChange={(e) => setForm((f) => ({ ...f, consent_contractor_agreement: e.target.checked }))}
                      className="mt-1 rounded border-alloy-stone/40 text-alloy-juniper focus:ring-alloy-juniper/70"
                    />
                    <span className="text-sm text-alloy-midnight">I agree to the contractor agreement. *</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.consent_marketing}
                      onChange={(e) => setForm((f) => ({ ...f, consent_marketing: e.target.checked }))}
                      className="mt-1 rounded border-alloy-stone/40 text-alloy-juniper focus:ring-alloy-juniper/70"
                    />
                    <span className="text-sm text-alloy-midnight">I agree to receive marketing communications.</span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.consent_legal}
                      onChange={(e) => setForm((f) => ({ ...f, consent_legal: e.target.checked }))}
                      className="mt-1 rounded border-alloy-stone/40 text-alloy-juniper focus:ring-alloy-juniper/70"
                    />
                    <span className="text-sm text-alloy-midnight">I agree to the legal terms. *</span>
                  </label>
                </div>

                <div className="pt-2">
                  <button type="submit" disabled={submitting} className={ctaClass}>
                    {submitting ? "Submitting…" : "Submit application"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
