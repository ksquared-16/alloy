import CTAButton from "@/components/marketing/CTAButton";
import SectionShell from "@/components/marketing/SectionShell";

export default function AboutPage() {
  return (
    <>
      <SectionShell density="spacious" className="!pt-14 md:!pt-20" innerClassName="max-w-2xl">
        <p className="marketing-eyebrow">About</p>
        <h1 className="marketing-page-headline mt-4">Why Alloy Exists</h1>
        <p className="mt-7 text-xl font-medium leading-relaxed tracking-[-0.015em] text-alloy-midnight-forge md:text-[1.375rem]">
          Organizations that serve people do not need more software. They need work that moves
          forward.
        </p>
        <div className="marketing-body-lg mt-8 space-y-5">
          <p>
            Alloy was built so teams spend less time managing systems and more time doing the work —
            through Business Processes, Processing, and Operational Intelligence on one foundation.
          </p>
          <p>
            Most tools were designed as standalone products — a CRM here, forms there, email in another
            tab. Operators copy data, chase context, and reconcile reports that should already agree.
            Alloy replaces that patchwork with an operating system where records, communications,
            documents, and actions share one model.
          </p>
        </div>
      </SectionShell>

      <SectionShell variant="muted" density="default">
        <div className="mx-auto max-w-2xl">
          <h2 className="marketing-section-headline">Built Differently</h2>
          <div className="marketing-body-lg mt-6 space-y-5">
            <p>
              Most software starts with features. Alloy started with the foundation — records,
              Business Processes, Processing, permissions, documents, communications, and Operational
              Intelligence.
            </p>
            <p>
              That foundation means new operational areas can be added without creating another
              disconnected system. Alloy moves work forward today — and expands without starting over.
            </p>
          </div>
        </div>
      </SectionShell>

      <SectionShell density="compact">
        <div className="mx-auto max-w-lg text-center">
          <h2 className="marketing-section-headline">See where work happens</h2>
          <p className="marketing-body mt-4">
            We would love to show you Alloy — Business Processes, Processing, and Operational
            Intelligence working together.
          </p>
          <div className="mt-9">
            <CTAButton href="/contact">Book a Demo</CTAButton>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
