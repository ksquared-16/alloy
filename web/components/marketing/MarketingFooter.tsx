import Link from "next/link";
import Image from "next/image";
import { MARKETING_NAV_LINKS } from "@/lib/marketing/marketingNav";
import { MARKETING_BRAND } from "@/lib/marketing/artifactPaths";

export default function MarketingFooter() {
  const legalLinks = [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
  ];

  return (
    <footer className="border-t border-alloy-midnight-forge/[0.06] bg-white">
      <div className="marketing-content-width py-14 lg:py-16">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-12 md:gap-10">
          <div className="md:col-span-5">
            <div className="flex items-center gap-3.5">
              <Image
                src={MARKETING_BRAND.brandmark}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9"
                aria-hidden
              />
              <span className="text-sm font-semibold tracking-[-0.01em] text-alloy-midnight-forge">
                Alloy
              </span>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-alloy-midnight-forge/55">
              Alloy moves work forward. The modern operating system for organizations that serve
              people.
            </p>
            <p className="mt-5 text-sm text-alloy-midnight-forge/45">
              <a href="mailto:hello@workwithalloy.com" className="hover:text-alloy-bend-pine">
                hello@workwithalloy.com
              </a>
            </p>
          </div>

          <div className="md:col-span-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-alloy-midnight-forge/45">
              Product
            </h2>
            <ul className="mt-4 space-y-2.5">
              {MARKETING_NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-alloy-midnight-forge/70 transition-colors hover:text-alloy-bend-pine"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-alloy-midnight-forge/45">
              Get started
            </h2>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  href="/contact"
                  className="text-sm text-alloy-midnight-forge/70 transition-colors hover:text-alloy-bend-pine"
                >
                  Request a Demo
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="text-sm text-alloy-midnight-forge/70 transition-colors hover:text-alloy-bend-pine"
                >
                  Sign In
                </Link>
              </li>
            </ul>
            <ul className="mt-8 space-y-2.5">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-alloy-midnight-forge/50 transition-colors hover:text-alloy-midnight-forge/70"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-alloy-midnight-forge/8 pt-8 text-center text-xs text-alloy-midnight-forge/45">
          &copy; {new Date().getFullYear()} Alloy. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
