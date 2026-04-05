import { Suspense } from "react";
import Section from "@/components/Section";
import PublicPageShell from "@/components/PublicPageShell";
import SpecialtyQuoteTypeClient from "./SpecialtyQuoteTypeClient";

export default function SpecialtyQuotePage() {
  return (
    <PublicPageShell>
      <div className="min-h-screen">
        <Section className="py-12 md:py-20">
          <div className="max-w-4xl mx-auto">
            <Suspense
              fallback={
                <div className="bg-white rounded-xl p-6 border border-alloy-stone/50">
                  <p className="text-alloy-midnight/60">Loading…</p>
                </div>
              }
            >
              <SpecialtyQuoteTypeClient />
            </Suspense>
          </div>
        </Section>
      </div>
    </PublicPageShell>
  );
}
