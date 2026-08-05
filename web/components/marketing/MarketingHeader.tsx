"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { MARKETING_NAV_LINKS } from "@/lib/marketing/marketingNav";
import { MARKETING_BRAND } from "@/lib/marketing/artifactPaths";
import CTAButton from "@/components/marketing/CTAButton";

export default function MarketingHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-alloy-midnight-forge/8 bg-white/95 backdrop-blur-sm">
      <div className="marketing-content-width flex h-16 items-center justify-between md:h-20">
        <Link href="/" className="flex shrink-0 items-center" onClick={() => setMobileOpen(false)}>
          <Image
            src={MARKETING_BRAND.wordmark}
            alt="Alloy"
            width={140}
            height={36}
            className="h-8 w-auto md:h-9"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          {MARKETING_NAV_LINKS.map((link) => {
            const isActive = pathname === link.href || pathname?.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors ${
                  isActive
                    ? "text-alloy-bend-pine"
                    : "text-alloy-midnight-forge/75 hover:text-alloy-midnight-forge"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <CTAButton href="/login" variant="ghost" className="!min-h-10 !px-4 !py-2">
            Sign In
          </CTAButton>
          <CTAButton href="/contact" className="!min-h-10 !px-5 !py-2.5">
            Book a Demo
          </CTAButton>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-alloy-midnight-forge/80 hover:bg-alloy-stone md:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-alloy-midnight-forge/8 bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {MARKETING_NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
                    isActive
                      ? "bg-alloy-stone text-alloy-bend-pine"
                      : "text-alloy-midnight-forge/80"
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="mt-3 flex flex-col gap-2 border-t border-alloy-midnight-forge/8 pt-3">
              <CTAButton href="/login" variant="secondary" className="w-full">
                Sign In
              </CTAButton>
              <CTAButton href="/contact" className="w-full">
                Book a Demo
              </CTAButton>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
