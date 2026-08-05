import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vision",
  description:
    "Alloy's direction toward the operating system for work — Business Processes, Processing, and Operational Intelligence.",
};

export default function VisionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
