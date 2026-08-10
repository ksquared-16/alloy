"use client";

import type { CSSProperties, ReactNode } from "react";
import { useMarketingInView } from "@/components/marketing/useMarketingInView";

/** One-shot viewport reveal for marketing surfaces. */
export default function MarketingReveal({
  children,
  className = "",
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const { ref, ready, armed, reducedMotion } = useMarketingInView<HTMLDivElement>({
    threshold: 0.18,
  });

  return (
    <div
      ref={ref}
      data-ready={ready ? "true" : "false"}
      data-armed={armed ? "true" : "false"}
      data-reduced={reducedMotion ? "true" : "false"}
      className={`marketing-reveal ${className}`.trim()}
      style={{ ["--marketing-reveal-delay" as string]: `${delayMs}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
