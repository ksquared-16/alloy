"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import PrimaryButton from "@/components/PrimaryButton";
import ServicePicker from "@/components/ServicePicker";

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [servicesDropdownOpen, setServicesDropdownOpen] = useState(false);
  const servicesDropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const servicesLinks = [
    { href: "/services/cleaning", label: "Home Cleaning" },
    { href: "/gutters", label: "Gutter Cleaning" },
  ];

  const navLinks = [
    { href: "/join", label: "Join Our Team" },
    { href: "/about", label: "About" },
  ];

  // Close Services dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (servicesDropdownRef.current && !servicesDropdownRef.current.contains(event.target as Node)) {
        setServicesDropdownOpen(false);
      }
    };

    if (servicesDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [servicesDropdownOpen]);

  return (
    <nav className="sticky top-0 z-50 bg-alloy-stone shadow-sm border-b border-alloy-stone/60">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Desktop Layout - Logo Left, Links Right */}
        <div className="hidden md:flex items-center justify-between h-20">
          {/* Logo - Left */}
          <Link href="/" className="flex items-center">
            <Image
              src="/brand/alloy-wordmark-blue.svg"
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
            <div
              className="relative"
              ref={servicesDropdownRef}
              onMouseEnter={() => setServicesDropdownOpen(true)}
              onMouseLeave={() => setServicesDropdownOpen(false)}
            >
              <button
                onClick={() => setServicesDropdownOpen(!servicesDropdownOpen)}
                className={`
                  text-alloy-midnight hover:text-alloy-juniper 
                  transition-colors font-medium pb-1 relative flex items-center gap-1
                  ${pathname?.startsWith("/services/") || pathname === "/gutters"
                    ? "border-b-2 border-alloy-juniper"
                    : ""}
                `}
                aria-expanded={servicesDropdownOpen}
                aria-haspopup="true"
              >
                Services
                <svg
                  className={`w-4 h-4 transition-transform ${servicesDropdownOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {servicesDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-alloy-stone/30 py-2 z-50">
                  {servicesLinks.map((link) => {
                    const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setServicesDropdownOpen(false)}
                        className={`
                          block px-4 py-2 text-sm text-alloy-midnight hover:bg-alloy-stone/50 transition-colors
                          ${isActive ? "bg-alloy-juniper/10 text-alloy-juniper font-medium" : ""}
                        `}
                      >
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {navLinks.map((link) => {
              const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`
                    text-alloy-midnight hover:text-alloy-juniper 
                    transition-colors font-medium pb-1 relative
                    ${isActive ? "border-b-2 border-alloy-juniper" : ""}
                  `}
                >
                  {link.label}
                </Link>
              );
            })}

            {/* Get a Quote CTA with Service Picker */}
            <ServicePicker variant="link" />
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="md:hidden flex items-center justify-between h-20 py-4">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <Image
              src="/brand/alloy-wordmark-blue.svg"
              alt="Alloy logo"
              width={280}
              height={72}
              className="h-[4.5rem] w-auto"
              priority
            />
          </Link>

          {/* Mobile Menu Button */}
          <button
            className="p-3 rounded-md text-alloy-midnight hover:bg-white/50 transition-colors"
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
          <div className="md:hidden py-6 border-t border-alloy-midnight/10">
            <div className="flex flex-col space-y-5">
              <div className="pb-2 border-b border-alloy-midnight/10">
                <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/60 mb-2">Services</p>
                {servicesLinks.map((link) => {
                  const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`
                        block text-alloy-midnight hover:text-alloy-juniper 
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
                      text-alloy-midnight hover:text-alloy-juniper 
                      transition-colors font-medium py-2 relative
                      ${isActive ? "border-b-2 border-alloy-juniper inline-block w-fit" : ""}
                    `}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                );
              })}
              <div className="pt-2">
                <Link href="/quote" onClick={() => setMobileMenuOpen(false)}>
                  <PrimaryButton className="w-full">Get a Quote</PrimaryButton>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

