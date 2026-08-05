import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why Alloy exists — fewer systems, Business Processes that move work forward, and Operational Intelligence where teams need it.",
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
