import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Alloy",
  description: "Sign in to your Alloy workspace.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
