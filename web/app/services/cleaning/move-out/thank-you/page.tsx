import Section from "@/components/Section";

export default function MoveOutThankYouPage() {
  return (
    <div className="min-h-screen">
      <Section className="py-12 md:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-alloy-midnight mb-4">
            Thanks for submitting your request!
          </h1>
          <p className="text-lg text-alloy-midnight/80">
            Our team will review your information and provide a personalized quote shortly.
          </p>
        </div>
      </Section>
    </div>
  );
}


