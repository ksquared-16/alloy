"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import PrimaryButton from "@/components/PrimaryButton";
import CleaningQuoteForm from "@/components/cleaning/CleaningQuoteForm";
import GutterLeadForm from "@/components/gutters/GutterLeadForm";
import { REDIRECT_DELAY_MS } from "@/lib/ui";

type SelectedVertical = "cleaning" | "gutters" | null;

interface QuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QuoteModal({ isOpen, onClose }: QuoteModalProps) {
  const [selectedVertical, setSelectedVertical] = useState<SelectedVertical>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
      // Reset selection when modal closes
      setSelectedVertical(null);
    }

    return () => {
      document.body.style.overflow = "unset";
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
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-alloy-stone/20 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-alloy-midnight">
            {selectedVertical === null
              ? "What service do you need?"
              : selectedVertical === "cleaning"
                ? "Get a cleaning quote"
                : "Get early access"}
          </h2>
          <button
            onClick={onClose}
            className="text-alloy-midnight/60 hover:text-alloy-midnight transition-colors p-2"
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

        {/* Content */}
        <div className="p-6">
          {selectedVertical === null ? (
            // Service Selection
            <div className="space-y-6">
              <p className="text-alloy-midnight/80 text-center">
                Select a service to get started.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Cleaning Option */}
                <button
                  onClick={() => setSelectedVertical("cleaning")}
                  className="bg-white rounded-lg shadow-md p-5 md:p-6 border border-alloy-stone/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer text-left flex flex-col h-full"
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
                  onClick={() => setSelectedVertical("gutters")}
                  className="bg-white rounded-lg shadow-md p-5 md:p-6 border border-alloy-stone/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer text-left flex flex-col h-full"
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
          ) : (
            // Form Display
            <div>
              {/* Back button */}
              <button
                onClick={() => setSelectedVertical(null)}
                className="text-sm text-alloy-midnight/70 hover:text-alloy-midnight transition-colors flex items-center gap-2 mb-6"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to service selection
              </button>

              {/* Form */}
              {selectedVertical === "cleaning" ? (
                <CleaningQuoteForm onSuccess={() => {
                  // Close modal after successful submission
                  setTimeout(() => {
                    onClose();
                  }, REDIRECT_DELAY_MS);
                }} />
              ) : (
                <GutterLeadForm onSuccess={() => {
                  // Close modal after successful submission
                  setTimeout(() => {
                    onClose();
                  }, REDIRECT_DELAY_MS);
                }} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

