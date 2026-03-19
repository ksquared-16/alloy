"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import PrimaryButton from "@/components/PrimaryButton";
import GetQuoteButton from "@/components/GetQuoteButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const servicesLinks = [
    { href: "/services/cleaning", label: "Home Cleaning" },
    { href: "/gutters", label: "Gutter Cleaning" },
  ];

  const navLinks = [
    { href: "/join", label: "Join Our Team" },
    { href: "/about", label: "About" },
  ];

  return (
    <nav className="sticky top-0 z-50 home-header-translucent">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Desktop Layout - Logo Left, Links Right */}
        <div className="hidden md:flex items-center justify-between h-20">
          {/* Logo - Left (white wordmark on dark) */}
          <Link href="/" className="flex items-center">
            <Image
              src="/brand/alloy-wordmark-white.svg"
              alt="Alloy logo"
              width={360}
              height={96}
              className="h-24 w-auto"
              priority
            />
          </Link>

          {/* Navigation Links - Right Aligned */}
          <div className="flex items-center space-x-8">
            {/* Services Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger
                className={`
                  text-white/90 hover:text-white
                  transition-colors font-medium pb-1 relative flex items-center gap-1
                  outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#18273A]
                  ${pathname?.startsWith("/services/") || pathname === "/gutters"
                    ? "border-b-2 border-alloy-juniper text-white"
                    : ""}
                `}
              >
                Services
                <svg
                  className="w-4 h-4 transition-transform data-[state=open]:rotate-180"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {servicesLinks.map((link) => {
                  const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
                  return (
                    <DropdownMenuItem
                      key={link.href}
                      onClick={() => router.push(link.href)}
                      className={`
                        cursor-pointer
                        ${isActive ? "bg-alloy-juniper/10 text-alloy-juniper font-medium" : ""}
                      `}
                    >
                      {link.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {navLinks.map((link) => {
              const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`
                    text-white/90 hover:text-white
                    transition-colors font-medium pb-1 relative
                    ${isActive ? "border-b-2 border-alloy-juniper text-white" : ""}
                  `}
                >
                  {link.label}
                </Link>
              );
            })}

            {/* Get a Quote CTA - Bend Pine #00A283 */}
            <GetQuoteButton className="quote-cta-bend-pine !px-5 !py-2.5 !text-sm !text-white !shadow-md hover:!shadow-lg transition-all" />
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="md:hidden flex items-center justify-between h-20 py-4">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <Image
              src="/brand/alloy-wordmark-white.svg"
              alt="Alloy logo"
              width={280}
              height={72}
              className="h-[4.5rem] w-auto"
              priority
            />
          </Link>

          {/* Mobile Menu Button */}
          <button
            className="p-3 rounded-lg text-white/90 hover:text-white hover:bg-white/10 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {mobileMenuOpen ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-6 border-t border-white/10">
            <div className="flex flex-col space-y-5">
              <div className="pb-2 border-b border-white/10">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50 mb-2">Services</p>
                {servicesLinks.map((link) => {
                  const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`
                        block text-white/90 hover:text-white
                        transition-colors font-medium py-2 pl-4 relative
                        ${isActive ? "text-alloy-juniper font-semibold" : ""}
                      `}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
              {navLinks.map((link) => {
                const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`
                      text-white/90 hover:text-white
                      transition-colors font-medium py-2 relative
                      ${isActive ? "border-b-2 border-alloy-juniper inline-block w-fit text-white" : ""}
                    `}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                );
              })}
              <div className="pt-2">
                <div onClick={() => setMobileMenuOpen(false)} className="w-full">
                  <GetQuoteButton className="w-full quote-cta-bend-pine !text-white" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

