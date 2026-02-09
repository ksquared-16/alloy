import Section from "@/components/Section";

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <Section className="py-12 md:py-20">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-alloy-midnight mb-8">
            Terms of Service &amp; SMS Consent
          </h1>

          <div className="space-y-8 text-alloy-midnight/90">
            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-2">
                SMS Consent
              </h2>
              <p>
                By providing your phone number during booking or account
                interactions, you consent to receive transactional SMS messages
                from Alloy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-2">
                Message Types
              </h2>
              <p className="mb-2">Transactional messages only, including:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Booking confirmations</li>
                <li>Schedule updates</li>
                <li>Service notifications</li>
                <li>Customer support messages</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-2">
                Frequency
              </h2>
              <p>
                Message frequency varies based on activity.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-2">
                Opt-Out
              </h2>
              <p>
                Reply <strong>STOP</strong> to unsubscribe at any time.
                Reply <strong>HELP</strong> for help.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-2">
                Fees
              </h2>
              <p>Message and data rates may apply.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-2">
                No Marketing
              </h2>
              <p>
                Alloy does not send marketing or promotional SMS messages.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-2">
                Support Contact
              </h2>
              <p>
                For support, contact:{" "}
                <a
                  href="mailto:support@workwithalloy.com"
                  className="text-alloy-blue hover:underline"
                >
                  support@workwithalloy.com
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-2">
                Last Updated
              </h2>
              <p>Last updated: 2026-02-09</p>
            </section>
          </div>
        </div>
      </Section>
    </div>
  );
}
