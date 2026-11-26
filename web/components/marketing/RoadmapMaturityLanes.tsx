"use client";

import { useMarketingInView } from "@/components/marketing/useMarketingInView";
import { getMaturityByLane } from "@/lib/marketing/roadmap";

const LANES = [
  {
    key: "established" as const,
    title: "Established",
    description: "Core platform capability",
    marker: "solid" as const,
  },
  {
    key: "expanding" as const,
    title: "Expanding",
    description: "Real today. Growing in depth.",
    marker: "partial" as const,
  },
  {
    key: "next" as const,
    title: "Next",
    description: "Becoming first-class product areas",
    marker: "outline" as const,
  },
] as const;

function LaneMarker({ kind }: { kind: "solid" | "partial" | "outline" }) {
  if (kind === "solid") {
    return <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-alloy-bend-pine" />;
  }
  if (kind === "partial") {
    return (
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full bg-[conic-gradient(from_180deg,#00A283_0_55%,rgba(69,80,108,0.28)_55%)]"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="h-2 w-2 shrink-0 rounded-full border border-alloy-midnight-forge/30 bg-transparent"
    />
  );
}

/**
 * Compact maturity snapshot — scannable in ~5 seconds.
 */
export default function RoadmapMaturityLanes() {
  const lanes = getMaturityByLane();
  const { ref, ready, armed, reducedMotion } = useMarketingInView<HTMLDivElement>({
    threshold: 0.12,
  });

  return (
    <div
      ref={ref}
      data-ready={ready ? "true" : "false"}
      data-armed={armed ? "true" : "false"}
      data-reduced={reducedMotion ? "true" : "false"}
      className="marketing-roadmap-maturity divide-y divide-alloy-midnight-forge/[0.06]"
    >
      {LANES.map((lane, index) => {
        const items = lanes[lane.key];
        return (
          <section
            key={lane.key}
            className="marketing-roadmap-maturity__lane grid gap-2 py-4 first:pt-0 last:pb-0 md:grid-cols-[9.5rem_1fr] md:items-baseline md:gap-6 md:py-3.5"
            style={{ ["--rm-step" as string]: index }}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <LaneMarker kind={lane.marker} />
                <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-alloy-midnight-forge">
                  {lane.title}
                </h3>
              </div>
              <p className="mt-1 text-[0.8125rem] leading-snug text-alloy-slate md:pl-4">
                {lane.description}
              </p>
            </div>

            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 md:gap-x-5">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="text-sm font-medium tracking-[-0.01em] text-alloy-midnight-forge"
                >
                  {item.title}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
