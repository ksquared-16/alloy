"use client";

import { useMarketingInView } from "@/components/marketing/useMarketingInView";
import type { BuildingNowItem } from "@/lib/marketing/roadmap";

type Props = {
  items: BuildingNowItem[];
};

export default function RoadmapBuildingNow({ items }: Props) {
  const { ref, ready, armed, reducedMotion } = useMarketingInView<HTMLDivElement>({
    threshold: 0.15,
  });

  return (
    <div
      ref={ref}
      data-ready={ready ? "true" : "false"}
      data-armed={armed ? "true" : "false"}
      data-reduced={reducedMotion ? "true" : "false"}
      className="marketing-roadmap-building grid gap-3 md:gap-4"
    >
      {items.map((item, index) => (
        <article
          key={item.id}
          className="marketing-roadmap-building__item rounded-xl border border-alloy-midnight-forge/[0.08] bg-white px-4 py-3.5 md:px-5 md:py-4"
          style={{ ["--rm-step" as string]: index }}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-alloy-midnight-forge">
              {item.title}
            </h3>
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-alloy-bend-pine">
              {item.publicStatus}
            </span>
            {item.targetLabel ? (
              <span className="text-[0.75rem] text-alloy-slate">{item.targetLabel}</span>
            ) : null}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-alloy-slate">
            {item.description}
          </p>
        </article>
      ))}
    </div>
  );
}
