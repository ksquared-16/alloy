import CTAButton from "@/components/marketing/CTAButton";
import BusinessProcessFlow from "@/components/marketing/BusinessProcessFlow";
import FragmentedWorkMap from "@/components/marketing/FragmentedWorkMap";
import HeroCapabilityStrip from "@/components/marketing/HeroCapabilityStrip";
import HeroOrbitIllustration from "@/components/marketing/HeroOrbitIllustration";
import MarketingAssetPlaceholder from "@/components/marketing/MarketingAssetPlaceholder";
import MarketingReveal from "@/components/marketing/MarketingReveal";
import ProcessBenefitsStrip from "@/components/marketing/ProcessBenefitsStrip";
import SectionShell from "@/components/marketing/SectionShell";
import { MARKETING_ASSETS } from "@/lib/marketing/artifactPaths";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

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
  subtitle?: ReactNode;
  align?: "left" | "center";
  eyebrow?: string;
  className?: string;
}) {
  const alignClass = align === "center" ? "text-center mx-auto" : "";
  return (
    <div className={`marketing-copy-measure ${alignClass} ${className}`.trim()}>
      {eyebrow ? <p className="marketing-eyebrow mb-2.5">{eyebrow}</p> : null}
      <h2 className="marketing-section-headline">{title}</h2>
      {subtitle ? (
        typeof subtitle === "string" ? (
          <p className="marketing-body-lg mt-3.5">{subtitle}</p>
        ) : (
          <div className="marketing-body-lg mt-3.5 space-y-2.5">{subtitle}</div>
        )
      ) : null}
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
        className="!pt-6 md:!pt-8 lg:!pt-9 !pb-4 md:!pb-5 overflow-visible"
        innerClassName="grid items-center gap-5 overflow-visible lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.3fr)] lg:gap-6 xl:gap-8"
      >
        {/* z-10 keeps copy above scaled hub art; pr keeps last glyphs clear of orbit bleed */}
        <div className="relative z-10 min-w-0 lg:pr-3">
          <p className="marketing-eyebrow">The modern operating system for operations</p>
          <h1 className="marketing-display-headline mt-3">
            Most software stores information.{" "}
            <span className="text-alloy-bend-pine">Alloy moves work forward.</span>
          </h1>
          <div className="marketing-body-lg mt-4 w-full max-w-[50.375rem] space-y-2.5">
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
          <div className="mt-5 grid w-fit grid-cols-2 gap-3">
            <CTAButton href="/contact" className="w-full">
              Book a Demo
            </CTAButton>
            <CTAButton href="/platform" variant="secondary" className="w-full">
              Explore
            </CTAButton>
          </div>
        </div>
        {/* Flow fills the column — modest scale, no hub bleed */}
        <div className="relative min-w-0">
          <HeroOrbitIllustration className="w-full lg:scale-[1.04] lg:origin-center" />
        </div>
      </SectionShell>

      {/* B. Capability strip */}
      <HeroCapabilityStrip />

      {/* C. Stop stitching — fragmented work story → resolution handoff */}
      <SectionShell
        variant="muted"
        density="compact"
        className="border-t border-alloy-midnight-forge/[0.06] !pt-4 !pb-2.5 md:!pt-4.5 md:!pb-3"
      >
        <div className="mx-auto flex w-full max-w-full flex-col items-center">
          <h2 className="marketing-section-headline text-center text-alloy-midnight-forge">
            Stop stitching software together
          </h2>

          <div className="marketing-body-lg mx-auto mt-2 w-full max-w-[42rem] space-y-1.5 text-center md:mt-2.5">
            <p className="text-alloy-midnight-forge/60">
              CRM, email, forms, tasks, documents, reports, approvals, and spreadsheets often live
              apart.
            </p>
            <p className="font-semibold text-alloy-midnight-forge">
              People become the integration layer.
            </p>
            <p className="font-semibold text-alloy-bend-pine">
              Alloy connects the work, so your team can focus on moving it forward.
            </p>
          </div>

          <div className="mt-2.5 w-full max-w-3xl md:mt-3">
            <FragmentedWorkMap />
          </div>
        </div>
      </SectionShell>

      {/* D. How Alloy moves work forward — continuity from resolution stem */}
      <SectionShell density="compact" className="relative !pt-4 md:!pt-5">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-gradient-to-b from-alloy-bend-pine/35 to-transparent md:h-5"
        />
        <p className="marketing-eyebrow mb-3 md:mb-4">How Alloy moves work forward</p>
        <div className="marketing-pillar-row border-t border-alloy-midnight-forge/[0.06] first:border-t-0 first:pt-0">
          <div className="mx-auto max-w-3xl text-center">
            <p className="marketing-eyebrow">Business Processes</p>
            <h3 className="marketing-section-headline mt-2.5">
              Organize work from start to finish
            </h3>
            <p className="marketing-body-lg mt-3.5">
              Stages guide the work. Decisions move it forward. Outcomes create the next step.
            </p>
            <p className="mt-5">
              <Link href="/platform" className="text-sm font-semibold text-alloy-bend-pine hover:underline">
                Explore Business Processes →
              </Link>
            </p>
          </div>
          <div className="mx-auto mt-5 w-full max-w-5xl">
            <BusinessProcessFlow />
            <div
              aria-hidden
              className="mx-auto mt-8 mb-6 h-px w-full max-w-4xl bg-alloy-stone"
            />
            <MarketingReveal delayMs={420} className="marketing-bp-benefits rounded-xl bg-alloy-stone/70 px-3 py-5 md:px-4 md:py-6">
              <ProcessBenefitsStrip />
            </MarketingReveal>
          </div>
        </div>
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
      <SectionShell density="compact" className="!py-6 md:!py-8">
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
      <SectionShell variant="muted" density="compact" className="!pb-10 md:!pb-12">
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
