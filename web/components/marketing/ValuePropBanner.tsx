import { ArrowRight, Check, Clock3, Shield, TrendingUp } from "lucide-react";
import MarketingSupportBanner from "@/components/marketing/MarketingSupportBanner";

/**
 * Stop-stitching benefits — same visual language as hero principles
 * (typography/dividers via MarketingSupportBanner) with restrained Bend Pine signal.
 */

const iconWrap =
  "relative inline-flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center text-alloy-midnight-forge";

const ITEMS = [
  {
    title: "From siloed to streamlined",
    body: "All your work, people, and data connected in one place—so your team can focus on what matters.",
    icon: (
      <span className={iconWrap}>
        <ArrowRight aria-hidden className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.5} />
        {/* Pine progress tip on the arrow head */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-[1px] top-1/2 h-0 w-0 -translate-y-1/2 border-y-[3.5px] border-y-transparent border-l-[5px] border-l-alloy-bend-pine"
        />
      </span>
    ),
  },
  {
    title: "Save time",
    body: "One system. Less switching. More getting done.",
    icon: (
      <span className={iconWrap}>
        <Clock3 aria-hidden className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.5} />
        {/* Pine minute hand */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-[calc(50%-0.75px)] top-[4px] h-[6px] w-[1.5px] origin-bottom rounded-full bg-alloy-bend-pine"
          style={{ transform: "rotate(28deg)" }}
        />
      </span>
    ),
  },
  {
    title: "Reduce risk",
    body: "Secure by design. Built for compliance from day one.",
    icon: (
      <span className={iconWrap}>
        <Shield aria-hidden className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.5} />
        <Check
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[45%] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 text-alloy-bend-pine"
          strokeWidth={2.75}
        />
      </span>
    ),
  },
  {
    title: "Drive impact",
    body: "Clear insights. Better decisions. Stronger outcomes.",
    icon: (
      <span className={iconWrap}>
        <TrendingUp aria-hidden className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.5} />
        {/* Pine rising tip */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-[0.5px] top-[1.5px] h-[4px] w-[4px] rounded-[1px] bg-alloy-bend-pine"
        />
      </span>
    ),
  },
] as const;

export default function ValuePropBanner() {
  return (
    <MarketingSupportBanner
      ariaLabel="Platform outcomes"
      columns={4}
      items={ITEMS}
    />
  );
}
