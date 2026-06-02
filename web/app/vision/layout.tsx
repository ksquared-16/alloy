import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vision & Roadmap | Alloy",
  description: "Alloy's direction from enrollment operations toward the operating system for childcare.",
};

export default function VisionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
