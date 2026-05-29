import Link from "next/link";

type LocationCardProps = {
  name: string;
  ages: string;
  address: string;
  phone: string;
};

export default function LocationCard({
  name,
  ages,
  address,
  phone,
}: LocationCardProps) {
  return (
    <article className="flex flex-col rounded-2xl border border-cream-dark bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-navy">{name}</h3>
      <p className="mt-1 text-sm font-medium text-forest">{ages}</p>
      <address className="mt-4 flex-1 not-italic">
        <p className="text-sm text-muted">{address}</p>
        <p className="mt-1 text-sm text-muted">
          <a href={`tel:${phone.replace(/\D/g, "")}`} className="hover:text-navy">
            {phone}
          </a>
        </p>
      </address>
      <Link
        href="/contact"
        className="mt-6 inline-flex w-full items-center justify-center rounded-full border border-navy/15 bg-cream px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-cream-dark"
      >
        Learn More / Contact
      </Link>
    </article>
  );
}
