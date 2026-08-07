import { ArrowRight, Clock3, ShieldCheck, TrendingUp } from "lucide-react";
import MarketingSupportBanner from "@/components/marketing/MarketingSupportBanner";

/**
 * Stop-stitching benefit row — shared banner typography + restrained Bend Pine signal.
 * Icons ~18px for presence; headings stay Midnight Forge.
 */

const iconClass = "h-[1.125rem] w-[1.125rem]"; // 18px

const ITEMS = [
  {
    title: "From siloed to streamlined",
    body: "All your work, people, and data connected in one place—so your team can focus on what matters.",
    icon: (
      <ArrowRight
        aria-hidden
        className={`${iconClass} text-alloy-bend-pine`}
        strokeWidth={1.75}
      />
    ),
  },
  {
    title: "Save time",
    body: "One system. Less switching. More getting done.",
    icon: (
      <span className={`relative inline-flex ${iconClass} text-alloy-midnight-forge`}>
        <Clock3 aria-hidden className={iconClass} strokeWidth={1.75} />
        <span
          aria-hidden
          className="absolute left-1/2 top-[28%] h-[32%] w-[1.5px] origin-bottom -translate-x-1/2 rotate-[28deg] rounded-full bg-alloy-bend-pine"
        />
      </span>
    ),
  },
  {
    title: "Reduce risk",
    body: "Secure by design. Built for compliance from day one.",
    icon: (
      <span className={`relative inline-flex ${iconClass} text-alloy-midnight-forge`}>
        <ShieldCheck aria-hidden className={iconClass} strokeWidth={1.75} />
      </span>
    ),
  },
  {
    title: "Drive impact",
    body: "Clear insights. Better decisions. Stronger outcomes.",
    icon: (
      <TrendingUp
        aria-hidden
        className={`${iconClass} text-alloy-bend-pine`}
        strokeWidth={1.75}
      />
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
