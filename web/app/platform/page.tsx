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
    description: "Surface what matters, what is waiting, and what requires attention.",
  },
  {
    title: "Records & Permissions",
    description:
      "People, opportunities, and operational records — scoped by org, department, and site.",
  },
  {
    title: "Documents & Communications",
    description: "Documents, messages, and tasks tied to the work — not scattered across tools.",
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
      <SectionShell density="compact" className="!pt-14 md:!pt-20" innerClassName="max-w-2xl">
        <p className="marketing-eyebrow">Platform</p>
        <h1 className="marketing-page-headline mt-4">Built to move work forward</h1>
        <p className="marketing-body-lg mt-6">
          Alloy is not a collection of point solutions stitched together. It is an operating system
          where Business Processes, Processing, and Operational Intelligence share one foundation —
          so teams stop being the integration layer.
        </p>
      </SectionShell>

      <SectionShell variant="muted" density="default" innerClassName="grid items-center gap-14 lg:grid-cols-2 lg:gap-16">
        <MarketingAssetPlaceholder
          assetKey={MARKETING_ASSETS.businessProcesses.key}
          alt={MARKETING_ASSETS.businessProcesses.alt}
        />
        <div className="max-w-md">
          <h2 className="marketing-section-headline text-[1.75rem] md:text-[2rem]">
            What the foundation includes
          </h2>
          <p className="marketing-body mt-4">
            Every operational area on Alloy runs on the same core — configured for your organization,
            not rebuilt from scratch.
          </p>
        </div>
      </SectionShell>

      <SectionShell density="default">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {FOUNDATION_CAPABILITIES.map((cap, index) => (
            <div
              key={cap.title}
              className={`rounded-2xl border border-alloy-midnight-forge/[0.08] bg-white p-7 ${
                index < 3 ? "lg:border-alloy-midnight-forge/[0.1]" : ""
              }`}
            >
              <h3 className="text-base font-semibold tracking-[-0.01em] text-alloy-midnight-forge">
                {cap.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-alloy-midnight-forge/60">
                {cap.description}
              </p>
            </div>
          ))}
        </div>
      </SectionShell>

      <SectionShell variant="muted" density="compact">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="marketing-section-headline">Build the foundation once. Expand forever.</h2>
          <p className="marketing-body-lg mt-5">
            New Business Processes plug into the same records, permissions, communications,
            Processing, and Operational Intelligence — instead of adding another disconnected system.
          </p>
          <div className="mt-9">
            <CTAButton href="/contact">Book a Demo</CTAButton>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
