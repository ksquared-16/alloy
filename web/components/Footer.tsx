import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  const footerLinks = {
    services: [
      { href: "/services", label: "Services" },
      { href: "/services/cleaning", label: "Home Cleaning" },
    ],
    company: [
      { href: "/about", label: "About" },
      { href: "/join", label: "Join Our Team" },
    ],
    legal: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/sms-consent", label: "SMS Consent" },
    ],
  };

  return (
    <footer className="relative z-20 mt-20 bg-alloy-midnight text-alloy-stone">
      {/* Subtle gradient border at top */}
      <div className="h-1 bg-gradient-to-r from-alloy-pine via-alloy-juniper to-alloy-pine"></div>
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <Image
                src="/brand/alloy-brandmark-white.svg"
                alt="Alloy brandmark"
                width={40}
                height={40}
                className="h-10 w-10"
              />
              <p className="text-sm text-white/90">
                Alloy LLC – Bend, Oregon
              </p>
            </div>
            <p className="text-alloy-stone mb-4">
              Connecting homeowners with trusted local service professionals.
            </p>
            <p className="text-alloy-stone text-sm">
              Contact:{" "}
              <a
                href="mailto:support@workwithalloy.com"
                className="text-alloy-juniper hover:underline"
              >
                support@workwithalloy.com
              </a>
              <span className="text-alloy-stone/50 mx-2" aria-hidden>
                ·
              </span>
              <a
                href="tel:+15412408863"
                className="text-alloy-juniper hover:underline"
              >
                541-240-8863
              </a>
            </p>
          </div>

          {/* Services */}
          <div>
            <h4 className="font-semibold mb-4 text-white/90">Services</h4>
            <ul className="space-y-2">
              {footerLinks.services.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-alloy-stone hover:text-alloy-juniper transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company & Legal */}
          <div>
            <h4 className="font-semibold mb-4 text-white/90">Company</h4>
            <ul className="space-y-2 mb-6">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-alloy-stone hover:text-alloy-juniper transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <h4 className="font-semibold mb-4 text-white/90">Legal</h4>
            <ul className="space-y-2">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-alloy-stone hover:text-alloy-juniper transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-8 pt-8 text-center text-sm text-alloy-stone/80">
          <p>&copy; {new Date().getFullYear()} Alloy LLC. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

