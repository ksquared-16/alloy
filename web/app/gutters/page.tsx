import Section from "@/components/Section";
import PrimaryButton from "@/components/PrimaryButton";
import GutterLeadForm from "@/components/gutters/GutterLeadForm";

export default function GuttersPage() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-alloy-stone">
        <div className="mx-auto max-w-6xl px-4 md:px-8 py-6 md:py-10">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h1 className="text-3xl md:text-5xl font-bold text-alloy-pine">
              Gutter Cleaning — Sign up early and get $25 off your first service
            </h1>
            <p className="text-base md:text-lg text-alloy-midnight/80">
              Keep your gutters clean and your home protected. Sign up now to be
              notified when gutter cleaning becomes available in your area.
            </p>
          </div>
        </div>
      </section>

      {/* Form Section */}
      <Section className="py-10 md:py-12">
        <div className="max-w-2xl mx-auto">
          <GutterLeadForm />
        </div>
      </Section>
    </div>
  );
}

