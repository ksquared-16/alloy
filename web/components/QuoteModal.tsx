"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import GutterLeadForm from "@/components/gutters/GutterLeadForm";
import { REDIRECT_DELAY_MS } from "@/lib/ui";

/**
 * The public quote modal — one service.
 *
 * It used to pick between Home Cleaning and Gutter Cleaning and carry a "first service free" campaign
 * flow. The legacy cleaning product was retired in July 2026 and its residual front end is gone, so the
 * service picker, the campaign copy, the campaign hand-off and the post-submit push to `/book-v2` (a
 * page that retirement also deleted) all went with it. What remains is the modal shell and the gutter
 * lead form, which posts to `/api/leads/gutters` — an endpoint that exists.
 */
type ModalStep = "form" | "submitted";

interface QuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function QuoteModal({ isOpen, onClose }: QuoteModalProps) {
  const [modalStep, setModalStep] = useState<ModalStep>("form");
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

  useEffect(() => {
    if (isOpen) {
      // Lock the background while the modal is open.
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      // iOS also needs the html element pinned.
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      document.documentElement.style.overflow = "";
      setModalStep("form");
    }

    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      document.documentElement.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    if (isOpen) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) {
    return null;
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 public-modal-overlay"
      data-state={transitionState}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
            {modalStep === "submitted" ? "Thank You!" : "Get early access"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-alloy-midnight/60 hover:text-alloy-midnight hover:bg-alloy-stone/80 rounded-lg transition-colors p-2 -mr-2"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
            {modalStep === "submitted" ? (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="mb-4">
                    <svg
                      className="w-16 h-16 mx-auto text-alloy-juniper"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-alloy-midnight mb-2">Thank You!</h3>
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
            ) : (
              <div className="public-form-step">
                <GutterLeadForm
                  onSuccess={() => {
                    setModalStep("submitted");
                    setTimeout(() => onClose(), REDIRECT_DELAY_MS);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
