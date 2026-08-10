import { BarChart3, ShieldCheck, Target, Users } from "lucide-react";
import MarketingSupportBanner from "@/components/marketing/MarketingSupportBanner";

/**
 * Business Process benefits — same shared banner family as hero principles / stitching.
 */

const ITEMS = [
  {
    title: "Clear ownership",
    body: "Everyone knows who owns the work and what comes next.",
    icon: <Users aria-hidden className="h-4 w-4 text-alloy-midnight-forge" strokeWidth={1.5} />,
  },
  {
    title: "Built-in consistency",
    body: "Requirements and expected work keep every stage on track.",
    icon: <ShieldCheck aria-hidden className="h-4 w-4 text-alloy-midnight-forge" strokeWidth={1.5} />,
  },
  {
    title: "Real-time visibility",
    body: "See progress, bottlenecks, and what needs attention.",
    icon: <BarChart3 aria-hidden className="h-4 w-4 text-alloy-midnight-forge" strokeWidth={1.5} />,
  },
  {
    title: "Better outcomes",
    body: "Work moves forward with fewer delays and clearer decisions.",
    icon: <Target aria-hidden className="h-4 w-4 text-alloy-bend-pine" strokeWidth={1.5} />,
  },
] as const;

export default function ProcessBenefitsStrip() {
  return (
    <MarketingSupportBanner
      ariaLabel="Business Process outcomes"
      columns={4}
      items={ITEMS}
    />
  );
}
