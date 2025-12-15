"use client";

import { useState, useRef, useEffect } from "react";
import PrimaryButton from "./PrimaryButton";
import GhlEmbed from "./GhlEmbed";

export default function CollapsibleQuoteForm() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const handleExpand = () => {
    setIsExpanded(true);
    setHasRendered(true);
    // Smooth scroll to form after a brief delay to allow expansion
    setTimeout(() => {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  };

  const handleCollapse = () => {
    setIsExpanded(false);
  };

  // Handle hash-based expansion (e.g., from #quote-form link)
  useEffect(() => {
    const checkHash = () => {
      if (window.location.hash === "#quote-form" && !isExpanded) {
        handleExpand();
      }
    };

    // Check on mount
    checkHash();

    // Listen for hash changes
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, [isExpanded]);

  return (
    <div ref={formRef}>
      {/* Collapsed State */}
      {!isExpanded && (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-alloy-midnight mb-2">
              Get a quote
            </h2>
            <p className="text-alloy-midnight/70">
              Takes about a minute. We'll text to confirm details and scheduling.
            </p>
          </div>
          <button
            onClick={handleExpand}
            aria-expanded="false"
            aria-controls="quote-form-content"
            aria-label="Expand quote form"
            className="md:w-auto w-full"
          >
            <PrimaryButton className="w-full md:w-auto">Get a quote</PrimaryButton>
          </button>
        </div>
      )}

      {/* Expanded State */}
      {isExpanded && (
        <div className="transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-alloy-midnight">
              Get a quote
            </h2>
            <button
              onClick={handleCollapse}
              className="text-sm text-alloy-juniper hover:text-alloy-juniper/80 font-medium transition-colors"
              aria-label="Hide form"
              aria-expanded="true"
              aria-controls="quote-form-content"
            >
              Hide form
            </button>
          </div>
          <p className="text-alloy-midnight/70 mb-6">
            Takes about a minute. We'll text to confirm details and scheduling.
          </p>
          <div
            id="quote-form-content"
            className="rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm bg-white p-4 md:p-6"
          >
            {hasRendered && (
              <GhlEmbed
                src="https://api.leadconnectorhq.com/widget/form/JBZiHlFyWKli2GnSwivI"
                title="Lead Form"
                height={1470}
                className="!min-h-[1200px] md:!min-h-[1470px]"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

