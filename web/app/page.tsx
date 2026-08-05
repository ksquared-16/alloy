import CTAButton from "@/components/marketing/CTAButton";
import HeroCapabilityStrip from "@/components/marketing/HeroCapabilityStrip";
import MarketingAssetPlaceholder from "@/components/marketing/MarketingAssetPlaceholder";
import SectionShell from "@/components/marketing/SectionShell";
import { MARKETING_ASSETS } from "@/lib/marketing/artifactPaths";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "Where Work Happens",
  },
  description:
    "Most software stores information. Alloy moves work forward — Business Processes, Processing, and Operational Intelligence in one operating system.",
};

function SectionHeading({
  title,
  subtitle,
  align = "left",
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  eyebrow?: string;
}) {
  const alignClass = align === "center" ? "text-center mx-auto" : "";
  return (
    <div className={`max-w-2xl ${alignClass}`}>
      {eyebrow ? <p className="marketing-eyebrow mb-4">{eyebrow}</p> : null}
      <h2 className="marketing-section-headline">{title}</h2>
      {subtitle ? <p className="marketing-body-lg mt-5">{subtitle}</p> : null}
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      {/* Hero — native copy + isolated illustration slot */}
      <SectionShell
        className="!pt-12 md:!pt-16 lg:!pt-20"
        innerClassName="grid items-center gap-12 lg:grid-cols-[42%_1fr] lg:gap-14"
      >
        <div>
          <p className="marketing-eyebrow">The modern operating system for operations</p>
          <h1 className="marketing-display-headline mt-5">
            <span className="block text-alloy-midnight-forge">Most software stores information.</span>
            <span className="mt-2 block text-alloy-bend-pine">Alloy moves work forward.</span>
          </h1>
          <div className="marketing-body-lg mt-6 max-w-lg space-y-4">
            <p>Work doesn&apos;t happen inside one application.</p>
            <p>
              It moves between people, decisions, communications, documents, approvals, and Business
              Processes.
            </p>
            <p>
              Alloy connects them into one operating system so your team can focus on the work—not
              the software.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <CTAButton href="/contact">Book a Demo</CTAButton>
            <CTAButton href="/platform" variant="secondary">
              Explore the Platform
            </CTAButton>
          </div>
        </div>
        <MarketingAssetPlaceholder
          assetKey={MARKETING_ASSETS.hero.key}
          alt={MARKETING_ASSETS.hero.alt}
          aspectClassName="aspect-[4/3]"
          priority
        />
      </SectionShell>

      <HeroCapabilityStrip />

      {/* Stop stitching */}
      <SectionShell variant="muted">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.disconnectedToUnified.key}
            alt={MARKETING_ASSETS.disconnectedToUnified.alt}
            className="order-2 lg:order-1"
          />
          <div className="order-1 lg:order-2">
            <SectionHeading
              title="Stop stitching software together"
              subtitle="CRM, email, forms, tasks, documents, and reports often live in separate places. People become the integration layer. Alloy replaces that patchwork with one operating system that moves work forward."
            />
          </div>
        </div>
      </SectionShell>

      {/* Business Processes — pillar */}
      <SectionShell>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              eyebrow="Business Processes"
              title="Built around Business Processes"
              subtitle="Business Processes organize how work advances — stages, decisions, requirements, and outcomes — so every action has a place to land and a next step to take."
            />
            <p className="mt-6">
              <Link href="/platform" className="text-sm font-semibold text-alloy-bend-pine hover:underline">
                Explore Business Processes →
              </Link>
            </p>
          </div>
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.businessProcesses.key}
            alt={MARKETING_ASSETS.businessProcesses.alt}
          />
        </div>
      </SectionShell>

      {/* Processing — pillar */}
      <SectionShell variant="muted">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.processing.key}
            alt={MARKETING_ASSETS.processing.alt}
            className="order-2 lg:order-1"
          />
          <div className="order-1 lg:order-2">
            <SectionHeading
              eyebrow="Processing"
              title="Processing turns information into action"
              subtitle="Intake, documents, and operational inputs should not sit idle. Processing converts information into structured progress inside the Business Process."
            />
          </div>
        </div>
      </SectionShell>

      {/* Operational Intelligence — pillar */}
      <SectionShell>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              eyebrow="Operational Intelligence"
              title="Operational Intelligence tells you what needs attention"
              subtitle="Know what matters, what is waiting, and what requires a decision — without hunting across inboxes and spreadsheets."
            />
          </div>
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.operationalIntelligence.key}
            alt={MARKETING_ASSETS.operationalIntelligence.alt}
          />
        </div>
      </SectionShell>

      {/* Communications */}
      <SectionShell variant="muted">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.communications.key}
            alt={MARKETING_ASSETS.communications.alt}
            className="order-2 lg:order-1"
          />
          <div className="order-1 lg:order-2">
            <SectionHeading
              title="Every conversation stays connected"
              subtitle="Messages stay attached to the people and work they belong to — so context does not disappear when the thread closes."
            />
          </div>
        </div>
      </SectionShell>

      {/* AI / BOS */}
      <SectionShell>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              title="AI that understands your business"
              subtitle="BOS operates through your records, Business Processes, permissions, and audit paths — helping teams move work forward without inventing a parallel system."
            />
          </div>
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.bos.key}
            alt={MARKETING_ASSETS.bos.alt}
          />
        </div>
      </SectionShell>

      {/* One OS */}
      <SectionShell variant="muted">
        <div className="mx-auto max-w-3xl text-center">
          <SectionHeading
            align="center"
            title="One operating system, endless possibilities"
            subtitle="Most software starts with features. Alloy started with the foundation — so new operational areas can expand without creating another disconnected system."
          />
        </div>
      </SectionShell>

      {/* Built to expand */}
      <SectionShell>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              title="Built to expand"
              subtitle="Start where work is hardest today. Add the next Business Process on the same foundation — records, permissions, communications, Processing, and Operational Intelligence already in place."
            />
            <p className="mt-6">
              <Link href="/vision" className="text-sm font-semibold text-alloy-bend-pine hover:underline">
                See the vision →
              </Link>
            </p>
          </div>
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.platformExpansion.key}
            alt={MARKETING_ASSETS.platformExpansion.alt}
          />
        </div>
      </SectionShell>

      {/* Where Work Happens CTA */}
      <SectionShell variant="muted" className="!pb-20 md:!pb-28">
        <div className="mx-auto max-w-2xl text-center">
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.finalCta.key}
            alt={MARKETING_ASSETS.finalCta.alt}
            className="mx-auto mb-10 max-w-lg"
            aspectClassName="aspect-[16/9]"
          />
          <h2 className="marketing-section-headline">Where Work Happens</h2>
          <p className="marketing-body-lg mt-4">
            See how Alloy moves work forward — from Business Processes to Processing to Operational
            Intelligence.
          </p>
          <div className="mt-8">
            <CTAButton href="/contact">Book a Demo</CTAButton>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
