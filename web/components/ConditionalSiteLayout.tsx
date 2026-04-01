"use client";

import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LayoutWrapper from "@/components/LayoutWrapper";
import QuoteModalWrapper from "@/components/QuoteModalWrapper";
import HomeAmbient from "@/components/HomeAmbient";

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

  /* Ambient sits in a document-height absolute layer behind chrome (nav/main/footer) so it
   * cannot paint past the intended frame or sit above opaque header/footer regions. */
  return (
    <LayoutWrapper>
      <div className="public-site-chrome">
        <div className="public-site-atmosphere-layer" aria-hidden>
          <HomeAmbient />
        </div>
        <Navbar />
        <main className="public-site-main">{children}</main>
        <Footer />
        <QuoteModalWrapper />
      </div>
    </LayoutWrapper>
  );
}

