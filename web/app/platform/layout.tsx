import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Platform | Alloy",
  description: "Explore Alloy's unified platform foundation — entities, workflows, lifecycle, forms, permissions, and BOS intelligence.",
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return children;
}
