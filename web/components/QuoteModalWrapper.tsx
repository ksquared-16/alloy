"use client";

import { useQuoteModal } from "@/lib/quoteModal";
import QuoteModal from "@/components/QuoteModal";

export default function QuoteModalWrapper() {
  const { isOpen, closeModal, defaultService } = useQuoteModal();
  return <QuoteModal isOpen={isOpen} onClose={closeModal} defaultService={defaultService} />;
}

