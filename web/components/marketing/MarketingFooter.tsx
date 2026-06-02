import Link from "next/link";
import Image from "next/image";
import { MARKETING_NAV_LINKS } from "@/lib/marketing/marketingNav";

export default function MarketingFooter() {
  const legalLinks = [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
  ];

  return (
    <footer className="border-t border-alloy-forge/8 bg-white">
      <div className="mx-auto max-w-screen-xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <div className="flex items-center gap-3">
              <Image
                src="/brand/alloy-brandmark-blue.svg"
                alt=""
                width={32}
                height={32}
                className="h-8 w-8"
                aria-hidden
              />
              <span className="text-sm font-semibold text-alloy-forge">Alloy</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-alloy-forge/65">
              A platform for operational workflows. One source of truth for childcare
              organizations.
            </p>
            <p className="mt-4 text-sm text-alloy-forge/55">
              <a href="mailto:hello@workwithalloy.com" className="hover:text-alloy-juniper">
                hello@workwithalloy.com
              </a>
            </p>
          </div>

          <div className="md:col-span-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-alloy-forge/45">
              Product
            </h2>
            <ul className="mt-4 space-y-2.5">
              {MARKETING_NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-alloy-forge/70 transition-colors hover:text-alloy-juniper"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-alloy-forge/45">
              Get started
            </h2>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  href="/contact"
                  className="text-sm text-alloy-forge/70 transition-colors hover:text-alloy-juniper"
                >
                  Request a Demo
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="text-sm text-alloy-forge/70 transition-colors hover:text-alloy-juniper"
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
                    className="text-sm text-alloy-forge/50 transition-colors hover:text-alloy-forge/70"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-alloy-forge/8 pt-8 text-center text-xs text-alloy-forge/45">
          &copy; {new Date().getFullYear()} Alloy. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
