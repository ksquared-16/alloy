"use client";

import { useMarketingInView } from "@/components/marketing/useMarketingInView";
import { getPublicDomains } from "@/lib/marketing/roadmap";

/**
 * Future direction as operational footprint settling onto a shared foundation.
 * Time / maturity / expansion language — not Home or Platform diagrams.
 */
export default function RoadmapExpansionFootprint() {
  const domains = getPublicDomains();
  const { ref, ready, armed, reducedMotion } = useMarketingInView<HTMLDivElement>({
    threshold: 0.15,
  });

  return (
    <div
      ref={ref}
      data-ready={ready ? "true" : "false"}
      data-armed={armed ? "true" : "false"}
      data-reduced={reducedMotion ? "true" : "false"}
      className="marketing-roadmap-expansion"
    >
      <div className="space-y-3 md:space-y-3.5">
        {domains.map((domain, index) => (
          <div
            key={domain.id}
            className="marketing-roadmap-expansion__domain grid gap-2 sm:grid-cols-[11rem_1fr] sm:items-center sm:gap-5"
            style={{ ["--rm-step" as string]: index }}
          >
            <div>
              <h3 className="text-sm font-semibold tracking-[-0.01em] text-alloy-midnight-forge">
                {domain.title}
              </h3>
              <p className="mt-1 text-[0.8125rem] leading-snug text-alloy-slate sm:hidden">
                {domain.items.join(" · ")}
              </p>
            </div>
            <div className="min-w-0">
              <div
                aria-hidden
                className="marketing-roadmap-expansion__band h-1 w-full rounded-sm bg-alloy-stone"
              >
                <span className="marketing-roadmap-expansion__band-fill block h-full w-full rounded-sm bg-alloy-midnight-forge/14" />
              </div>
              <p className="mt-1.5 hidden text-[0.8125rem] text-alloy-slate sm:block">
                {domain.items.join(" · ")}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="marketing-roadmap-expansion__foundation relative mt-5 pt-4 md:mt-6">
        <div
          aria-hidden
          className="marketing-roadmap-expansion__foundation-line absolute inset-x-0 top-0 h-px bg-alloy-midnight-forge/20"
        />
        <div className="rounded-sm border border-alloy-midnight-forge/[0.1] bg-white px-4 py-3 text-center">
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-alloy-midnight-forge/55">
            Shared foundation
          </p>
          <p className="mt-1 text-[0.8125rem] text-alloy-slate">
            Records · Identity · Permissions · Processes · Communications · Intelligence
          </p>
        </div>
      </div>
    </div>
  );
}
