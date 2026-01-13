"use client";

import { useQuoteModal } from "@/lib/quoteModal";
import QuoteModal from "@/components/QuoteModal";

export default function QuoteModalWrapper() {
  const { isOpen, closeModal } = useQuoteModal();
  return <QuoteModal isOpen={isOpen} onClose={closeModal} />;
}

