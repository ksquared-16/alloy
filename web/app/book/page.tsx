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
    service?: string;
    discount_label?: string;
    price_breakdown?: string;
    addons?: Array<{ name: string; price: number | null }>;
}

type FetchStatus = "idle" | "loading" | "ready" | "timeout" | "error";

function isQuoteReady(data: QuoteResponse | null): boolean {
    if (!data) return false;
    const hasFirst =
        typeof data.first_clean_price === "number" ||
        typeof data.estimated_price === "number";
    const hasRecurring = typeof data.recurring_price === "number";
    const hasFrequency =
        typeof data.frequency_label === "string" &&
        data.frequency_label.trim().length > 0;
    return hasFirst && hasRecurring && hasFrequency;
}

function BookPageContent() {
    const searchParams = useSearchParams();
    const [quote, setQuote] = useState<QuoteResponse | null>(null);
    const [fetchStatus, setFetchStatus] = useState<FetchStatus>("idle");
    const phone = searchParams?.get("phone");

    useEffect(() => {
        // Read quote from sessionStorage
        try {
            const storedQuote = sessionStorage.getItem("alloy_cleaning_quote");
            if (storedQuote) {
                const parsedQuote: QuoteResponse = JSON.parse(storedQuote);
                setQuote(parsedQuote);
                setFetchStatus("ready");
                console.log("Loaded quote from sessionStorage:", parsedQuote);
            } else {
                setFetchStatus("error");
                setQuote(null);
            }
        } catch (e) {
            console.error("Failed to load quote from sessionStorage:", e);
            setFetchStatus("error");
            setQuote(null);
        }
    }, []);

    const hasQuote =
        !!quote &&
        ((typeof quote.first_clean_price === "number" &&
            quote.first_clean_price > 0) ||
            (typeof quote.estimated_price === "number" &&
                quote.estimated_price > 0));

    return (
        <div className="min-h-screen py-6 md:py-10">
            <Section className="max-w-7xl">
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

                {/* Fallback message if no quote found */}
                {!hasQuote && fetchStatus === "error" && (
                    <div className="bg-white rounded-xl overflow-hidden border border-alloy-stone/20 shadow-sm p-6 md:p-8 mb-5 text-center">
                        <h2 className="text-2xl font-bold text-alloy-midnight mb-3">
                            Please start your quote first
                        </h2>
                        <p className="text-sm text-alloy-midnight/80 mb-6">
                            To book a cleaning, please fill out the quote form first.
                        </p>
                        <a
                            href="/services/cleaning?open=1#quote-form"
                            className="inline-block bg-alloy-blue text-white font-semibold px-6 py-3 rounded-lg hover:bg-alloy-blue/90 transition-colors"
                        >
                            Get a Quote
                        </a>
                    </div>
                )}

                {/* Two-column layout: Quote (1/4) + Calendar (3/4) */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                    {/* Left column: Quote panel (1/4 width) */}
                    {quote && hasQuote && (
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-5 sticky top-6">
                                <div className="space-y-4 text-left">
                                    <h2 className="text-lg font-bold text-alloy-midnight mb-3">
                                        Your Quote
                                    </h2>

                                    {/* First Cleaning - stacked vertically */}
                                    <div>
                                        <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-1">
                                            First Cleaning
                                        </p>
                                        {(() => {
                                            const price =
                                                (typeof quote.first_clean_price === "number" &&
                                                    quote.first_clean_price > 0
                                                    ? quote.first_clean_price
                                                    : typeof quote.estimated_price === "number" &&
                                                        quote.estimated_price > 0
                                                        ? quote.estimated_price
                                                        : null);
                                            return price != null && price > 0 ? (
                                                <p className="text-2xl font-bold text-alloy-blue leading-tight">
                                                    ${price.toFixed(2)}
                                                </p>
                                            ) : (
                                                <p className="text-sm text-alloy-midnight/70">Calculating…</p>
                                            );
                                        })()}
                                    </div>

                                    {/* Recurring Cleaning - stacked vertically */}
                                    <div>
                                        {quote.recurring_price !== undefined &&
                                            quote.recurring_price !== null &&
                                            quote.recurring_price > 0 &&
                                            quote.frequency_label ? (
                                            <>
                                                <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-1">
                                                    {quote.frequency_label} Cleaning
                                                    {quote.discount_label && (
                                                        <span className="normal-case text-[11px] text-alloy-midnight/70 ml-1">
                                                            ({quote.discount_label})
                                                        </span>
                                                    )}
                                                </p>
                                                <div className="flex items-baseline gap-1">
                                                    <p className="text-2xl font-bold text-alloy-juniper leading-tight">
                                                        ${quote.recurring_price.toFixed(2)}
                                                    </p>
                                                    <span className="text-xs text-alloy-midnight/60">
                                                        per visit
                                                    </span>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-1">
                                                    Recurring Cleaning
                                                </p>
                                                <p className="text-sm text-alloy-midnight/70">
                                                    One-time service
                                                </p>
                                            </>
                                        )}
                                    </div>

                                    {/* Add-ons - stacked vertically */}
                                    {quote.addons && quote.addons.length > 0 && (
                                        <div>
                                            <p className="text-xs font-semibold text-alloy-midnight/60 uppercase tracking-wide mb-2">
                                                Add-ons
                                            </p>
                                            <div className="space-y-1.5">
                                                {quote.addons.map((addon, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="flex justify-between items-center py-1 border-b border-alloy-stone/15 last:border-b-0"
                                                    >
                                                        <span className="text-xs text-alloy-midnight/85">
                                                            {addon.name}
                                                        </span>
                                                        <span className="text-xs font-semibold text-alloy-midnight">
                                                            {addon.price === null || addon.price === undefined
                                                                ? "included"
                                                                : `$${addon.price.toFixed(2)}`}
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
                                                <div className="text-xs text-alloy-midnight/80 whitespace-pre-line leading-relaxed">
                                                    {quote.price_breakdown}
                                                </div>
                                            </Accordion>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Right column: Calendar (3/4 width) */}
                    <div className={quote && hasQuote ? "lg:col-span-3" : "lg:col-span-4"}>
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
                    </div>
                </div>

                {/* Frontend debug block (non-production only) */}
                {process.env.NODE_ENV !== "production" && quote && (
                    <div className="mt-6 p-3 bg-alloy-stone rounded-lg border border-alloy-stone/60">
                        <p className="text-xs font-semibold text-alloy-midnight mb-1">
                            Quote JSON (debug):
                        </p>
                        <pre className="text-[11px] font-mono whitespace-pre-wrap break-all text-alloy-midnight/90">
                            {JSON.stringify(quote, null, 2)}
                        </pre>
                    </div>
                )}
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
