import CTAButton from "@/components/marketing/CTAButton";
import SectionShell from "@/components/marketing/SectionShell";

export default function AboutPage() {
  return (
    <>
      <SectionShell density="compact" className="!pt-10 md:!pt-14" innerClassName="max-w-2xl">
        <p className="marketing-eyebrow">About</p>
        <h1 className="marketing-page-headline mt-3">Why Alloy Exists</h1>
        <p className="mt-5 text-lg font-medium leading-snug tracking-[-0.015em] text-alloy-midnight-forge md:text-xl">
          Organizations that serve people do not need more software. They need work that moves
          forward.
        </p>
        <div className="marketing-body-lg mt-6 space-y-4">
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

      <SectionShell variant="muted" density="compact">
        <div className="mx-auto max-w-2xl">
          <h2 className="marketing-section-headline">Built Differently</h2>
          <div className="marketing-body-lg mt-4 space-y-4">
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
        <div className="mx-auto max-w-md text-center">
          <h2 className="marketing-statement-headline">See where work happens</h2>
          <p className="marketing-body mt-3">
            We would love to show you Alloy — Business Processes, Processing, and Operational
            Intelligence working together.
          </p>
          <div className="mt-7">
            <CTAButton href="/contact">Book a Demo</CTAButton>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
