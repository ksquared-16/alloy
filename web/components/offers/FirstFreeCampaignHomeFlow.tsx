"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuoteModal } from "@/lib/quoteModal";
import {
  FIRSTFREE4X120_DISCOUNT_PROGRAM_CODE,
  isFirstFree4x120CampaignQuery,
} from "@/lib/campaigns/firstFree4x120";
import { isFirstFreeQaShimEnabled } from "@/lib/campaigns/firstFreeQaShim";
import { mergeFirstFreeCampaignBookingPrefill } from "@/lib/campaigns/mergeFirstFreeCampaignPrefill";
import { trackMetaEvent } from "@/lib/metaPixel";
import FirstFreeTermsModal from "@/components/offers/FirstFreeTermsModal";

/** Single source of truth so we don’t auto-reopen the quote modal after advancing to terms. */
type FirstFreeFlowPhase = "quote_modal" | "terms_modal";

function FirstFreeCampaignHomeFlowInner() {
  const searchParams = useSearchParams();
  const campaignParam = searchParams.get("campaign");
  const { openModal } = useQuoteModal();
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const flowPhaseRef = useRef<FirstFreeFlowPhase>("quote_modal");

  const handleQuoteStepComplete = useCallback(() => {
    flowPhaseRef.current = "terms_modal";
    mergeFirstFreeCampaignBookingPrefill({});
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("alloy_quote_v1") : null;
      if (raw) {
        const q = JSON.parse(raw) as { first_clean_price?: number; estimated_price?: number };
        trackMetaEvent("Lead", {
          vertical: "cleaning",
          flow: "quote",
          campaign: FIRSTFREE4X120_DISCOUNT_PROGRAM_CODE,
          firstfree4x120_step: "quote_submitted",
          estimated_price: q.first_clean_price ?? q.estimated_price ?? undefined,
        });
      }
    } catch {
      // ignore
    }
    setTermsModalOpen(true);
  }, []);

  useEffect(() => {
    if (!isFirstFree4x120CampaignQuery(campaignParam)) {
      flowPhaseRef.current = "quote_modal";
      return;
    }

    const qaSkipQuote =
      isFirstFreeQaShimEnabled() && searchParams.get("qa_firstfree_terms") === "1";
    if (qaSkipQuote) {
      flowPhaseRef.current = "terms_modal";
      const email = searchParams.get("qa_email")?.trim() || "qa-firstfree@example.invalid";
      const phone = searchParams.get("qa_phone")?.trim() || "+15555550123";
      const rawSub = searchParams.get("qa_subtotal");
      const parsed = rawSub != null ? Number.parseFloat(rawSub) : NaN;
      const subtotal = Number.isFinite(parsed) && parsed > 0 ? parsed : 265;
      try {
        const quotePayload = {
          first_clean_price: subtotal,
          estimated_price: subtotal,
          email,
          phone,
        };
        localStorage.setItem("alloy_quote_v1", JSON.stringify(quotePayload));
        sessionStorage.setItem("alloy_quote_v1", JSON.stringify(quotePayload));
        mergeFirstFreeCampaignBookingPrefill({ email, phone });
      } catch {
        // ignore
      }
      if (typeof console !== "undefined" && console.warn) {
        console.warn(
          "[FIRSTFREE4X120 QA] Skipped quote modal (NEXT_PUBLIC_ALLOY_FIRSTFREE_QA_SHIM). Opened terms with stub quote."
        );
      }
      setTermsModalOpen(true);
      return;
    }

    if (flowPhaseRef.current !== "quote_modal") return;
    const run = () => {
      openModal({
        defaultService: "cleaning",
        campaignQuoteFlow: "firstfree4x120",
        onCampaignQuoteComplete: handleQuoteStepComplete,
      });
    };
    if (typeof queueMicrotask === "function") {
      queueMicrotask(run);
    } else {
      void Promise.resolve().then(run);
    }
  }, [campaignParam, openModal, handleQuoteStepComplete, searchParams]);

  if (!isFirstFree4x120CampaignQuery(campaignParam)) return null;

  return (
    <FirstFreeTermsModal
      isOpen={termsModalOpen}
      onClose={() => {
        setTermsModalOpen(false);
        flowPhaseRef.current = "quote_modal";
      }}
    />
  );
}

/**
 * Homepage (and any page that mounts this): `/?campaign=firstfree4x120` (or legacy `firstfree4x60`) opens the quote modal, then terms modal, then booking.
 */
export default function FirstFreeCampaignHomeFlow() {
  return (
    <Suspense fallback={null}>
      <FirstFreeCampaignHomeFlowInner />
    </Suspense>
  );
}
