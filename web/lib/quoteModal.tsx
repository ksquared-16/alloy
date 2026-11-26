"use client";

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";

/**
 * The public quote modal.
 *
 * It used to carry two verticals and a campaign flow. The legacy home-cleaning product was retired
 * (`ea3eaf377`, July 2026) and its residual front end removed, so one service remains and the modal no
 * longer has anything to choose between or any campaign to constrain. `defaultService`,
 * `campaignQuoteFlow` and the campaign completion callback went with it — including the ref that
 * existed only because a callback in `useState` would have been invoked as an updater.
 */
interface QuoteModalContextType {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const QuoteModalContext = createContext<QuoteModalContextType | undefined>(undefined);

export function QuoteModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  /** Stable identity: consumers may call this from an effect. */
  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ isOpen, openModal, closeModal }), [isOpen, openModal, closeModal]);

  return <QuoteModalContext.Provider value={value}>{children}</QuoteModalContext.Provider>;
}

export function useQuoteModal() {
  const context = useContext(QuoteModalContext);
  if (context === undefined) {
    throw new Error("useQuoteModal must be used within a QuoteModalProvider");
  }
  return context;
}
