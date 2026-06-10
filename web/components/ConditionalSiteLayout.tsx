"use client";

import { usePathname } from "next/navigation";
import LayoutWrapper from "@/components/LayoutWrapper";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import { isPublicFormEmbedPath } from "@/lib/public/forms/publicFormEmbedPath";

function isAppShellRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/adminV2") ||
    pathname.startsWith("/adminv2") ||
    pathname.startsWith("/legacy-admin") ||
    pathname === "/workspace" ||
    pathname.startsWith("/workspace/")
  );
}

function isAuthRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password"
  );
}

export default function ConditionalSiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isFormEmbedRoute = isPublicFormEmbedPath(pathname);

  if (isAppShellRoute(pathname) || isFormEmbedRoute || isAuthRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <LayoutWrapper>
      <div className="marketing-site-chrome flex min-h-screen min-h-dvh flex-col bg-white">
        <MarketingHeader />
        <main className="flex flex-1 flex-col">{children}</main>
        <MarketingFooter />
      </div>
    </LayoutWrapper>
  );
}
