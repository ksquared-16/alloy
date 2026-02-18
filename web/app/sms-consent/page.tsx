"use client";

import Link from "next/link";
import Section from "@/components/Section";

const CONSENT_LANGUAGE =
  "I agree to receive transactional SMS messages from Alloy regarding my quote, appointment updates, and service notifications. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Consent is not a condition of purchase.";

export default function SmsConsentPage() {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <div className="min-h-screen">
      <Section className="py-12 md:py-20">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-alloy-midnight mb-4">
            SMS Consent & Compliance Information
          </h1>
          <p className="text-alloy-midnight/80 mb-8">
            This page is provided to document Alloy&apos;s SMS opt-in language and consent method for compliance verification.
          </p>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-alloy-midnight mb-3">
              Step-by-step opt-in flow
            </h2>
            <ul className="list-disc pl-6 space-y-2 text-alloy-midnight/90">
              <li>User visits workwithalloy.com or /services/cleaning</li>
              <li>Clicks &quot;Get a Quote&quot;</li>
              <li>Booking form appears (no login required)</li>
              <li>User enters phone number manually</li>
              <li>Consent checkbox below phone field is unchecked by default</li>
              <li>User must actively check to opt in</li>
              <li>Consent is not required to complete booking</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-alloy-midnight mb-4">
              Example Consent Form (Verification Only)
            </h2>
            <p className="mb-4 text-sm text-alloy-midnight/70">
              Checkbox is unchecked by default and must be actively selected by the user to opt in.
            </p>
            <form
              onSubmit={handleSubmit}
              className="rounded-lg border border-alloy-stone/40 bg-white p-6 shadow-sm"
            >
              <div className="mb-4">
                <label htmlFor="sms-consent-phone" className="mb-2 block text-sm font-medium text-alloy-midnight">
                  Phone number
                </label>
                <input
                  id="sms-consent-phone"
                  type="tel"
                  placeholder="(555) 123-4567"
                  className="w-full rounded-md border border-alloy-stone/60 px-4 py-2 text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                  readOnly
                  aria-label="Example phone field (verification only)"
                />
              </div>
              <div className="mb-6">
                <label className="flex gap-3 text-sm text-alloy-midnight/90">
                  <input
                    type="checkbox"
                    defaultChecked={false}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-alloy-stone/60"
                    readOnly
                    aria-label="Example consent checkbox (verification only)"
                  />
                  <span>{CONSENT_LANGUAGE}</span>
                </label>
              </div>
              <button
                type="submit"
                disabled
                className="cursor-not-allowed rounded-md bg-alloy-stone/50 px-4 py-2 text-sm font-medium text-alloy-midnight/60"
              >
                Example Only (No Submission)
              </button>
            </form>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-alloy-midnight mb-3">
              Compliance notes
            </h2>
            <ul className="list-disc pl-6 space-y-1 text-alloy-midnight/90 text-sm">
              <li>Transactional and conversational only</li>
              <li>No marketing or promotional messages</li>
              <li>Reply STOP to opt out, HELP for help</li>
              <li>Consent records are stored securely (in production flow)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-alloy-midnight mb-3">
              Related
            </h2>
            <ul className="space-y-2 text-alloy-midnight/90">
              <li>
                <Link href="/privacy" className="text-alloy-blue hover:underline">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-alloy-blue hover:underline">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </Section>
    </div>
  );
}
