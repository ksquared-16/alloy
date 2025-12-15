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
    <div
      ref={formRef}
      className="bg-white rounded-xl border border-alloy-stone/50 shadow-sm overflow-hidden"
    >
      {/* Collapsed State */}
      {!isExpanded && (
        <div className="p-6 md:p-8">
          <h2 className="text-2xl font-bold text-alloy-midnight mb-3">
            Get a quote
          </h2>
          <p className="text-alloy-midnight/70 mb-6">
            Takes about a minute. We'll text to confirm details and scheduling.
          </p>
          <button
            onClick={handleExpand}
            aria-expanded="false"
            aria-controls="quote-form-content"
            aria-label="Expand quote form"
          >
            <PrimaryButton className="w-full">Get a quote</PrimaryButton>
          </button>
        </div>
      )}

      {/* Expanded State */}
      {isExpanded && (
        <div className="transition-all duration-300">
          <div className="p-6 md:p-8 border-b border-alloy-stone/30">
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
            <p className="text-alloy-midnight/70 text-sm">
              Takes about a minute. We'll text to confirm details and scheduling.
            </p>
          </div>
          <div id="quote-form-content" className="p-4 md:p-6 bg-alloy-stone/30">
            {hasRendered && (
              <GhlEmbed
                src="https://api.leadconnectorhq.com/widget/form/JBZiHlFyWKli2GnSwivI"
                title="Lead Form"
                height={1470}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

