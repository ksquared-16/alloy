"use client";

import { createContext, useContext, useState, useRef, useCallback, useMemo, ReactNode } from "react";

type DefaultService = "cleaning" | "gutters" | null;

/** Campaign flows that use the same modal shell + constrained quick quote, then custom handoff (e.g. T&C page). */
export type CampaignQuoteFlowId = "firstfree4x60";

interface QuoteModalContextType {
  isOpen: boolean;
  defaultService: DefaultService;
  /** When set, cleaning quote uses campaign constraints and custom post-submit handoff. */
  campaignQuoteFlow: CampaignQuoteFlowId | null;
  /** Run after campaign quote saves (ref-backed — never pass callbacks through useState). */
  invokeCampaignQuoteComplete: () => void;
  openModal: (options?: {
    defaultService?: "cleaning" | "gutters";
    campaignQuoteFlow?: CampaignQuoteFlowId | null;
    /** Called after quote is saved and modal closes (e.g. advance landing page to T&C). */
    onCampaignQuoteComplete?: () => void;
  }) => void;
  closeModal: () => void;
}

const QuoteModalContext = createContext<QuoteModalContextType | undefined>(undefined);

export function QuoteModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [defaultService, setDefaultService] = useState<DefaultService>(null);
  const [campaignQuoteFlow, setCampaignQuoteFlow] = useState<CampaignQuoteFlowId | null>(null);
  /**
   * Callbacks must live in a ref: setState(fn) treats fn as an updater and CALLS it.
   * @see https://react.dev/reference/react/useState#im-trying-to-set-state-to-a-function-but-it-gets-called-instead
   */
  const onCampaignQuoteCompleteRef = useRef<(() => void) | null>(null);

  const invokeCampaignQuoteComplete = useCallback(() => {
    onCampaignQuoteCompleteRef.current?.();
  }, []);

  /** Stable identity required: consumers (e.g. campaign useEffect) must not re-run on every provider render. */
  const openModal = useCallback((options?: {
    defaultService?: "cleaning" | "gutters";
    campaignQuoteFlow?: CampaignQuoteFlowId | null;
    onCampaignQuoteComplete?: () => void;
  }) => {
    onCampaignQuoteCompleteRef.current = options?.onCampaignQuoteComplete ?? null;
    setDefaultService(options?.defaultService || null);
    setCampaignQuoteFlow(options?.campaignQuoteFlow ?? null);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setDefaultService(null);
    setCampaignQuoteFlow(null);
    onCampaignQuoteCompleteRef.current = null;
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      defaultService,
      campaignQuoteFlow,
      invokeCampaignQuoteComplete,
      openModal,
      closeModal,
    }),
    [isOpen, defaultService, campaignQuoteFlow, invokeCampaignQuoteComplete, openModal, closeModal]
  );

  return (
    <QuoteModalContext.Provider value={value}>
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

