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
      <SectionShell density="compact" className="!pt-10 md:!pt-14" innerClassName="max-w-2xl">
        <p className="marketing-eyebrow">Vision & Roadmap</p>
        <h1 className="marketing-page-headline mt-3">
          From today&apos;s operations to the operating system for work
        </h1>
        <p className="marketing-body-lg mt-4">
          Alloy starts where operational pressure is highest and expands toward one operating system
          that moves work forward. This roadmap reflects direction — not release dates.
        </p>
      </SectionShell>

      <SectionShell variant="muted" density="compact">
        <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-alloy-bend-pine">
              Shipped / Current
            </h2>
            <ul className="mt-4 space-y-1.5">
              {SHIPPED.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 rounded-xl border border-alloy-bend-pine/12 bg-white/70 px-3.5 py-2.5"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alloy-bend-pine" aria-hidden />
                  <span className="text-sm font-medium text-alloy-midnight-forge">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-alloy-midnight-forge/40">
              Next — Direction, not commitments
            </h2>
            <ul className="mt-4 space-y-1.5">
              {NEXT_DIRECTION.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 rounded-xl border border-alloy-midnight-forge/[0.07] bg-white px-3.5 py-2.5"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full border border-alloy-midnight-forge/30"
                    aria-hidden
                  />
                  <span className="text-sm text-alloy-midnight-forge/65">{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-relaxed text-alloy-midnight-forge/45">
              Sequencing may change as we learn from operators. We share direction early so you can
              see where Alloy is headed — not to lock timelines.
            </p>
          </div>
        </div>
      </SectionShell>

      <SectionShell density="compact">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.platformExpansion.key}
            alt={MARKETING_ASSETS.platformExpansion.alt}
            aspectClassName="aspect-[16/11]"
          />
          <div className="marketing-copy-measure">
            <h2 className="marketing-section-headline">
              One operating system. One source of truth. Work that moves forward.
            </h2>
            <p className="marketing-body-lg mt-3.5">
              The goal is not more software — it is fewer systems. Every Business Process Alloy adds
              shares the same foundation.
            </p>
            <div className="mt-7">
              <CTAButton href="/contact">Request a Demo</CTAButton>
            </div>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
