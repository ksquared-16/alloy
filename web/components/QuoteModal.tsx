"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import PrimaryButton from "@/components/PrimaryButton";
import CleaningQuoteForm from "@/components/cleaning/CleaningQuoteForm";
import GutterLeadForm from "@/components/gutters/GutterLeadForm";
import { REDIRECT_DELAY_MS } from "@/lib/ui";

type SelectedVertical = "cleaning" | "gutters" | null;
type ModalStep = "picker" | "form" | "submitted";

interface QuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultService?: "cleaning" | "gutters" | null;
}

export default function QuoteModal({ isOpen, onClose, defaultService }: QuoteModalProps) {
  const [selectedVertical, setSelectedVertical] = useState<SelectedVertical>(null);
  const [modalStep, setModalStep] = useState<ModalStep>("picker");
  const [mounted, setMounted] = useState(false);
  const [submittedQuote, setSubmittedQuote] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize selectedVertical from defaultService when modal opens
  useEffect(() => {
    if (isOpen && defaultService) {
      setSelectedVertical(defaultService);
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
      setSubmittedQuote(null);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        // Close when clicking backdrop
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{ touchAction: "none" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col" style={{ maxHeight: "90dvh" }}>
        {/* Sticky Header */}
        <div className="sticky top-0 bg-white border-b border-alloy-stone/20 px-4 sm:px-6 py-4 flex items-center justify-between z-10 shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-alloy-midnight">
            {modalStep === "submitted"
              ? selectedVertical === "cleaning"
                ? "Your Quote"
                : "Thank You!"
              : selectedVertical === null
                ? "What service do you need?"
                : selectedVertical === "cleaning"
                  ? "Get a cleaning quote"
                  : "Get early access"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-alloy-midnight/60 hover:text-alloy-midnight transition-colors p-2 -mr-2"
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
        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="p-4 sm:p-6">
            {modalStep === "submitted" ? (
              // Submitted/Quote View
              <div className="space-y-6">
                {selectedVertical === "cleaning" ? (
                  <>
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
                        Quote Calculated Successfully!
                      </h3>
                      <p className="text-alloy-midnight/70 mb-6">
                        Your quote has been calculated and saved. You&apos;ll be redirected to the booking page shortly.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
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
                    </div>
                  </>
                )}
              </div>
            ) : selectedVertical === null ? (
              // Service Selection
              <div className="space-y-6">
                <p className="text-alloy-midnight/80 text-center">
                  Select a service to get started.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {/* Cleaning Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVertical("cleaning");
                      setModalStep("form");
                    }}
                    className="bg-white rounded-lg shadow-md p-4 sm:p-5 md:p-6 border border-alloy-stone/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer text-left flex flex-col h-full"
                  >
                    <div className="mb-4 flex items-center justify-center">
                      <img
                        src="/icons/vacuum-blue.png"
                        alt="Home Cleaning"
                        width={56}
                        height={56}
                        className="w-14 h-14"
                      />
                    </div>
                    <h3 className="text-xl font-bold text-alloy-pine mb-2">
                      Home Cleaning
                    </h3>
                    <p className="text-alloy-midnight/70 mb-4 text-sm flex-grow">
                      Professional home cleaning services.
                    </p>
                    <div className="mt-auto">
                      <PrimaryButton className="w-full">Get a cleaning quote</PrimaryButton>
                    </div>
                  </button>

                  {/* Gutter Cleaning Option */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVertical("gutters");
                      setModalStep("form");
                    }}
                    className="bg-white rounded-lg shadow-md p-4 sm:p-5 md:p-6 border border-alloy-stone/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer text-left flex flex-col h-full"
                  >
                    <div className="mb-4 flex items-center justify-center">
                      <img
                        src="/icons/gutter-blue.png"
                        alt="Gutter Cleaning"
                        width={56}
                        height={56}
                        className="w-14 h-14"
                      />
                    </div>
                    <h3 className="text-xl font-bold text-alloy-pine mb-2">
                      Gutter Cleaning
                    </h3>
                    <p className="text-alloy-midnight/70 mb-4 text-sm flex-grow">
                      Sign up early and get $25 off your first service.
                    </p>
                    <div className="mt-auto">
                      <PrimaryButton className="w-full">Get Early Access</PrimaryButton>
                    </div>
                  </button>
                </div>
              </div>
            ) : modalStep === "form" ? (
              // Form Display
              <div>
                {/* Back button - only show if not opened with defaultService */}
                {!defaultService && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVertical(null);
                      setModalStep("picker");
                    }}
                    className="text-sm text-alloy-midnight/70 hover:text-alloy-midnight transition-colors flex items-center gap-2 mb-4 sm:mb-6"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to service selection
                  </button>
                )}

                {/* Form */}
                {selectedVertical === "cleaning" ? (
                  <CleaningQuoteForm
                    onSuccess={() => {
                      // Transition to submitted state
                      setModalStep("submitted");
                      // Close modal and navigate after delay
                      setTimeout(() => {
                        onClose();
                      }, REDIRECT_DELAY_MS);
                    }}
                  />
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

