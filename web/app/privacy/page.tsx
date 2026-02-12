import Section from "@/components/Section";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <Section className="py-12 md:py-20">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-alloy-midnight mb-4">
            Privacy Policy
          </h1>
          <p className="text-alloy-midnight/80 mb-8">
            Effective Date: February 11, 2026
          </p>

          <div className="space-y-8 text-alloy-midnight/90">
            <p>
              Alloy (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) respects your privacy and is committed to protecting your personal information. This Privacy Policy explains how we collect, use, and safeguard your information when you use our website and services at https://workwithalloy.com.
            </p>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-3">
                1. Information We Collect
              </h2>
              <p className="mb-3">
                When you use our website or book services, we may collect the following information:
              </p>
              <h3 className="text-lg font-medium text-alloy-midnight mb-2 mt-4">
                Personal Information
              </h3>
              <ul className="list-disc pl-6 space-y-1 mb-4">
                <li>Name</li>
                <li>Email address</li>
                <li>Phone number</li>
                <li>Service address</li>
                <li>Booking details (home size, frequency, add-ons, etc.)</li>
              </ul>
              <h3 className="text-lg font-medium text-alloy-midnight mb-2">
                Payment Information
              </h3>
              <p className="mb-4">
                Payment information is processed securely through Stripe. Alloy does not store full credit card numbers on our servers.
              </p>
              <h3 className="text-lg font-medium text-alloy-midnight mb-2">
                Technical Information
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>IP address</li>
                <li>Browser type</li>
                <li>Device information</li>
                <li>Pages visited</li>
                <li>Cookies and similar technologies</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-3">
                2. How We Use Your Information
              </h2>
              <p className="mb-2">We use your information to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Process service bookings</li>
                <li>Schedule and manage appointments</li>
                <li>Send booking confirmations and reminders</li>
                <li>Provide customer support</li>
                <li>Process payments</li>
                <li>Improve our website and services</li>
                <li>Prevent fraud or abuse</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-3">
                3. SMS Communications
              </h2>
              <p className="mb-3">
                If you provide your phone number and consent to receive text messages, we may send you SMS messages related to:
              </p>
              <ul className="list-disc pl-6 space-y-1 mb-3">
                <li>Booking confirmations</li>
                <li>Appointment reminders</li>
                <li>Service updates</li>
                <li>Customer support responses</li>
              </ul>
              <p className="mb-3">
                Message frequency varies. Message and data rates may apply.
              </p>
              <p className="mb-3">
                You may opt out at any time by replying STOP to any message.
                <br />
                For assistance, reply HELP.
              </p>
              <p>
                We do not sell, rent, or share SMS consent or phone numbers with third parties for marketing purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-3">
                4. How We Share Information
              </h2>
              <p className="mb-3">
                We may share information only with trusted service providers necessary to operate our business, including:
              </p>
              <ul className="list-disc pl-6 space-y-1 mb-3">
                <li>Stripe (payment processing)</li>
                <li>Twilio (SMS delivery)</li>
                <li>Supabase (secure data storage)</li>
                <li>Hosting providers</li>
              </ul>
              <p className="mb-3">
                These providers are contractually obligated to protect your information.
              </p>
              <p>We do not sell personal information.</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-3">
                5. Data Security
              </h2>
              <p className="mb-3">
                We implement reasonable administrative, technical, and physical safeguards to protect your information.
              </p>
              <p>
                However, no method of transmission over the internet is 100% secure.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-3">
                6. Data Retention
              </h2>
              <p className="mb-2">
                We retain customer information as long as necessary to:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Provide services</li>
                <li>Comply with legal obligations</li>
                <li>Resolve disputes</li>
                <li>Enforce agreements</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-3">
                7. Cookies
              </h2>
              <p className="mb-3">
                We may use cookies and similar technologies to improve website functionality and analyze site usage.
              </p>
              <p>
                You may adjust your browser settings to refuse cookies.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-3">
                8. Your Rights
              </h2>
              <p className="mb-3">
                Depending on your location, you may have rights to:
              </p>
              <ul className="list-disc pl-6 space-y-1 mb-3">
                <li>Access your personal information</li>
                <li>Request corrections</li>
                <li>Request deletion</li>
              </ul>
              <p>
                To exercise these rights, contact us at:{" "}
                <a
                  href="mailto:support@workwithalloy.com"
                  className="text-alloy-blue hover:underline"
                >
                  support@workwithalloy.com
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-3">
                9. Children&apos;s Privacy
              </h2>
              <p>
                Our services are not directed to individuals under the age of 18.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-3">
                10. Changes to This Policy
              </h2>
              <p>
                We may update this Privacy Policy from time to time. Updates will be posted on this page with a revised effective date.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-alloy-midnight mb-3">
                11. Contact Us
              </h2>
              <p className="mb-2">
                If you have questions about this Privacy Policy, contact:
              </p>
              <p className="mb-1">Alloy</p>
              <p className="mb-1">
                <a
                  href="mailto:support@workwithalloy.com"
                  className="text-alloy-blue hover:underline"
                >
                  support@workwithalloy.com
                </a>
              </p>
              <p>
                <a
                  href="https://workwithalloy.com"
                  className="text-alloy-blue hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  https://workwithalloy.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </Section>
    </div>
  );
}
