export type ServiceStatus = "available" | "coming_soon";

export interface Service {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  href: string;
  icon?: string;
}

export const SERVICES: Service[] = [
  {
    id: "cleaning",
    name: "Home Cleaning",
    description: "Vetted, insured cleaners in Bend. Clear expectations, fair pricing, real results — without the guesswork.",
    status: "available",
    href: "/services/cleaning",
  },
  {
    id: "gutter",
    name: "Gutter Cleaning",
    description: "Coming soon",
    status: "coming_soon",
    href: "#",
  },
  {
    id: "HVAC",
    name: "HVAC Services",
    description: "Coming soon",
    status: "coming_soon",
    href: "#",
  },
];

