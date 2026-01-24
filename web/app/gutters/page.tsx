"use client";

import { useRef } from "react";
import Section from "@/components/Section";
import PrimaryButton from "@/components/PrimaryButton";
import GutterLeadForm from "@/components/gutters/GutterLeadForm";

export default function GuttersPage() {
  const formRef = useRef<HTMLDivElement>(null);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-alloy-stone">
        <div className="mx-auto max-w-6xl px-4 md:px-8 py-6 md:py-10">
          <div className="relative min-h-[420px] md:h-[400px] lg:h-[460px] overflow-hidden rounded-xl shadow-lg">
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-alloy-midnight/60 via-alloy-midnight/25 to-transparent" />

            {/* Content Overlay */}
            <div className="relative z-10 flex min-h-[420px] md:h-full items-center py-8 md:py-0 px-4 md:px-10 lg:px-12">
              <div className="max-w-xl space-y-3 md:space-y-6 w-full">
                <h1 className="text-3xl md:text-5xl lg:text-5xl font-bold text-white leading-tight">
                  Gutter Cleaning & Maintenance — Coming Soon
                </h1>
                <p className="text-base md:text-lg text-white/90">
                  Keep your gutters clean and your home protected. Sign up for early access and get $25 off your first service when we launch.
                </p>
                <ul className="space-y-2 text-sm md:text-base text-white/90 list-disc list-inside">
                  <li>Complete gutter cleaning and debris removal</li>
                  <li>Downspout flushing and inspection</li>
                  <li>Protect your home from water damage</li>
                </ul>
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={scrollToForm}
                    className="w-full sm:w-auto"
                  >
                    <PrimaryButton className="w-full sm:w-auto">
                      Request gutter quote
                    </PrimaryButton>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Gutters Matter */}
      <Section className="py-12 md:py-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-alloy-pine text-center mb-8 md:mb-12">
            Why Gutter Cleaning Matters
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <div className="bg-white rounded-lg p-6 border border-alloy-stone/30">
              <h3 className="text-xl font-semibold text-alloy-pine mb-3">
                Prevent Water Damage
              </h3>
              <p className="text-alloy-midnight/80">
                Clogged gutters can cause water to overflow and damage your roof, siding, and foundation. Regular cleaning prevents costly repairs.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-alloy-stone/30">
              <h3 className="text-xl font-semibold text-alloy-pine mb-3">
                Protect Your Investment
              </h3>
              <p className="text-alloy-midnight/80">
                Well-maintained gutters extend the life of your roof and prevent structural damage, protecting your home's value.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-alloy-stone/30">
              <h3 className="text-xl font-semibold text-alloy-pine mb-3">
                Avoid Pest Problems
              </h3>
              <p className="text-alloy-midnight/80">
                Standing water in clogged gutters attracts mosquitoes and other pests. Clean gutters help keep your home pest-free.
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 border border-alloy-stone/30">
              <h3 className="text-xl font-semibold text-alloy-pine mb-3">
                Maintain Curb Appeal
              </h3>
              <p className="text-alloy-midnight/80">
                Clean, well-maintained gutters keep your home looking its best and prevent unsightly stains and damage.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* What's Included */}
      <Section className="py-12 md:py-20 bg-alloy-pine/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-alloy-pine text-center mb-8 md:mb-12">
            What's Included
          </h2>
          <div className="bg-white rounded-lg p-6 md:p-8 border border-alloy-stone/30">
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-alloy-juniper flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <h3 className="font-semibold text-alloy-pine mb-1">Complete Gutter Cleaning</h3>
                  <p className="text-alloy-midnight/80">Remove all debris, leaves, and buildup from gutters and downspouts.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-alloy-juniper flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <h3 className="font-semibold text-alloy-pine mb-1">Downspout Flushing</h3>
                  <p className="text-alloy-midnight/80">Ensure downspouts are clear and water flows freely away from your home.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-alloy-juniper flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <h3 className="font-semibold text-alloy-pine mb-1">Visual Inspection</h3>
                  <p className="text-alloy-midnight/80">Check for damage, leaks, or areas that need repair or attention.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-6 h-6 text-alloy-juniper flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <h3 className="font-semibold text-alloy-pine mb-1">Debris Removal</h3>
                  <p className="text-alloy-midnight/80">Clean up and dispose of all removed debris from your property.</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Early Access Form */}
      <Section id="quote-form" ref={formRef} className="pt-6 pb-0 bg-white">
        <div className="max-w-2xl md:max-w-4xl mx-auto">
          <div className="rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm bg-white">
            <div className="flex items-center justify-between p-4 md:p-6 border-b border-alloy-stone/20">
              <h2 className="text-xl font-bold text-alloy-midnight">
                Get early access
              </h2>
            </div>
            <div className="p-4 md:p-6">
              <GutterLeadForm />
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

