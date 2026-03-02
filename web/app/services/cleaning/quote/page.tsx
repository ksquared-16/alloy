"use client";

import { useRouter } from "next/navigation";
import Section from "@/components/Section";
import CleaningQuickQuoteForm from "@/components/cleaning/CleaningQuickQuoteForm";

export default function CleaningQuoteStandalonePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-white">
      <Section className="py-12 md:py-16" maxWidth="xl">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold text-alloy-pine mb-2">
            Get a cleaning quote
          </h1>
          <p className="text-alloy-midnight/80 text-sm mb-8">
            This page is provided for compliance verification and allows the quote form to be viewed without opening a modal.
          </p>
          <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm">
            <div className="p-4 md:p-6 border-b border-alloy-stone/20">
              <p className="text-sm text-alloy-midnight/80">
                We&apos;ll calculate your price and save it so you can book when you&apos;re ready.
              </p>
            </div>
            <div className="p-4 md:p-6">
              <CleaningQuickQuoteForm
                onSuccess={() => {
                  router.push("/book-v2");
                }}
              />
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
