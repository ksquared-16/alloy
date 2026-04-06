"use client";

import { useQuoteModal } from "@/lib/quoteModal";
import QuoteModal from "@/components/QuoteModal";

export default function QuoteModalWrapper() {
  const { isOpen, closeModal, openModal, defaultService, campaignQuoteFlow, invokeCampaignQuoteComplete } =
    useQuoteModal();
  return (
    <QuoteModal
      isOpen={isOpen}
      onClose={closeModal}
      openModal={openModal}
      defaultService={defaultService}
      campaignQuoteFlow={campaignQuoteFlow}
      invokeCampaignQuoteComplete={invokeCampaignQuoteComplete}
    />
  );
}

