"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Section from "@/components/Section";
import GhlEmbed from "@/components/GhlEmbed";
import Accordion from "@/components/Accordion";

interface QuoteResponse {
  status: "ready" | "pending" | "not_found";
  estimated_price?: number;
  price_breakdown?: string;
}

function BookPageContent() {
  const searchParams = useSearchParams();
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const phone = searchParams?.get("phone");

  const fetchQuote = async (phoneNumber: string) => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
    try {
      const response = await fetch(
        `${apiBaseUrl}/quote/cleaning?phone=${encodeURIComponent(phoneNumber)}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch quote");
      }
      const data: QuoteResponse = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching quote:", error);
      return null;
    }
  };

  useEffect(() => {
    if (!phone) {
      return;
    }

    let pollInterval: NodeJS.Timeout | null = null;
    let pollTimeout: NodeJS.Timeout | null = null;
    let pollCount = 0;
    const maxPolls = 15; // Poll for up to 15 seconds (15 polls at 1s each)

    const startPolling = async () => {
      const initialQuote = await fetchQuote(phone);
      if (initialQuote) {
        setQuote(initialQuote);
        if (initialQuote.status === "pending") {
          setIsPolling(true);
          pollInterval = setInterval(async () => {
            pollCount++;
            const updatedQuote = await fetchQuote(phone);
            if (updatedQuote) {
              setQuote(updatedQuote);
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

  return (
    <div className="min-h-screen py-6 md:py-10">
      <Section className="max-w-5xl">
        {phone && quote && (
          <div className="mb-6">
            {quote.status === "ready" && quote.estimated_price !== undefined ? (
              <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-6 mb-6">
                <h2 className="text-2xl font-bold text-alloy-midnight mb-4">
                  Your quote
                </h2>
                <div className="mb-4">
                  <p className="text-3xl font-bold text-alloy-blue">
                    ${quote.estimated_price.toFixed(2)}
                  </p>
                </div>
                {quote.price_breakdown && (
                  <Accordion title="Price breakdown">
                    <p className="text-sm text-alloy-midnight/80 whitespace-pre-line">
                      {quote.price_breakdown}
                    </p>
                  </Accordion>
                )}
              </div>
            ) : quote.status === "pending" || isPolling ? (
              <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-6 mb-6">
                <h2 className="text-xl font-bold text-alloy-midnight mb-2">
                  Finalizing your quote
                </h2>
                <p className="text-alloy-midnight/80">
                  We're finalizing your quote — you can still book now and we'll confirm by text.
                </p>
              </div>
            ) : null}
          </div>
        )}

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
