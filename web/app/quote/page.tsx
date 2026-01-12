"use client";

import Link from "next/link";
import Section from "@/components/Section";
import PrimaryButton from "@/components/PrimaryButton";

export default function QuoteSelectionPage() {
  return (
    <div className="min-h-screen">
      <Section className="py-12 md:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-alloy-pine mb-4">
            What do you need?
          </h1>
          <p className="text-base md:text-lg text-alloy-midnight/80 mb-8">
            Select a service to get started with a quote.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            {/* Cleaning Option */}
            <Link href="/services/cleaning?open=1#quote-form">
              <div className="bg-white rounded-lg shadow-md p-6 md:p-8 border border-alloy-stone/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer">
                <div className="text-4xl mb-4">🏠</div>
                <h2 className="text-xl font-bold text-alloy-pine mb-2">
                  Home Cleaning
                </h2>
                <p className="text-alloy-midnight/70 mb-4">
                  Professional home cleaning services in Bend, Oregon.
                </p>
                <PrimaryButton className="w-full">Get a cleaning quote</PrimaryButton>
              </div>
            </Link>

            {/* Gutters Option */}
            <Link href="/gutters">
              <div className="bg-white rounded-lg shadow-md p-6 md:p-8 border border-alloy-stone/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 cursor-pointer">
                <div className="text-4xl mb-4">🪟</div>
                <h2 className="text-xl font-bold text-alloy-pine mb-2">
                  Gutter Cleaning
                </h2>
                <p className="text-alloy-midnight/70 mb-4">
                  Sign up early and get $25 off your first service.
                </p>
                <PrimaryButton className="w-full">Get Early Access</PrimaryButton>
              </div>
            </Link>
          </div>
        </div>
      </Section>
    </div>
  );
}

