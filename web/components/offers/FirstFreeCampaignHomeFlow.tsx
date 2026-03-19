"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuoteModal } from "@/lib/quoteModal";
import {
  FIRSTFREE4X60_DISCOUNT_PROGRAM_CODE,
  isFirstFree4x60CampaignQuery,
} from "@/lib/campaigns/firstFree4x60";
import { mergeFirstFreeCampaignBookingPrefill } from "@/lib/campaigns/mergeFirstFreeCampaignPrefill";
import { trackMetaEvent } from "@/lib/metaPixel";
import FirstFreeTermsModal from "@/components/offers/FirstFreeTermsModal";

function FirstFreeCampaignHomeFlowInner() {
  const searchParams = useSearchParams();
  const campaignParam = searchParams.get("campaign");
  const { openModal } = useQuoteModal();
  const [termsModalOpen, setTermsModalOpen] = useState(false);

  const handleQuoteStepComplete = useCallback(() => {
    mergeFirstFreeCampaignBookingPrefill({});
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
    setTermsModalOpen(true);
  }, []);

  useEffect(() => {
    if (!isFirstFree4x60CampaignQuery(campaignParam)) return;
    const run = () => {
      openModal({
        defaultService: "cleaning",
        campaignQuoteFlow: "firstfree4x60",
        onCampaignQuoteComplete: handleQuoteStepComplete,
      });
    };
    if (typeof queueMicrotask === "function") {
      queueMicrotask(run);
    } else {
      void Promise.resolve().then(run);
    }
  }, [campaignParam, openModal, handleQuoteStepComplete]);

  if (!isFirstFree4x60CampaignQuery(campaignParam)) return null;

  return (
    <FirstFreeTermsModal isOpen={termsModalOpen} onClose={() => setTermsModalOpen(false)} />
  );
}

/**
 * Homepage (and any page that mounts this): `/?campaign=firstfree4x60` opens the quote modal, then terms modal, then /book-v2.
 */
export default function FirstFreeCampaignHomeFlow() {
  return (
    <Suspense fallback={null}>
      <FirstFreeCampaignHomeFlowInner />
    </Suspense>
  );
}
