"use client";

import { useState } from "react";
import Section from "@/components/Section";
import PrimaryButton from "@/components/PrimaryButton";
import CleaningQuoteForm from "@/components/cleaning/CleaningQuoteForm";
import GutterLeadForm from "@/components/gutters/GutterLeadForm";

type SelectedService = "cleaning" | "gutters" | null;

export default function QuoteSelectionPage() {
  const [selectedService, setSelectedService] = useState<SelectedService>(null);

  return (
    <div className="min-h-screen">
      <Section className="py-12 md:py-20">
        <div className="max-w-4xl mx-auto">
          {!selectedService ? (
            <>
              <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-bold text-alloy-pine mb-4">
                  What service do you need?
                </h1>
                <p className="text-base md:text-lg text-alloy-midnight/80 mb-8">
                  Select a service to get started.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                {/* Cleaning Option */}
                <button
                  onClick={() => setSelectedService("cleaning")}
                  className="bg-white rounded-lg shadow-md p-6 md:p-8 border border-alloy-stone/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer text-left"
                >
                  <div className="text-4xl mb-4">🏠</div>
                  <h2 className="text-xl font-bold text-alloy-pine mb-2">
                    Home Cleaning
                  </h2>
                  <p className="text-alloy-midnight/70 mb-4">
                    Professional home cleaning services in Bend, Oregon.
                  </p>
                  <PrimaryButton className="w-full">Get a cleaning quote</PrimaryButton>
                </button>

                {/* Gutter Cleaning Option */}
                <button
                  onClick={() => setSelectedService("gutters")}
                  className="bg-white rounded-lg shadow-md p-6 md:p-8 border border-alloy-stone/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer text-left"
                >
                  <div className="text-4xl mb-4">🪟</div>
                  <h2 className="text-xl font-bold text-alloy-pine mb-2">
                    Gutter Cleaning
                  </h2>
                  <p className="text-alloy-midnight/70 mb-4">
                    Sign up early and get $25 off your first service.
                  </p>
                  <PrimaryButton className="w-full">Get Early Access</PrimaryButton>
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Back button */}
              <div className="mb-6">
                <button
                  onClick={() => setSelectedService(null)}
                  className="text-sm text-alloy-midnight/70 hover:text-alloy-midnight transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to service selection
                </button>
              </div>

              {/* Form section */}
              <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm">
                <div className="flex items-center justify-between p-4 md:p-6 border-b border-alloy-stone/20">
                  <h2 className="text-xl font-bold text-alloy-midnight">
                    {selectedService === "cleaning" ? "Get a cleaning quote" : "Get early access"}
                  </h2>
                </div>
                <div className="p-4 md:p-6">
                  {selectedService === "cleaning" ? (
                    <CleaningQuoteForm />
                  ) : (
                    <GutterLeadForm />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </Section>
    </div>
  );
}
