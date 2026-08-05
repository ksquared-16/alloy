import CTAButton from "@/components/marketing/CTAButton";
import SectionShell from "@/components/marketing/SectionShell";

export default function AboutPage() {
  return (
    <>
      <SectionShell className="!pt-12 md:!pt-16" innerClassName="max-w-3xl">
        <p className="marketing-eyebrow">About</p>
        <h1 className="marketing-section-headline mt-3">Why Alloy Exists</h1>
        <p className="mt-6 text-xl font-medium leading-relaxed text-alloy-midnight-forge">
          Organizations that serve people do not need more software. They need work that moves
          forward.
        </p>
        <p className="marketing-body-lg mt-6">
          Alloy was built so teams spend less time managing systems and more time doing the work —
          through Business Processes, Processing, and Operational Intelligence on one foundation.
        </p>
        <p className="marketing-body-lg mt-4">
          Most tools were designed as standalone products — a CRM here, a forms tool there, email in
          another tab. Operators end up copying data, chasing context, and reconciling reports that
          should already agree. Alloy replaces that patchwork with an operating system where records,
          communications, documents, and actions share one model.
        </p>
      </SectionShell>

      <SectionShell variant="muted">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-alloy-midnight-forge md:text-3xl">Built Differently</h2>
          <p className="marketing-body-lg mt-4">
            Most software starts with features. Alloy started with the foundation — records,
            Business Processes, Processing, permissions, documents, communications, and Operational
            Intelligence.
          </p>
          <p className="marketing-body-lg mt-4">
            That foundation means new operational areas can be added without creating another
            disconnected system. Alloy moves work forward today — and expands without starting over.
          </p>
        </div>
      </SectionShell>

      <SectionShell>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-alloy-midnight-forge">See where work happens</h2>
          <p className="mt-4 text-alloy-midnight-forge/70">
            We would love to show you Alloy — Business Processes, Processing, and Operational
            Intelligence working together.
          </p>
          <div className="mt-8">
            <CTAButton href="/contact">Book a Demo</CTAButton>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
