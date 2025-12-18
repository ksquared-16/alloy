"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Section from "@/components/Section";
import GhlEmbed from "@/components/GhlEmbed";
import Accordion from "@/components/Accordion";

interface QuoteResponse {
  status?: "ready" | "pending" | "not_found" | "error";
  estimated_price?: number;
  first_clean_price?: number;
  recurring_price?: number;
  frequency_label?: string;
  price_breakdown?: string;
  addons?: Array<{ name: string; price: number }>;
}

type FetchStatus = "idle" | "loading" | "ready" | "timeout" | "error";

// Quote is considered "ready" when:
// - estimated_price exists AND
// - EITHER price_breakdown exists OR recurring_price exists
function isQuoteReady(data: QuoteResponse | null): boolean {
  if (!data) return false;
  const hasEstimated = typeof data.estimated_price === "number";
  const hasBreakdown = Boolean(data.price_breakdown);
  const hasRecurring = typeof data.recurring_price === "number";
  return hasEstimated && (hasBreakdown || hasRecurring);
}

function BookPageContent() {
  const searchParams = useSearchParams();
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null);
  const [lastRequestUrl, setLastRequestUrl] = useState<string | null>(null);
  const phone = searchParams?.get("phone");

  const fetchQuote = async (phoneNumber: string, baseUrl: string) => {
    try {
      const url = `${baseUrl}/quote/cleaning?phone=${encodeURIComponent(phoneNumber)}`;
      setLastRequestUrl(url);
      console.log("Fetching quote from:", url);
      const response = await fetch(url);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}${
            text ? ` - ${text}` : ""
          }`,
        );
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
    const rawPhone = (phone || "").trim();
    const digits = rawPhone.replace(/\D/g, "");

    const envBase = process.env.NEXT_PUBLIC_API_BASE_URL || "";
    const isProd = process.env.NODE_ENV === "production";

    // Validate phone param early
    if (!rawPhone || digits.length < 7) {
      setFetchStatus("error");
      setErrorMessage(
        "Missing/invalid phone param in URL. Expected /book?phone=…",
      );
      setApiBaseUrl(envBase || null);
      setLastRequestUrl(null);
      return;
    }

    // In production, require NEXT_PUBLIC_API_BASE_URL
    if (isProd && !envBase) {
      setFetchStatus("error");
      setErrorMessage(
        "Missing NEXT_PUBLIC_API_BASE_URL. Booking page cannot fetch quote.",
      );
      setApiBaseUrl(null);
      setLastRequestUrl(null);
      return;
    }

    const baseUrlToUse = envBase || "http://localhost:8000";
    setApiBaseUrl(baseUrlToUse);

    setFetchStatus("loading");
    setErrorMessage(null);
    setHasTimedOut(false);
    setQuote(null);

    let pollInterval: NodeJS.Timeout | null = null;
    let pollCount = 0;
    const POLL_INTERVAL_MS = 600;
    const MAX_POLLS = 20; // 20 * 600ms = 12 seconds

    const processQuote = (data: QuoteResponse | null) => {
      if (!data) return;
      setQuote(data);
      if (isQuoteReady(data)) {
        setFetchStatus("ready");
        if (pollInterval) {
          clearInterval(pollInterval);
        }
      }
    };

    const startPolling = async () => {
      const initialQuote = await fetchQuote(rawPhone, baseUrlToUse);
      processQuote(initialQuote);

      if (!initialQuote || !isQuoteReady(initialQuote)) {
        pollInterval = setInterval(async () => {
          pollCount += 1;
          const updatedQuote = await fetchQuote(rawPhone, baseUrlToUse);
          processQuote(updatedQuote);

          if ((updatedQuote && isQuoteReady(updatedQuote)) || pollCount >= MAX_POLLS) {
            if (!updatedQuote || !isQuoteReady(updatedQuote)) {
              setHasTimedOut(true);
              if (fetchStatus !== "ready") {
                setFetchStatus("timeout");
              }
            }
            if (pollInterval) {
              clearInterval(pollInterval);
            }
          }
        }, POLL_INTERVAL_MS);
      }
    };

    startPolling();

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [phone]);

  const isReady = isQuoteReady(quote) && fetchStatus === "ready";
  const shouldShowDebug =
    fetchStatus === "loading" ||
    fetchStatus === "timeout" ||
    fetchStatus === "error";

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
              <strong>API Base URL:</strong>{" "}
              {process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000 (default)"}
            </p>
          </div>
        )}

        {/* Loading / timeout states */}
        {!isReady && !errorMessage && (
          <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-6 mb-6">
            <h2 className="text-2xl font-bold text-alloy-midnight mb-2">
              Generating your quote…
            </h2>
            <p className="text-sm text-alloy-midnight/80 mb-4">
              Please wait a few seconds while we calculate your pricing.
            </p>
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 border-2 border-alloy-stone border-t-alloy-blue rounded-full animate-spin" />
              <p className="text-sm text-alloy-midnight/70">
                This usually takes just a moment.
              </p>
            </div>

            {hasTimedOut && (
              <div className="mt-4 p-3 bg-alloy-stone/40 rounded-lg">
                <p className="text-sm text-alloy-midnight/80">
                  We&apos;re still working on your quote. Please refresh the page or contact us if
                  it doesn&apos;t appear.
                </p>
              </div>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-6 mb-6">
            <h2 className="text-2xl font-bold text-alloy-midnight mb-2">
              Trouble loading your quote
            </h2>
            <p className="text-sm text-alloy-midnight/80 mb-3">
              Please try refreshing the page. If the issue continues, contact us and we&apos;ll
              confirm your pricing manually.
            </p>
            <p className="text-xs text-alloy-ember font-mono break-all">{errorMessage}</p>
          </div>
        )}

        {/* Debug info for API calls (visible in loading/timeout/error) */}
        {shouldShowDebug && (
          <div className="mb-4 p-3 bg-alloy-stone/60 rounded-lg border border-alloy-stone/80">
            <p className="text-xs font-mono text-alloy-midnight break-all">
              <strong>API Base URL:</strong> {apiBaseUrl ?? "(unset)"}
            </p>
            <p className="text-xs font-mono text-alloy-midnight break-all mt-1">
              <strong>Request URL:</strong> {lastRequestUrl ?? "(none yet)"}
            </p>
            <p className="text-xs font-mono text-alloy-midnight mt-1">
              <strong>Phone param:</strong> {phone ?? "(missing)"}
            </p>
            {errorMessage && (
              <p className="text-xs font-mono text-alloy-ember break-all mt-1">
                <strong>Error:</strong> {errorMessage}
              </p>
            )}
          </div>
        )}

        {/* Quote details once ready */}
        {isReady && quote && quote.estimated_price !== undefined && (
          <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-6 mb-6">
            <h2 className="text-2xl font-bold text-alloy-midnight mb-6">
              Here&apos;s your quote details:
            </h2>

            <div className="space-y-6">
              {/* Estimated Price (always) */}
              <div className="border border-alloy-stone/40 rounded-xl p-5 bg-alloy-stone/30">
                <p className="text-sm font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-2">
                  Estimated price
                </p>
                <p className="text-3xl font-bold text-alloy-blue">
                  ${quote.estimated_price.toFixed(2)}
                </p>
              </div>

              {/* First vs ongoing logic */}
              {quote.recurring_price !== undefined ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-alloy-stone/40 rounded-xl p-4 bg-white">
                    <p className="text-sm font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-1">
                      First cleaning
                    </p>
                    <p className="text-2xl font-bold text-alloy-midnight">
                      ${(quote.first_clean_price ?? quote.estimated_price).toFixed(2)}
                    </p>
                  </div>
                  <div className="border border-alloy-stone/40 rounded-xl p-4 bg-alloy-pine/5">
                    <p className="text-sm font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-1">
                      Ongoing cleaning
                    </p>
                    <p className="text-lg font-bold text-alloy-juniper">
                      ${quote.recurring_price.toFixed(2)}{" "}
                      <span className="font-normal text-alloy-midnight/70">per visit</span>
                    </p>
                    {quote.frequency_label && (
                      <p className="text-xs text-alloy-midnight/70 mt-1">
                        {quote.frequency_label}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border border-alloy-stone/40 rounded-xl p-4 bg-white">
                  <p className="text-sm font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-1">
                    One-time cleaning
                  </p>
                  <p className="text-2xl font-bold text-alloy-midnight">
                    ${quote.estimated_price.toFixed(2)}
                  </p>
                </div>
              )}

              {/* Add-ons */}
              {quote.addons && quote.addons.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-3">
                    Add-ons
                  </p>
                  <div className="space-y-2">
                    {quote.addons.map((addon, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-center py-2 border-b border-alloy-stone/20"
                      >
                        <span className="text-sm text-alloy-midnight/80">{addon.name}</span>
                        <span className="text-sm font-semibold text-alloy-midnight">
                          ${addon.price.toFixed(2)}
                        </span>
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

        {/* Calendar */}
        <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-6">
          <GhlEmbed
            src="https://api.leadconnectorhq.com/widget/booking/GficiTFm4cbAbQ05IHwz"
            title="Booking Calendar"
            height={1200}
            className="!min-h-[1200px] md:!min-h-[900px]"
          />
          <p className="text-sm text-alloy-midnight/60 mt-4 text-center">
            You&apos;ll pay after the clean is completed. We&apos;ll text to confirm details.
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
