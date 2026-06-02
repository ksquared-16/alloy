import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request a Demo | Alloy",
  description: "Request a demo of Alloy — the platform for operational workflows in childcare.",
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
