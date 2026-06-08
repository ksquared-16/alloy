import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import FormEmbed from "@/components/FormEmbed";
import { campuses, getCampusBySlug } from "@/lib/locations";

type ContactCampusPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return campuses.map((campus) => ({ slug: campus.slug }));
}

export async function generateMetadata({
  params,
}: ContactCampusPageProps): Promise<Metadata> {
  const { slug } = await params;
  const campus = getCampusBySlug(slug);
  if (!campus) return { title: "Contact Us" };

  return {
    title: `Contact Us — ${campus.name}`,
  };
}

export default async function ContactCampusPage({ params }: ContactCampusPageProps) {
  const { slug } = await params;
  const campus = getCampusBySlug(slug);
  if (!campus) notFound();

  return (
    <section className="bg-cream px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-[900px]">
        <p className="text-sm font-medium text-forest">
          <Link href="/contact" className="hover:text-navy">
            ← All locations
          </Link>
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy sm:text-4xl">
          Contact Us — {campus.name}
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">
          Request more information about Firefly Early Learning at {campus.name}.
          Complete the form below and a member of our enrollment team will reach out.
        </p>

        <div className="mt-6 sm:mt-7">
          <FormEmbed src={campus.embedUrl} title={campus.embedTitle} />
        </div>
      </div>
    </section>
  );
}
