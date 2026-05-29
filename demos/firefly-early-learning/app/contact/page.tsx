import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Schedule a Tour",
};

const ALLOY_FORM_EMBED_URL =
  "https://staging.workwithalloy.com/forms/embed/M7s1RqP7cidtef-zqR7iqjIT6VTVIyucRHSnEmbBOFA";

export default function ContactPage() {
  return (
    <section className="bg-cream px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-[900px]">
        <h1 className="text-3xl font-semibold tracking-tight text-navy sm:text-4xl">
          Schedule a Tour
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          Interested in learning more about Firefly Early Learning? Complete the
          form below and a member of our enrollment team will contact you.
        </p>

        <div className="mt-10 overflow-hidden rounded-2xl border border-cream-dark bg-white shadow-sm">
          <iframe
            src={ALLOY_FORM_EMBED_URL}
            width="100%"
            height={720}
            className="block w-full border-0"
            title="new_enrollment_lead"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
