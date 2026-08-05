import CTAButton from "@/components/marketing/CTAButton";
import HeroCapabilityStrip from "@/components/marketing/HeroCapabilityStrip";
import MarketingAssetImage from "@/components/marketing/MarketingAssetImage";
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
  className = "",
}: {
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  eyebrow?: string;
  className?: string;
}) {
  const alignClass = align === "center" ? "text-center mx-auto" : "";
  return (
    <div className={`marketing-copy-measure ${alignClass} ${className}`.trim()}>
      {eyebrow ? <p className="marketing-eyebrow mb-2.5">{eyebrow}</p> : null}
      <h2 className="marketing-section-headline">{title}</h2>
      {subtitle ? <p className="marketing-body-lg mt-3.5">{subtitle}</p> : null}
    </div>
  );
}

function PillarRow({
  eyebrow,
  title,
  body,
  assetKey,
  alt,
  reverse = false,
  linkHref,
  linkLabel,
}: {
  eyebrow: string;
  title: string;
  body: string;
  assetKey: string;
  alt: string;
  reverse?: boolean;
  linkHref?: string;
  linkLabel?: string;
}) {
  return (
    <div className="marketing-pillar-row grid items-center gap-8 border-t border-alloy-midnight-forge/[0.06] first:border-t-0 first:pt-0 lg:grid-cols-2 lg:gap-12">
      <div className={reverse ? "lg:order-2" : undefined}>
        <SectionHeading eyebrow={eyebrow} title={title} subtitle={body} />
        {linkHref && linkLabel ? (
          <p className="mt-5">
            <Link href={linkHref} className="text-sm font-semibold text-alloy-bend-pine hover:underline">
              {linkLabel}
            </Link>
          </p>
        ) : null}
      </div>
      <MarketingAssetPlaceholder
        assetKey={assetKey}
        alt={alt}
        aspectClassName="aspect-[5/3]"
        className={reverse ? "lg:order-1" : undefined}
      />
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      {/* A. Hero */}
      <SectionShell
        density="compact"
        className="!pt-8 md:!pt-10 lg:!pt-11 !pb-8 md:!pb-10"
        innerClassName="grid items-center gap-6 lg:grid-cols-2 lg:gap-10 xl:gap-12"
      >
        <div>
          <p className="marketing-eyebrow">The modern operating system for operations</p>
          <h1 className="marketing-display-headline mt-3">
            Most software stores information.{" "}
            <span className="text-alloy-bend-pine">Alloy moves work forward.</span>
          </h1>
          <div className="marketing-body-lg marketing-copy-measure mt-4 space-y-2.5">
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
          <div className="mt-5 flex flex-wrap gap-3">
            <CTAButton href="/contact">Book a Demo</CTAButton>
            <CTAButton href="/platform" variant="secondary">
              Explore the Platform
            </CTAButton>
          </div>
        </div>
        <MarketingAssetImage
          src={MARKETING_ASSETS.hero.src}
          alt={MARKETING_ASSETS.hero.alt}
          aspectClassName="aspect-[5/3]"
          priority
        />
      </SectionShell>

      {/* B. Capability strip */}
      <HeroCapabilityStrip />

      {/* C. Problem */}
      <SectionShell variant="muted" density="compact">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.disconnectedToUnified.key}
            alt={MARKETING_ASSETS.disconnectedToUnified.alt}
            aspectClassName="aspect-[5/3]"
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

      {/* D. Three primary pillars — one chapter */}
      <SectionShell density="compact">
        <div className="mb-2 max-w-2xl md:mb-4">
          <p className="marketing-eyebrow">How Alloy moves work forward</p>
          <h2 className="marketing-section-headline mt-2.5">
            Business Processes, Processing, and Operational Intelligence
          </h2>
        </div>
        <PillarRow
          eyebrow="Business Processes"
          title="Built around Business Processes"
          body="Business Processes organize how work advances — stages, decisions, requirements, and outcomes — so every action has a place to land and a next step to take."
          assetKey={MARKETING_ASSETS.businessProcesses.key}
          alt={MARKETING_ASSETS.businessProcesses.alt}
          linkHref="/platform"
          linkLabel="Explore Business Processes →"
        />
        <PillarRow
          eyebrow="Processing"
          title="Processing turns information into action"
          body="Intake, documents, and operational inputs should not sit idle. Processing turns them into structured progress inside the Business Process."
          assetKey={MARKETING_ASSETS.processing.key}
          alt={MARKETING_ASSETS.processing.alt}
          reverse
        />
        <PillarRow
          eyebrow="Operational Intelligence"
          title="Operational Intelligence tells you what needs attention"
          body="Know what matters, what is waiting, and what requires a decision — without hunting across inboxes and spreadsheets."
          assetKey={MARKETING_ASSETS.operationalIntelligence.key}
          alt={MARKETING_ASSETS.operationalIntelligence.alt}
        />
      </SectionShell>

      {/* E. Supporting capabilities — Communications + AI */}
      <SectionShell variant="muted" density="compact">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
          <div>
            <SectionHeading
              title="Every conversation stays connected"
              subtitle="Messages stay attached to the people and work they belong to — so context does not vanish when the thread closes."
            />
            <MarketingAssetPlaceholder
              assetKey={MARKETING_ASSETS.communications.key}
              alt={MARKETING_ASSETS.communications.alt}
              aspectClassName="aspect-[5/3]"
              className="mt-6"
            />
          </div>
          <div>
            <SectionHeading
              title="AI that understands your business"
              subtitle="BOS works through your records, Business Processes, permissions, and audit paths — helping teams move work forward without inventing a parallel system."
            />
            <MarketingAssetPlaceholder
              assetKey={MARKETING_ASSETS.bos.key}
              alt={MARKETING_ASSETS.bos.alt}
              aspectClassName="aspect-[5/3]"
              className="mt-6"
            />
          </div>
        </div>
      </SectionShell>

      {/* F. Operating-system statement */}
      <SectionShell density="compact" className="!py-10 md:!py-12">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="marketing-statement-headline">One operating system, endless possibilities</h2>
          <p className="marketing-body-lg mx-auto mt-3 max-w-xl">
            Most software starts with features. Alloy started with the foundation — so new operational
            areas expand without creating another disconnected system.
          </p>
        </div>
      </SectionShell>

      {/* G. Expansion */}
      <SectionShell density="compact">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <SectionHeading
              title="Built to expand"
              subtitle="Start where work is hardest today. Add the next Business Process on the same foundation — records, permissions, communications, Processing, and Operational Intelligence already in place."
            />
            <p className="mt-5">
              <Link href="/vision" className="text-sm font-semibold text-alloy-bend-pine hover:underline">
                See the vision →
              </Link>
            </p>
          </div>
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.platformExpansion.key}
            alt={MARKETING_ASSETS.platformExpansion.alt}
            aspectClassName="aspect-[5/3]"
          />
        </div>
      </SectionShell>

      {/* H. Final CTA */}
      <SectionShell variant="muted" density="compact" className="!pb-14 md:!pb-16">
        <div className="mx-auto max-w-lg text-center">
          <MarketingAssetPlaceholder
            assetKey={MARKETING_ASSETS.finalCta.key}
            alt={MARKETING_ASSETS.finalCta.alt}
            className="mx-auto mb-6 max-w-sm"
            aspectClassName="aspect-[2/1]"
          />
          <h2 className="marketing-statement-headline">Where Work Happens</h2>
          <p className="marketing-body-lg mt-3">
            See how Alloy moves work forward — from Business Processes to Processing to Operational
            Intelligence.
          </p>
          <div className="mt-6">
            <CTAButton href="/contact">Book a Demo</CTAButton>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
