"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type DefaultService = "cleaning" | "gutters" | null;

interface QuoteModalContextType {
  isOpen: boolean;
  defaultService: DefaultService;
  openModal: (options?: { defaultService?: "cleaning" | "gutters" }) => void;
  closeModal: () => void;
}

const QuoteModalContext = createContext<QuoteModalContextType | undefined>(undefined);

export function QuoteModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [defaultService, setDefaultService] = useState<DefaultService>(null);

  const openModal = (options?: { defaultService?: "cleaning" | "gutters" }) => {
    setDefaultService(options?.defaultService || null);
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    // Reset defaultService when modal closes
    setDefaultService(null);
  };

  return (
    <QuoteModalContext.Provider value={{ isOpen, defaultService, openModal, closeModal }}>
      {children}
    </QuoteModalContext.Provider>
  );
}

export function useQuoteModal() {
  const context = useContext(QuoteModalContext);
  if (context === undefined) {
    throw new Error("useQuoteModal must be used within a QuoteModalProvider");
  }
  return context;
}

