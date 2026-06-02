import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | Alloy",
  description: "Why Alloy exists — fewer systems, connected operational workflows for childcare.",
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
