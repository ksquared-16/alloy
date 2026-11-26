import CTAButton from "@/components/marketing/CTAButton";
import RoadmapBuildingNow from "@/components/marketing/RoadmapBuildingNow";
import RoadmapEvolutionBands from "@/components/marketing/RoadmapEvolutionBands";
import RoadmapExpansionFootprint from "@/components/marketing/RoadmapExpansionFootprint";
import RoadmapMaturityLanes from "@/components/marketing/RoadmapMaturityLanes";
import SectionShell from "@/components/marketing/SectionShell";
import { getBuildingNowItems, ROADMAP_LAST_UPDATED } from "@/lib/marketing/roadmap";

export default function VisionPage() {
  const building = getBuildingNowItems();

  return (
    <>
      <SectionShell density="compact" className="!pt-10 md:!pt-14" innerClassName="max-w-2xl">
        <p className="marketing-eyebrow">Vision & Roadmap</p>
        <h1 className="marketing-page-headline mt-3">Building the operating system for work</h1>
        <p className="marketing-body-lg mt-4">
          Alloy is being built in layers — one shared foundation, then more of the operation on top
          of it.
        </p>
        <p className="marketing-body mt-4">
          This roadmap shows how Alloy has evolved, where the platform stands today, what we&apos;re
          building now, and where we&apos;re headed next.
        </p>
        <p className="mt-5 text-[0.75rem] tracking-[0.02em] text-alloy-midnight-forge/45">
          {`Last updated ${ROADMAP_LAST_UPDATED.label}`}
        </p>
      </SectionShell>

      <SectionShell variant="muted" density="compact" id="evolution">
        <div className="max-w-2xl">
          <h2 className="marketing-section-headline">How Alloy has evolved</h2>
          <p className="marketing-body mt-3">
            Major milestones that materially changed what Alloy can do.
          </p>
        </div>
        <div className="mt-6 md:mt-7">
          <RoadmapEvolutionBands />
        </div>
      </SectionShell>

      <SectionShell density="compact" id="today" className="!pt-6 md:!pt-8">
        <div className="max-w-2xl">
          <h2 className="marketing-section-headline">Where Alloy stands today</h2>
          <p className="marketing-body mt-2.5">
            The foundation is established. The platform keeps expanding.
          </p>
        </div>
        <div className="mt-5 md:mt-6">
          <RoadmapMaturityLanes />
        </div>
      </SectionShell>

      <SectionShell variant="muted" density="compact" id="building">
        <div className="max-w-2xl">
          <h2 className="marketing-section-headline">Building now</h2>
          <p className="marketing-body mt-3">
            Major work Alloy is actively pushing forward right now — not the full backlog.
          </p>
        </div>
        <div className="mt-5 md:mt-6">
          <RoadmapBuildingNow items={building} />
        </div>
      </SectionShell>

      <SectionShell density="compact" id="expanding">
        <div className="max-w-2xl">
          <h2 className="marketing-section-headline">Expanding across the operation</h2>
          <p className="marketing-body mt-3">
            Where Alloy is headed next — by operational area, not as a promised build order.
          </p>
        </div>
        <div className="mt-6 md:mt-7">
          <RoadmapExpansionFootprint />
        </div>
        <p className="mx-auto mt-7 max-w-2xl text-center text-sm leading-relaxed text-alloy-midnight-forge/45 md:mt-8">
          Sequencing may change as we learn from operators. We share direction early so you can see
          where Alloy is headed — not to lock timelines.
        </p>
      </SectionShell>

      <SectionShell variant="muted" density="compact">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="marketing-statement-headline">One foundation. More of your operation.</h2>
          <p className="marketing-body mt-3.5">
            Every capability Alloy adds shares the same records, identity, permissions, Business
            Processes, communications, Processing, and intelligence.
          </p>
          <p className="mt-4 text-sm font-semibold tracking-[-0.01em] text-alloy-midnight-forge">
            Start with the work that matters most. Expand without starting over.
          </p>
          <div className="mt-7">
            <CTAButton href="/contact">Request a Demo</CTAButton>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
