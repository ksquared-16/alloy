import CTAButton from "@/components/marketing/CTAButton";
import SectionShell from "@/components/marketing/SectionShell";

export default function AboutPage() {
  return (
    <>
      <SectionShell className="!pt-12 md:!pt-16" innerClassName="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-alloy-juniper">About</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-alloy-forge md:text-5xl">
          Why Alloy Exists
        </h1>
        <p className="mt-6 text-xl font-medium leading-relaxed text-alloy-forge">
          Childcare operators do not need more software. They need fewer systems.
        </p>
        <p className="mt-6 text-lg leading-relaxed text-alloy-forge/70">
          Alloy was built to connect operational workflows, eliminate fragmented processes, and help
          teams spend less time managing systems and more time serving families.
        </p>
        <p className="mt-4 text-lg leading-relaxed text-alloy-forge/70">
          Most tools in childcare were designed as standalone products — a CRM here, a forms tool
          there, email in another tab. Operators end up copying data, chasing context, and
          reconciling reports that should already agree. Alloy replaces that patchwork with a
          platform where enrollment, communications, documents, and tasks share one record model.
        </p>
      </SectionShell>

      <SectionShell variant="muted">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-alloy-forge md:text-3xl">Built Differently</h2>
          <p className="mt-4 text-lg leading-relaxed text-alloy-forge/70">
            Most software starts with features. Alloy started with the foundation — entities,
            workflows, lifecycle, layouts, forms, permissions, documents, messaging, and tasks,
            powered by the BOS Intelligence Layer.
          </p>
          <p className="mt-4 text-lg leading-relaxed text-alloy-forge/70">
            That foundation means new operational workflows can be added without creating another
            disconnected system. Enrollment & Family Operations is the first workflow on Alloy. It
            will not be the last.
          </p>
        </div>
      </SectionShell>

      <SectionShell>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-alloy-forge">See what a unified platform feels like</h2>
          <p className="mt-4 text-alloy-forge/70">
            We would love to show you Alloy — starting with enrollment operations and the platform
            underneath.
          </p>
          <div className="mt-8">
            <CTAButton href="/contact">Book a Demo</CTAButton>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
