import CTAButton from "@/components/marketing/CTAButton";
import MarketingAssetPlaceholder from "@/components/marketing/MarketingAssetPlaceholder";
import SectionShell from "@/components/marketing/SectionShell";
import { MARKETING_ASSETS } from "@/lib/marketing/artifactPaths";

const SHIPPED = [
  "Platform Foundation",
  "Business Processes",
  "Processing",
  "Operational Intelligence / BOS",
  "Communications",
  "Documents & Forms",
  "Automation",
] as const;

const NEXT_DIRECTION = [
  "Billing",
  "Payments",
  "Attendance",
  "Scheduling",
  "Staffing",
  "Family Experience",
  "Reporting & Analytics",
] as const;

export default function VisionPage() {
  return (
    <>
      <SectionShell className="!pt-12 md:!pt-16" innerClassName="max-w-3xl">
        <p className="marketing-eyebrow">Vision & Roadmap</p>
        <h1 className="marketing-section-headline mt-3">
          From today&apos;s operations to the operating system for work
        </h1>
        <p className="marketing-body-lg mt-6">
          Alloy starts where operational pressure is highest and expands toward one operating system
          that moves work forward. This roadmap reflects direction, not guaranteed release dates.
        </p>
      </SectionShell>

      <SectionShell variant="muted">
        <div className="grid items-start gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-alloy-bend-pine">
              Shipped / Current
            </h2>
            <ul className="mt-4 space-y-3">
              {SHIPPED.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-lg border border-alloy-bend-pine/15 bg-alloy-bend-pine/5 px-4 py-3"
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-alloy-bend-pine" aria-hidden />
                  <span className="text-sm font-medium text-alloy-midnight-forge">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-alloy-midnight-forge/45">
              Next — Direction, not commitments
            </h2>
            <ul className="mt-4 space-y-3">
              {NEXT_DIRECTION.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-lg border border-alloy-midnight-forge/8 bg-white px-4 py-3"
                >
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full border border-alloy-midnight-forge/25"
                    aria-hidden
                  />
                  <span className="text-sm text-alloy-midnight-forge/70">{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-alloy-midnight-forge/50">
              Sequencing and scope may change as we learn from operators in the field. We share
              direction early so you can see where Alloy is headed — not to lock in timelines.
            </p>
          </div>
        </div>
      </SectionShell>

      <SectionShell>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.platformExpansion.key}
            alt={MARKETING_ASSETS.platformExpansion.alt}
          />
          <div>
            <h2 className="text-2xl font-bold text-alloy-midnight-forge md:text-3xl">
              One operating system. One source of truth. Work that moves forward.
            </h2>
            <p className="mt-4 text-lg text-alloy-midnight-forge/70">
              The goal is not more software — it is fewer systems. Every Business Process Alloy adds
              shares the same foundation, so operators stop being the integration layer.
            </p>
            <div className="mt-8">
              <CTAButton href="/contact">Request a Demo</CTAButton>
            </div>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
