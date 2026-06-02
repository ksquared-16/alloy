import type { Metadata } from "next";
import Link from "next/link";
import { campuses } from "@/lib/locations";

export const metadata: Metadata = {
  title: "Contact Us",
};

export default function ContactPage() {
  return (
    <section className="bg-cream px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-[900px]">
        <h1 className="text-3xl font-semibold tracking-tight text-navy sm:text-4xl">
          Contact Us
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">
          Choose the campus you&apos;re interested in. Each location has its own
          inquiry form so our enrollment team can follow up with the right information.
        </p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-3">
          {campuses.map((campus) => (
            <li key={campus.slug}>
              <Link
                href={`/contact/${campus.slug}`}
                className="flex h-full flex-col rounded-2xl border border-cream-dark bg-white p-5 shadow-sm transition-colors hover:border-firefly hover:bg-cream-dark/30"
              >
                <span className="text-lg font-semibold text-navy">{campus.name}</span>
                <span className="mt-1 text-sm text-muted">{campus.address}</span>
                <span className="mt-4 text-sm font-semibold text-forest">
                  Request more information →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
