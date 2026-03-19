"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import FirstFree4x60TermsPlaceholder from "@/components/offers/FirstFree4x60TermsPlaceholder";
import { trackMetaEvent } from "@/lib/metaPixel";
import {
  FIRSTFREE4X60_CAMPAIGN_QUERY,
  FIRSTFREE4X60_DISCOUNT_PROGRAM_CODE,
  FIRSTFREE4X60_SESSION_KEY,
  type FirstFree4x60SessionV1,
} from "@/lib/campaigns/firstFree4x60";
import { mergeFirstFreeCampaignBookingPrefill } from "@/lib/campaigns/mergeFirstFreeCampaignPrefill";
import { validateDiscountCodeForBooking } from "@/lib/campaigns/validateProgramDiscountClient";
import { getBookingPath } from "@/lib/booking";

interface FirstFreeTermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FirstFreeTermsModal({ isOpen, onClose }: FirstFreeTermsModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [transitionState, setTransitionState] = useState<"entering" | "entered">("entering");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [continueBusy, setContinueBusy] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setTransitionState("entering");
      setTermsAccepted(false);
      setTermsError(null);
      return;
    }
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setTransitionState("entered"));
    });
    return () => cancelAnimationFrame(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      document.documentElement.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    if (isOpen) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

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
        setTermsError("Your quote was not found. Please complete the quote form again from the homepage.");
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
        setTermsError("Could not read a valid quote total. Please complete the quote form again.");
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

      mergeFirstFreeCampaignBookingPrefill({
        email,
        phone,
        discount_program_id: validated.prefill.discount_program_id,
        discount_program_code: validated.prefill.discount_program_code,
        discount_program_name: validated.prefill.discount_program_name,
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
        landing_path: "/?campaign=firstfree4x60",
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
      onClose();
      router.push(dest);
    } catch (e) {
      setTermsError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setContinueBusy(false);
    }
  };

  if (!isOpen || !mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 public-modal-overlay"
      data-state={transitionState}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ touchAction: "none" }}
    >
      <div
        className="public-modal-shell public-modal-shell-premium max-w-lg w-full flex flex-col overflow-hidden"
        style={{ maxHeight: "90dvh" }}
        data-state={transitionState}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-alloy-stone/25 px-5 sm:px-6 py-4 flex items-center justify-between z-10 shrink-0 rounded-t-[1.375rem]">
          <h2 className="text-lg sm:text-xl font-bold text-alloy-pine tracking-tight">Offer terms</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-alloy-midnight/60 hover:text-alloy-midnight hover:bg-alloy-stone/80 rounded-lg transition-colors p-2 -mr-2"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <p className="text-sm text-alloy-midnight/80 mb-4">
            Please read and accept the terms for the <strong>first cleaning</strong> promotional offer before booking.
          </p>
          <FirstFree4x60TermsPlaceholder />
          <label className="flex items-start gap-3 text-sm text-alloy-midnight cursor-pointer mt-4">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => {
                const v = e.target.checked;
                setTermsAccepted(v);
                if (v) setTermsError(null);
              }}
              className="mt-1 h-4 w-4 rounded border-alloy-stone/60 text-alloy-juniper focus:ring-alloy-juniper"
            />
            <span>
              I agree to the Terms &amp; Conditions for this promotional offer ({FIRSTFREE4X60_DISCOUNT_PROGRAM_CODE}).
            </span>
          </label>
          {termsError && <p className="text-sm text-red-600 mt-3">{termsError}</p>}
          <button
            type="button"
            disabled={continueBusy}
            onClick={handleContinueToBook}
            className="w-full mt-6 home-quote-cta-pine quote-cta-bend-pine public-btn-primary !text-white font-semibold px-6 py-3 rounded-lg disabled:opacity-50"
          >
            {continueBusy ? "Applying offer…" : "Continue to booking"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
