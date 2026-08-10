import {
  BarChart3,
  Bolt,
  MessageSquare,
  Settings2,
  Shield,
  Users,
} from "lucide-react";
import MarketingSupportBanner from "@/components/marketing/MarketingSupportBanner";

const ITEMS = [
  {
    title: "One Record",
    body: "One source of truth.",
    icon: <Users aria-hidden className="h-4 w-4 text-alloy-midnight-forge" strokeWidth={1.5} />,
  },
  {
    title: "Secure by Design",
    body: "Permissions, security, and audit built in.",
    icon: <Shield aria-hidden className="h-4 w-4 text-alloy-midnight-forge" strokeWidth={1.5} />,
  },
  {
    title: "Connected Work",
    body: "Every action advances the Business Process.",
    icon: <Bolt aria-hidden className="h-4 w-4 text-alloy-bend-pine" strokeWidth={1.5} />,
  },
  {
    title: "Clear Communication",
    body: "Conversation stays with the work.",
    icon: <MessageSquare aria-hidden className="h-4 w-4 text-alloy-midnight-forge" strokeWidth={1.5} />,
  },
  {
    title: "Operational Intelligence",
    body: "Know what needs attention.",
    icon: <BarChart3 aria-hidden className="h-4 w-4 text-alloy-midnight-forge" strokeWidth={1.5} />,
  },
  {
    title: "Open and Configurable",
    body: "Adapt without fracturing the system.",
    icon: <Settings2 aria-hidden className="h-4 w-4 text-alloy-midnight-forge" strokeWidth={1.5} />,
  },
] as const;

export default function HeroCapabilityStrip() {
  return (
    <section
      aria-label="Operating principles"
      className="border-y border-alloy-midnight-forge/[0.07] bg-white"
    >
      <div className="marketing-content-width py-4 md:py-5">
        <MarketingSupportBanner
          ariaLabel="Operating principles"
          columns={6}
          items={ITEMS}
        />
      </div>
    </section>
  );
}
