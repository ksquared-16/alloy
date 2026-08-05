import CTAButton from "@/components/marketing/CTAButton";
import MarketingAssetPlaceholder from "@/components/marketing/MarketingAssetPlaceholder";
import SectionShell from "@/components/marketing/SectionShell";
import { MARKETING_ASSETS } from "@/lib/marketing/artifactPaths";

const FOUNDATION_CAPABILITIES = [
  {
    title: "Business Processes",
    description:
      "Stages, transitions, and requirements that organize how work advances — the primary structure of operations.",
  },
  {
    title: "Processing",
    description:
      "Turn intake, documents, and operational inputs into structured action inside the Business Process.",
  },
  {
    title: "Operational Intelligence",
    description:
      "Surface what matters, what is waiting, and what requires attention where teams already work.",
  },
  {
    title: "Records & Permissions",
    description:
      "People, opportunities, and operational records — scoped by org, department, and site without bolt-on security.",
  },
  {
    title: "Documents & Communications",
    description:
      "Documents, messages, and tasks tied to the work — not scattered across inboxes and drives.",
  },
  {
    title: "Automation",
    description:
      "Registered events and configured automation that move Business Processes forward with auditability.",
  },
] as const;

export default function PlatformPage() {
  return (
    <>
      <SectionShell className="!pt-12 md:!pt-16" innerClassName="max-w-3xl">
        <p className="marketing-eyebrow">Platform</p>
        <h1 className="marketing-section-headline mt-3">Built to move work forward</h1>
        <p className="marketing-body-lg mt-6">
          Alloy is not a collection of point solutions stitched together. It is an operating system
          where Business Processes, Processing, and Operational Intelligence share one foundation —
          so teams stop being the integration layer.
        </p>
      </SectionShell>

      <SectionShell variant="muted" innerClassName="grid items-center gap-12 lg:grid-cols-2">
        <MarketingAssetPlaceholder
          assetKey={MARKETING_ASSETS.businessProcesses.key}
          alt={MARKETING_ASSETS.businessProcesses.alt}
        />
        <div>
          <h2 className="text-2xl font-bold text-alloy-midnight-forge">What the foundation includes</h2>
          <p className="mt-4 text-alloy-midnight-forge/70">
            Every operational area on Alloy runs on the same core capabilities — configured for your
            organization, not rebuilt from scratch.
          </p>
        </div>
      </SectionShell>

      <SectionShell>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FOUNDATION_CAPABILITIES.map((cap) => (
            <div
              key={cap.title}
              className="rounded-2xl border border-alloy-midnight-forge/10 bg-white p-6 shadow-[0_18px_50px_rgba(39,63,82,0.08)]"
            >
              <h3 className="text-lg font-semibold text-alloy-midnight-forge">{cap.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-alloy-midnight-forge/65">{cap.description}</p>
            </div>
          ))}
        </div>
      </SectionShell>

      <SectionShell variant="muted">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-alloy-midnight-forge md:text-3xl">
            Build the foundation once. Expand forever.
          </h2>
          <p className="mt-4 text-lg text-alloy-midnight-forge/70">
            New Business Processes plug into the same records, permissions, communications,
            Processing, and Operational Intelligence — instead of adding another disconnected system.
          </p>
          <div className="mt-8">
            <CTAButton href="/contact">Book a Demo</CTAButton>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
