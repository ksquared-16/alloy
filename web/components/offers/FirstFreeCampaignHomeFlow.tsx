"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuoteModal } from "@/lib/quoteModal";
import {
  FIRSTFREE4X120_DISCOUNT_PROGRAM_CODE,
  isFirstFree4x120CampaignQuery,
} from "@/lib/campaigns/firstFree4x120";
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
  }, [campaignParam, openModal, handleQuoteStepComplete]);

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
