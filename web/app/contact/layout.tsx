import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request a Demo",
  description:
    "Request a demo of Alloy — see how Business Processes, Processing, and Operational Intelligence move work forward.",
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
