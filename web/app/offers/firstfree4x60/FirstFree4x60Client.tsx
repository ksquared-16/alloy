"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Section from "@/components/Section";
import PublicPageShell from "@/components/PublicPageShell";
import FirstFree4x60TermsPlaceholder from "@/components/offers/FirstFree4x60TermsPlaceholder";
import { trackMetaEvent } from "@/lib/metaPixel";
import { useQuoteModal } from "@/lib/quoteModal";
import {
  FIRSTFREE4X60_CAMPAIGN_QUERY,
  FIRSTFREE4X60_DISCOUNT_PROGRAM_CODE,
  FIRSTFREE4X60_SESSION_KEY,
  type FirstFree4x60SessionV1,
} from "@/lib/campaigns/firstFree4x60";
import { validateDiscountCodeForBooking } from "@/lib/campaigns/validateProgramDiscountClient";
import { getBookingPath } from "@/lib/booking";

type Step = "landing" | "terms";

export default function FirstFree4x60Client() {
  const router = useRouter();
  const { openModal } = useQuoteModal();
  const [step, setStep] = useState<Step>("landing");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [continueBusy, setContinueBusy] = useState(false);

  const mergeBookingPrefill = useCallback((patch: Record<string, unknown>) => {
    if (typeof window === "undefined") return;
    try {
      const raw =
        sessionStorage.getItem("alloy_booking_prefill") || localStorage.getItem("alloy_booking_prefill");
      let base: Record<string, unknown> = {};
      if (raw) {
        try {
          base = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          base = {};
        }
      }
      const next = {
        ...base,
        ...patch,
        campaign: FIRSTFREE4X60_CAMPAIGN_QUERY,
        discount_program_code: FIRSTFREE4X60_DISCOUNT_PROGRAM_CODE,
        campaign_source: "offers/firstfree4x60",
      };
      const json = JSON.stringify(next);
      sessionStorage.setItem("alloy_booking_prefill", json);
      localStorage.setItem("alloy_booking_prefill", json);
    } catch (e) {
      console.warn("[FIRSTFREE4X60] prefill merge failed", e);
    }
  }, []);

  const handleCampaignQuoteComplete = useCallback(() => {
    mergeBookingPrefill({});
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("alloy_quote_v1") : null;
      if (raw) {
        const q = JSON.parse(raw) as { first_clean_price?: number; estimated_price?: number };
        trackMetaEvent("Lead", {
          vertical: "cleaning",
          flow: "quote",
          campaign: FIRSTFREE4X60_DISCOUNT_PROGRAM_CODE,
          firstfree4x60_step: "quote_submitted",
          estimated_price: q.first_clean_price ?? q.estimated_price ?? undefined,
        });
      }
    } catch {
      // ignore
    }
    setStep("terms");
  }, [mergeBookingPrefill]);

  const openCampaignQuoteModal = useCallback(() => {
    openModal({
      defaultService: "cleaning",
      campaignQuoteFlow: "firstfree4x60",
      onCampaignQuoteComplete: handleCampaignQuoteComplete,
    });
  }, [openModal, handleCampaignQuoteComplete]);

  /** Open the shared quote modal as soon as the landing step is shown (no CTA click required). */
  useEffect(() => {
    if (step !== "landing") return;
    const run = () => openCampaignQuoteModal();
    if (typeof queueMicrotask === "function") {
      queueMicrotask(run);
    } else {
      void Promise.resolve().then(run);
    }
  }, [step, openCampaignQuoteModal]);

  const handleContinueToBook = async () => {
    setTermsError(null);
    if (!termsAccepted) {
      setTermsError("Please confirm you agree to the Terms & Conditions to continue.");
      return;
    }

    setContinueBusy(true);
    try {
      const rawQuote =
        typeof window !== "undefined"
          ? localStorage.getItem("alloy_quote_v1") || sessionStorage.getItem("alloy_quote_v1")
          : null;
      if (!rawQuote) {
        setTermsError("Your quote was not found. Please get a quote again using the button above.");
        setContinueBusy(false);
        return;
      }
      const quote = JSON.parse(rawQuote) as {
        first_clean_price?: number;
        estimated_price?: number;
        email?: string;
        phone?: string;
      };
      const subtotal =
        typeof quote.first_clean_price === "number" && quote.first_clean_price > 0
          ? quote.first_clean_price
          : typeof quote.estimated_price === "number" && quote.estimated_price > 0
            ? quote.estimated_price
            : 0;
      if (subtotal <= 0) {
        setTermsError("Could not read a valid quote total. Please get a quote again.");
        setContinueBusy(false);
        return;
      }

      const prefillRaw =
        sessionStorage.getItem("alloy_booking_prefill") || localStorage.getItem("alloy_booking_prefill");
      let email: string | undefined;
      let phone: string | undefined;
      if (prefillRaw) {
        try {
          const p = JSON.parse(prefillRaw) as { email?: string; phone?: string };
          email = p.email;
          phone = p.phone;
        } catch {
          // ignore
        }
      }
      email = email || quote.email;
      phone = phone || quote.phone;

      const validated = await validateDiscountCodeForBooking({
        code: FIRSTFREE4X60_DISCOUNT_PROGRAM_CODE,
        email,
        phone,
        quoteSubtotal: subtotal,
      });

      if (!validated.ok) {
        setTermsError(
          validated.message ||
            "We could not apply this offer automatically. You can continue to booking and enter the code manually, or contact us for help."
        );
        setContinueBusy(false);
        return;
      }

      mergeBookingPrefill({
        email,
        phone,
        discount_code: validated.prefill.discount_code,
        discount_code_id: validated.prefill.discount_code_id,
        discount_amount: validated.prefill.discount_amount,
        quote_total: validated.prefill.quote_total,
      });

      const session: FirstFree4x60SessionV1 = {
        version: 1,
        campaign: FIRSTFREE4X60_CAMPAIGN_QUERY,
        discount_program_code: FIRSTFREE4X60_DISCOUNT_PROGRAM_CODE,
        terms_accepted_at: new Date().toISOString(),
        landing_path: "/offers/firstfree4x60",
      };
      try {
        sessionStorage.setItem(FIRSTFREE4X60_SESSION_KEY, JSON.stringify(session));
      } catch {
        // ignore
      }

      trackMetaEvent("Lead", {
        vertical: "cleaning",
        flow: "book",
        campaign: FIRSTFREE4X60_DISCOUNT_PROGRAM_CODE,
        firstfree4x60_step: "terms_accepted",
      });

      const bookPath = getBookingPath();
      const dest = `${bookPath}?campaign=${encodeURIComponent(FIRSTFREE4X60_CAMPAIGN_QUERY)}`;
      router.push(dest);
    } catch (e) {
      setTermsError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setContinueBusy(false);
    }
  };

  return (
    <PublicPageShell>
      <div className="py-8 md:py-12">
        <Section className="max-w-3xl">
          <div className="space-y-8">
            {step === "landing" && (
              <div className="space-y-6">
                <header className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-alloy-juniper">Limited offer</p>
                  <h1 className="text-2xl md:text-3xl font-bold text-alloy-midnight leading-tight">
                    First cleaning on us — complete 4 visits in 60 days
                  </h1>
                  <p className="text-sm md:text-base text-alloy-midnight/80 leading-relaxed">
                    Get a quote for recurring standard home cleaning. After you review the offer terms, we&apos;ll take you
                    to booking with your promo applied.
                  </p>
                  <p className="text-sm text-alloy-midnight/70 leading-relaxed">
                    Recurring plans only (weekly, every 2 weeks, or monthly). Standard cleaning only — not valid for
                    one-time only or move-out / heavy clean.
                  </p>
                  <p className="text-xs text-alloy-midnight/55 pt-1">
                    Your quote form should open automatically. If it didn&apos;t, use the button below.
                  </p>
                </header>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={openCampaignQuoteModal}
                    className="text-sm font-semibold text-alloy-juniper hover:text-alloy-juniper/90 underline-offset-2 hover:underline text-left sm:text-center"
                  >
                    Open quote form
                  </button>
                </div>
              </div>
            )}

            {step === "terms" && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-alloy-stone/20 shadow-sm p-5 md:p-8 space-y-4">
                  <h2 className="text-lg font-bold text-alloy-midnight">Offer terms</h2>
                  <p className="text-sm text-alloy-midnight/80">
                    Please read the summary below and confirm before continuing to schedule.
                  </p>
                  <FirstFree4x60TermsPlaceholder />
                  <label className="flex items-start gap-3 text-sm text-alloy-midnight cursor-pointer">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-alloy-stone/60 text-alloy-juniper focus:ring-alloy-juniper"
                    />
                    <span>
                      I agree to the Terms &amp; Conditions for this promotional offer ({FIRSTFREE4X60_DISCOUNT_PROGRAM_CODE}
                      ).
                    </span>
                  </label>
                  {termsError && <p className="text-sm text-red-600">{termsError}</p>}
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      type="button"
                      disabled={continueBusy}
                      onClick={handleContinueToBook}
                      className="home-quote-cta-pine quote-cta-bend-pine public-btn-primary !text-white font-semibold px-6 py-3 rounded-lg disabled:opacity-50"
                    >
                      {continueBusy ? "Applying offer…" : "Continue to booking"}
                    </button>
                    <button
                      type="button"
                      disabled={continueBusy}
                      onClick={() => {
                        setStep("landing");
                        setTermsAccepted(false);
                        setTermsError(null);
                      }}
                      className="px-6 py-3 rounded-lg border border-alloy-stone/40 text-alloy-midnight font-medium hover:bg-alloy-stone/10"
                    >
                      Back to offer
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Section>
      </div>
    </PublicPageShell>
  );
}
