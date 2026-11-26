import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vision & Roadmap",
  description:
    "What Alloy has shipped, what we're building now, and where the operating system for work is headed next.",
};

export default function VisionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
