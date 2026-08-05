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
    <div className={`max-w-xl ${alignClass}`}>
      {eyebrow ? <p className="marketing-eyebrow mb-3">{eyebrow}</p> : null}
      <h2 className="marketing-section-headline">{title}</h2>
      {subtitle ? <p className="marketing-body-lg mt-4">{subtitle}</p> : null}
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      {/* Chapter: Hero */}
      <SectionShell
        density="spacious"
        className="!pt-14 md:!pt-20 lg:!pt-24"
        innerClassName="grid items-center gap-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-16 xl:gap-20"
      >
        <div>
          <p className="marketing-eyebrow">The modern operating system for operations</p>
          <h1 className="marketing-display-headline mt-6">
            <span className="block text-alloy-midnight-forge">Most software stores information.</span>
            <span className="mt-3 block text-alloy-bend-pine">Alloy moves work forward.</span>
          </h1>
          <div className="marketing-body-lg mt-7 max-w-md space-y-3.5">
            <p>Work doesn&apos;t happen inside one application.</p>
            <p>
              It moves between people, decisions, communications, documents, approvals, and Business
              Processes.
            </p>
            <p>
              Alloy brings them into one operating system — so your team focuses on the work, not the
              software.
            </p>
          </div>
          <div className="mt-9 flex flex-wrap gap-3">
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

      {/* Chapter: The problem */}
      <SectionShell variant="muted" density="spacious">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.disconnectedToUnified.key}
            alt={MARKETING_ASSETS.disconnectedToUnified.alt}
            className="order-2 lg:order-1"
          />
          <div className="order-1 lg:order-2">
            <SectionHeading
              title="Stop stitching software together"
              subtitle="CRM, email, forms, tasks, documents, and reports often live apart. People become the integration layer. Alloy replaces that patchwork with one operating system that moves work forward."
            />
          </div>
        </div>
      </SectionShell>

      {/* Chapter: Three pillars — continuous white band */}
      <SectionShell density="default">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <SectionHeading
              eyebrow="Business Processes"
              title="Built around Business Processes"
              subtitle="Business Processes organize how work advances — stages, decisions, requirements, and outcomes — so every action has a place to land and a next step to take."
            />
            <p className="mt-7">
              <Link
                href="/platform"
                className="text-sm font-semibold text-alloy-bend-pine hover:underline"
              >
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

      <SectionShell density="compact">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.processing.key}
            alt={MARKETING_ASSETS.processing.alt}
            className="order-2 lg:order-1"
          />
          <div className="order-1 lg:order-2">
            <SectionHeading
              eyebrow="Processing"
              title="Processing turns information into action"
              subtitle="Intake, documents, and operational inputs should not sit idle. Processing turns them into structured progress inside the Business Process."
            />
          </div>
        </div>
      </SectionShell>

      <SectionShell density="default">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
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

      {/* Chapter: How work stays whole */}
      <SectionShell variant="muted" density="default">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.communications.key}
            alt={MARKETING_ASSETS.communications.alt}
            className="order-2 lg:order-1"
          />
          <div className="order-1 lg:order-2">
            <SectionHeading
              title="Every conversation stays connected"
              subtitle="Messages stay attached to the people and work they belong to — so context does not vanish when the thread closes."
            />
          </div>
        </div>
      </SectionShell>

      <SectionShell density="default">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <SectionHeading
              title="AI that understands your business"
              subtitle="BOS works through your records, Business Processes, permissions, and audit paths — helping teams move work forward without inventing a parallel system."
            />
          </div>
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.bos.key}
            alt={MARKETING_ASSETS.bos.alt}
          />
        </div>
      </SectionShell>

      {/* Chapter: Expansion */}
      <SectionShell density="compact">
        <div className="mx-auto max-w-2xl text-center">
          <SectionHeading
            align="center"
            title="One operating system, endless possibilities"
            subtitle="Most software starts with features. Alloy started with the foundation — so new operational areas expand without creating another disconnected system."
          />
        </div>
      </SectionShell>

      <SectionShell density="default">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <SectionHeading
              title="Built to expand"
              subtitle="Start where work is hardest today. Add the next Business Process on the same foundation — records, permissions, communications, Processing, and Operational Intelligence already in place."
            />
            <p className="mt-7">
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

      {/* Chapter: Close */}
      <SectionShell variant="muted" density="spacious" className="!pb-24 md:!pb-32">
        <div className="mx-auto max-w-xl text-center">
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.finalCta.key}
            alt={MARKETING_ASSETS.finalCta.alt}
            className="mx-auto mb-12 max-w-md"
            aspectClassName="aspect-[16/9]"
          />
          <h2 className="marketing-section-headline">Where Work Happens</h2>
          <p className="marketing-body-lg mt-5">
            See how Alloy moves work forward — from Business Processes to Processing to Operational
            Intelligence.
          </p>
          <div className="mt-9">
            <CTAButton href="/contact">Book a Demo</CTAButton>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
