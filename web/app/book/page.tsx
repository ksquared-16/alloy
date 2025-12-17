"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Section from "@/components/Section";
import GhlEmbed from "@/components/GhlEmbed";
import Accordion from "@/components/Accordion";

interface QuoteResponse {
  status: "ready" | "pending" | "not_found";
  estimated_price?: number;
  first_clean_price?: number;
  recurring_price?: number;
  recurring_label?: string;
  price_breakdown?: string;
  addons?: Array<{ name: string; price: number }>;
}

type FetchStatus = "loading" | "ready" | "pending" | "not_found" | "error";

function BookPageContent() {
  const searchParams = useSearchParams();
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const phone = searchParams?.get("phone");

  const fetchQuote = async (phoneNumber: string) => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
    try {
      const url = `${apiBaseUrl}/quote/cleaning?phone=${encodeURIComponent(phoneNumber)}`;
      console.log("Fetching quote from:", url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data: QuoteResponse = await response.json();
      console.log("Quote response:", data);
      return data;
    } catch (error) {
      console.error("Error fetching quote:", error);
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setErrorMessage(errorMsg);
      return null;
    }
  };

  useEffect(() => {
    if (!phone) {
      setFetchStatus("error");
      setErrorMessage("Missing phone param");
      return;
    }

    setFetchStatus("loading");
    setErrorMessage(null);

    let pollInterval: NodeJS.Timeout | null = null;
    let pollTimeout: NodeJS.Timeout | null = null;
    let pollCount = 0;
    const maxPolls = 15; // Poll for up to 15 seconds (15 polls at 1s each)

    const startPolling = async () => {
      const initialQuote = await fetchQuote(phone);
      if (initialQuote) {
        setQuote(initialQuote);
        setFetchStatus(initialQuote.status);
        if (initialQuote.status === "pending") {
          setIsPolling(true);
          pollInterval = setInterval(async () => {
            pollCount++;
            const updatedQuote = await fetchQuote(phone);
            if (updatedQuote) {
              setQuote(updatedQuote);
              setFetchStatus(updatedQuote.status);
              if (updatedQuote.status !== "pending" || pollCount >= maxPolls) {
                setIsPolling(false);
                if (pollInterval) {
                  clearInterval(pollInterval);
                }
              }
            }
          }, 1000); // Poll every 1 second

          // Stop polling after 15 seconds max
          pollTimeout = setTimeout(() => {
            setIsPolling(false);
            if (pollInterval) {
              clearInterval(pollInterval);
            }
          }, 15000);
        }
      } else {
        setFetchStatus("error");
      }
    };

    startPolling();

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      if (pollTimeout) {
        clearTimeout(pollTimeout);
      }
    };
  }, [phone]);

  // Determine display status
  const displayStatus = isPolling ? "pending" : fetchStatus;

  return (
    <div className="min-h-screen py-6 md:py-10">
      <Section className="max-w-5xl">
        {/* Debug strip - only in development */}
        {process.env.NODE_ENV !== "production" && (
          <div className="mb-4 p-4 bg-alloy-stone rounded-lg border border-alloy-stone/40">
            <p className="text-sm font-mono text-alloy-midnight">
              <strong>Debug phone param:</strong> {phone ?? "NULL"}
            </p>
            <p className="text-sm font-mono text-alloy-midnight mt-1">
              <strong>API Base URL:</strong> {process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000 (default)"}
            </p>
          </div>
        )}

        {/* Quote Card - ALWAYS VISIBLE */}
        {quote && displayStatus === "ready" && (
          <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-6 mb-6">
            <h2 className="text-2xl font-bold text-alloy-midnight mb-6">
              Your quote
            </h2>
            
            <div className="space-y-6">
              {/* Pricing Display */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* First Cleaning Price */}
                {quote.first_clean_price !== undefined ? (
                  <div className="border border-alloy-stone/40 rounded-xl p-5 bg-alloy-stone/30">
                    <p className="text-sm font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-2">
                      First cleaning
                    </p>
                    <p className="text-3xl font-bold text-alloy-blue">
                      ${quote.first_clean_price.toFixed(2)}
                    </p>
                    <p className="text-xs text-alloy-midnight/60 mt-1">One-time</p>
                  </div>
                ) : quote.estimated_price !== undefined ? (
                  <div className="border border-alloy-stone/40 rounded-xl p-5 bg-alloy-stone/30">
                    <p className="text-sm font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-2">
                      Estimated price
                    </p>
                    <p className="text-3xl font-bold text-alloy-blue">
                      ${quote.estimated_price.toFixed(2)}
                    </p>
                  </div>
                ) : null}

                {/* Recurring Price */}
                {quote.recurring_price !== undefined && (
                  <div className="border border-alloy-stone/40 rounded-xl p-5 bg-alloy-stone/30">
                    <p className="text-sm font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-2">
                      Recurring
                    </p>
                    <p className="text-3xl font-bold text-alloy-juniper">
                      ${quote.recurring_price.toFixed(2)}
                    </p>
                    <p className="text-xs text-alloy-midnight/60 mt-1">
                      {quote.recurring_label ? `/${quote.recurring_label.toLowerCase()}` : "/visit"}
                    </p>
                  </div>
                )}
              </div>

              {/* Add-ons */}
              {quote.addons && quote.addons.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-3">
                    Add-ons
                  </p>
                  <div className="space-y-2">
                    {quote.addons.map((addon, idx) => (
                      <div key={idx} className="flex justify-between items-center py-2 border-b border-alloy-stone/20">
                        <span className="text-sm text-alloy-midnight/80">{addon.name}</span>
                        <span className="text-sm font-semibold text-alloy-midnight">${addon.price.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Price Breakdown Accordion */}
              {quote.price_breakdown && (
                <div>
                  <Accordion title="See full price breakdown">
                    <div className="text-sm text-alloy-midnight/80 whitespace-pre-line leading-relaxed">
                      {quote.price_breakdown}
                    </div>
                  </Accordion>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Fallback Quote Card for non-ready states */}
        {(!quote || displayStatus !== "ready") && (
          <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-6 mb-6">
            <h2 className="text-2xl font-bold text-alloy-midnight mb-4">
              Quote Status
            </h2>
            
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-alloy-midnight/60 uppercase tracking-wide">
                  Status
                </p>
                <p className="text-lg font-bold text-alloy-pine">
                  {displayStatus.toUpperCase()}
                </p>
              </div>

              {errorMessage && (
                <div>
                  <p className="text-sm font-semibold text-alloy-midnight/60 uppercase tracking-wide">
                    Error
                  </p>
                  <p className="text-sm text-alloy-ember font-mono">
                    {errorMessage}
                  </p>
                </div>
              )}

              {quote && quote.estimated_price !== undefined && displayStatus !== "ready" && (
                <div>
                  <p className="text-sm font-semibold text-alloy-midnight/60 uppercase tracking-wide">
                    Estimated Price
                  </p>
                  <p className="text-3xl font-bold text-alloy-blue">
                    ${quote.estimated_price.toFixed(2)}
                  </p>
                </div>
              )}

            {displayStatus === "pending" && (
              <div className="mt-4 p-3 bg-alloy-pine/5 rounded-lg">
                <p className="text-sm text-alloy-midnight/80">
                  We're finalizing your quote — you can still book now and we'll confirm by text.
                </p>
              </div>
            )}

            {displayStatus === "not_found" && (
              <div className="mt-4 p-3 bg-alloy-stone rounded-lg">
                <p className="text-sm text-alloy-midnight/80">
                  No quote found for this phone number. This may be normal if you haven't submitted a lead form yet.
                </p>
              </div>
            )}

            {displayStatus === "error" && !errorMessage && (
              <div className="mt-4 p-3 bg-alloy-ember/10 rounded-lg">
                <p className="text-sm text-alloy-midnight/80">
                  Unable to fetch quote. Please check the console for details.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Calendar */}
        <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-6">
          <GhlEmbed
            src="https://api.leadconnectorhq.com/widget/booking/GficiTFm4cbAbQ05IHwz"
            title="Booking Calendar"
            height={1200}
            className="!min-h-[1200px] md:!min-h-[900px]"
          />
          <p className="text-sm text-alloy-midnight/60 mt-4 text-center">
            You'll pay after the clean is completed. We'll text to confirm details.
          </p>
        </div>
      </Section>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen py-6 md:py-10">
        <Section className="max-w-5xl">
          {process.env.NODE_ENV !== "production" && (
            <div className="mb-4 p-4 bg-alloy-stone rounded-lg border border-alloy-stone/40">
              <p className="text-sm font-mono text-alloy-midnight">
                <strong>Debug phone param:</strong> Loading...
              </p>
            </div>
          )}
          <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-6">
            <GhlEmbed
              src="https://api.leadconnectorhq.com/widget/booking/GficiTFm4cbAbQ05IHwz"
              title="Booking Calendar"
              height={1200}
              className="!min-h-[1200px] md:!min-h-[900px]"
            />
          </div>
        </Section>
      </div>
    }>
      <BookPageContent />
    </Suspense>
  );
}
