"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import CleaningQuickQuoteForm from "@/components/cleaning/CleaningQuickQuoteForm";
import GutterLeadForm from "@/components/gutters/GutterLeadForm";
import { REDIRECT_DELAY_MS } from "@/lib/ui";
import type { CampaignQuoteFlowId } from "@/lib/quoteModal";

type SelectedVertical = "cleaning" | "gutters" | null;
type ModalStep = "picker" | "form" | "submitted";

interface QuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultService?: "cleaning" | "gutters" | null;
  campaignQuoteFlow?: CampaignQuoteFlowId | null;
  invokeCampaignQuoteComplete?: () => void;
}

export default function QuoteModal({
  isOpen,
  onClose,
  defaultService,
  campaignQuoteFlow = null,
  invokeCampaignQuoteComplete,
}: QuoteModalProps) {
  const router = useRouter();
  const [selectedVertical, setSelectedVertical] = useState<SelectedVertical>(null);
  const [modalStep, setModalStep] = useState<ModalStep>("picker");
  const [mounted, setMounted] = useState(false);
  const [transitionState, setTransitionState] = useState<"entering" | "entered">("entering");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setTransitionState("entering");
      return;
    }
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setTransitionState("entered"));
    });
    return () => cancelAnimationFrame(t);
  }, [isOpen]);

  // When modal opens with defaultService, show that service's form (no redirect)
  useEffect(() => {
    if (isOpen && defaultService === "cleaning") {
      setSelectedVertical("cleaning");
      setModalStep("form");
    } else if (isOpen && defaultService === "gutters") {
      setSelectedVertical("gutters");
      setModalStep("form");
    } else if (isOpen && !defaultService) {
      setSelectedVertical(null);
      setModalStep("picker");
    }
  }, [isOpen, defaultService]);

  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when modal is open (lock background)
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      // Also prevent scroll on html element for iOS
      document.documentElement.style.overflow = "hidden";
    } else {
      // Restore body scroll when modal closes
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      document.documentElement.style.overflow = "";
      // Reset state when modal closes
      setSelectedVertical(null);
      setModalStep("picker");
    }

    return () => {
      // Cleanup on unmount
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      document.documentElement.style.overflow = "";
    };
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
    }

    return () => {
      document.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) {
    return null;
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 public-modal-overlay"
      data-state={transitionState}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{ touchAction: "none" }}
    >
      <div
        className="public-modal-shell public-modal-shell-premium max-w-4xl w-full flex flex-col overflow-hidden"
        style={{ maxHeight: "90dvh" }}
        data-state={transitionState}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="sticky top-0 bg-white border-b border-alloy-stone/25 px-5 sm:px-6 py-4 flex items-center justify-between z-10 shrink-0 rounded-t-[1.375rem]">
          <h2 className="text-lg sm:text-xl font-bold text-alloy-pine tracking-tight">
            {modalStep === "submitted"
              ? selectedVertical === "cleaning"
                ? "Your Quote"
                : "Thank You!"
              : selectedVertical === null
                ? "What service do you need?"
                : selectedVertical === "cleaning"
                  ? campaignQuoteFlow === "firstfree4x120"
                    ? "Get your recurring quote"
                    : "Get a cleaning quote"
                  : "Get early access"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-alloy-midnight/60 hover:text-alloy-midnight hover:bg-alloy-stone/80 rounded-lg transition-colors p-2 -mr-2"
            aria-label="Close modal"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain transition-opacity duration-200"
          style={{ WebkitOverflowScrolling: "touch" }}
          data-modal-content
        >
          <div className="p-4 sm:p-6">
            {modalStep === "submitted" && selectedVertical === "gutters" ? (
              // Submitted view only for gutters (cleaning goes directly to /book)
              <div className="space-y-6">
                <div className="text-center">
                  <div className="mb-4">
                    <svg
                      className="w-16 h-16 mx-auto text-alloy-juniper"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-alloy-midnight mb-2">
                    Thank You!
                  </h3>
                  <p className="text-alloy-midnight/70 mb-6">
                    We&apos;ve received your request. We&apos;ll be in touch soon!
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-3 bg-alloy-blue text-white font-semibold rounded-lg hover:bg-alloy-blue/90 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : selectedVertical === null ? (
              // Service Selection (re-enters with slide when coming back)
              <div className="public-picker-step space-y-6">
                <p className="text-alloy-midnight/80 text-center text-sm md:text-base">
                  Select a service to get started.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
                  {/* Cleaning Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVertical("cleaning");
                      setModalStep("form");
                    }}
                    className="public-modal-service-card group"
                    data-stagger="0"
                  >
                    <div className="public-modal-service-icon flex items-center justify-center rounded-2xl bg-alloy-blue/8 p-5 w-20 h-20 mx-auto mb-4 ring-1 ring-alloy-blue/10 group-hover:bg-alloy-blue/12 group-hover:ring-alloy-juniper/20 transition-all duration-200">
                      <img
                        src="/icons/vacuum-blue.png"
                        alt=""
                        width={48}
                        height={48}
                        className="w-12 h-12 object-contain"
                      />
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-alloy-juniper mb-2 inline-block">
                      Available now
                    </span>
                    <h3 className="text-xl font-bold text-alloy-pine mb-2 tracking-tight">
                      Home Cleaning
                    </h3>
                    <p className="text-alloy-midnight/70 mb-5 text-sm flex-grow leading-relaxed">
                      Professional home cleaning services.
                    </p>
                    <div className="mt-auto">
                      <span className="public-cta-appearance block w-full text-center">
                        Get a cleaning quote
                      </span>
                    </div>
                  </button>

                  {/* Gutter Cleaning Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVertical("gutters");
                      setModalStep("form");
                    }}
                    className="public-modal-service-card group"
                    data-stagger="1"
                  >
                    <div className="public-modal-service-icon flex items-center justify-center rounded-2xl bg-alloy-pine/8 p-5 w-20 h-20 mx-auto mb-4 ring-1 ring-alloy-pine/10 group-hover:bg-alloy-pine/12 group-hover:ring-alloy-juniper/20 transition-all duration-200">
                      <img
                        src="/icons/gutter-blue.png"
                        alt=""
                        width={48}
                        height={48}
                        className="w-12 h-12 object-contain"
                      />
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-alloy-muted mb-2 inline-block">
                      Early access
                    </span>
                    <h3 className="text-xl font-bold text-alloy-pine mb-2 tracking-tight">
                      Gutter Cleaning
                    </h3>
                    <p className="text-alloy-midnight/70 mb-5 text-sm flex-grow leading-relaxed">
                      Sign up early and get $25 off your first service.
                    </p>
                    <div className="mt-auto">
                      <span className="public-cta-appearance block w-full text-center">
                        Get Early Access
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            ) : modalStep === "form" ? (
              // Form Display
              <div className="public-form-step">
                {/* Back button - only show if not opened with defaultService */}
                {!defaultService && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVertical(null);
                      setModalStep("picker");
                    }}
                    className="text-sm text-alloy-midnight/70 hover:text-alloy-midnight hover:bg-alloy-stone/60 rounded-lg transition-colors flex items-center gap-2 mb-4 sm:mb-6 py-2 px-1 -ml-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to service selection
                  </button>
                )}

                {/* Form */}
                {selectedVertical === "cleaning" ? (
                  <div className="space-y-4">
                    {campaignQuoteFlow === "firstfree4x120" ? (
                      <div
                        className="rounded-xl border border-alloy-juniper/25 bg-alloy-juniper/5 px-4 py-3 text-sm text-alloy-midnight"
                        role="region"
                        aria-label="Promotional offer"
                      >
                        <p className="font-semibold text-alloy-pine mb-1">
                          First Service Free — 4 Visits in 120 Days (From First Clean)
                        </p>
                        <p className="text-alloy-midnight/85 leading-relaxed">
                          Sign up for <strong>recurring standard cleaning</strong> (weekly, every 2 weeks, or monthly).
                          The complimentary first cleaning must be scheduled and fully completed within{" "}
                          <strong>30 days</strong> from the date the offer is redeemed. To qualify for the full
                          promotion, all <strong>four (4) recurring cleanings</strong> must be scheduled and completed
                          within <strong>120 days</strong> following the date of your first (complimentary) cleaning.
                          Your <strong>first clean is covered</strong> when you meet the program terms. Use{" "}
                          <strong>Get my recurring quote</strong> below — next you&apos;ll review the program terms,
                          then continue to booking.
                        </p>
                      </div>
                    ) : null}
                    <p className="text-sm text-alloy-midnight/80">
                      {campaignQuoteFlow === "firstfree4x120"
                        ? "Recurring standard cleaning only. We’ll save your quote for the next step."
                        : "We'll calculate your price and save it so you can book when you're ready."}
                    </p>
                    <CleaningQuickQuoteForm
                      campaignQuoteMode={campaignQuoteFlow === "firstfree4x120" ? { id: "firstfree4x120" } : undefined}
                      onComplete={(detail) => {
                        const isCampaign = campaignQuoteFlow === "firstfree4x120";
                        if (detail.kind === "specialty") {
                          return;
                        }
                        if (isCampaign) {
                          if (invokeCampaignQuoteComplete) {
                            invokeCampaignQuoteComplete();
                          }
                          onClose();
                          return;
                        }
                        router.prefetch("/book-v2");
                        window.setTimeout(() => {
                          router.push("/book-v2");
                          window.setTimeout(() => onClose(), 380);
                        }, 120);
                      }}
                    />
                  </div>
                ) : (
                  <GutterLeadForm
                    onSuccess={() => {
                      // Transition to submitted state
                      setModalStep("submitted");
                      // Close modal after delay
                      setTimeout(() => {
                        onClose();
                      }, REDIRECT_DELAY_MS);
                    }}
                  />
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

