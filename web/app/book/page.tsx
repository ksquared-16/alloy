import Section from "@/components/Section";
import GhlEmbed from "@/components/GhlEmbed";

export default function BookPage() {
  return (
    <div className="min-h-screen">
      <Section className="py-6 md:py-10">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold text-alloy-midnight mb-4">
            Book your cleaning
          </h1>
          <p className="text-lg text-alloy-midnight/80 mb-4">
            Choose a time that works for you. We'll confirm by text.
          </p>
          <p className="text-sm text-alloy-midnight/60 mb-6">
            You'll pay after the clean is completed. We'll text to confirm details.
          </p>
          <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-6">
            <GhlEmbed
              src="https://api.leadconnectorhq.com/widget/booking/GficiTFm4cbAbQ05IHwz"
              title="Booking Calendar"
              height={1200}
              className="!min-h-[1200px] md:!min-h-[900px]"
            />
          </div>
        </div>
      </Section>
    </div>
  );
}

