export type Campus = {
  slug: string;
  name: string;
  ages: string;
  address: string;
  phone: string;
  embedUrl: string;
  embedTitle: string;
};

export const campuses: Campus[] = [
  {
    slug: "west-campus",
    name: "West Campus",
    ages: "Ages 6 weeks–5 years",
    address: "123 Learning Lane",
    phone: "(555) 010-1000",
    embedUrl:
      "https://staging.workwithalloy.com/forms/embed/wj-2bcAUuJ_4fG4pLcvRdTnk2_sYEjmxo-LcI-2UogM",
    embedTitle: "New Lead Generation Form — West Campus",
  },
  {
    slug: "north-campus",
    name: "North Campus",
    ages: "Ages 6 weeks–5 years",
    address: "456 Discovery Drive",
    phone: "(555) 010-2000",
    embedUrl:
      "https://staging.workwithalloy.com/forms/embed/emVv8hMkZFFz_9Xz8pITA78579md-WQ2VQZXcrgYypQ",
    embedTitle: "New Lead Generation Form — North Campus",
  },
  {
    slug: "south-campus",
    name: "South Campus",
    ages: "Ages 6 weeks–5 years",
    address: "789 Meadow Road",
    phone: "(555) 010-3000",
    embedUrl:
      "https://staging.workwithalloy.com/forms/embed/rH4qQvSIcGWLfuzZonUAaPpfUCRpLLLuN_io0hmhfiY",
    embedTitle: "New Lead Generation Form — South Campus",
  },
];

/** Single origin every campus embed is served from — preconnected in the root layout. */
export const EMBED_ORIGIN = "https://staging.workwithalloy.com";

export function getCampusBySlug(slug: string): Campus | undefined {
  return campuses.find((campus) => campus.slug === slug);
}
