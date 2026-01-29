"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LayoutWrapper from "@/components/LayoutWrapper";
import QuoteModalWrapper from "@/components/QuoteModalWrapper";

export default function ConditionalSiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin");

  if (isAdminRoute) {
    // Admin routes: no Navbar/Footer, just render children (admin layout handles its own UI)
    return <>{children}</>;
  }

  // Regular site routes: show Navbar/Footer
  return (
    <LayoutWrapper>
      <Navbar />
      <main>{children}</main>
      <Footer />
      <QuoteModalWrapper />
    </LayoutWrapper>
  );
}

