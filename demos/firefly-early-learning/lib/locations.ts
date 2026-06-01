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
      "https://staging.workwithalloy.com/forms/embed/Q6o4x1TadVU-rUFiJvk8ODKWZog89m5hZLGpiUh0l-k",
    embedTitle: "New Enrollment Lead — West Campus",
  },
  {
    slug: "north-campus",
    name: "North Campus",
    ages: "Ages 6 weeks–5 years",
    address: "456 Discovery Drive",
    phone: "(555) 010-2000",
    embedUrl:
      "https://staging.workwithalloy.com/forms/embed/V4FSiX0FbNVEriy6NEyzs7UkJ-hRJRDM7vm2lr0f51w",
    embedTitle: "New Enrollment Lead — North Campus",
  },
  {
    slug: "south-campus",
    name: "South Campus",
    ages: "Ages 6 weeks–5 years",
    address: "789 Meadow Road",
    phone: "(555) 010-3000",
    embedUrl:
      "https://staging.workwithalloy.com/forms/embed/XzvDxYD1CONv9w8MbKDkQDiXjojjndoUe_DVggVhVwY",
    embedTitle: "New Enrollment Lead — South Campus",
  },
];

export function getCampusBySlug(slug: string): Campus | undefined {
  return campuses.find((campus) => campus.slug === slug);
}
