import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "Explore Alloy — Business Processes, Processing, and Operational Intelligence on one operating system foundation.",
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return children;
}
