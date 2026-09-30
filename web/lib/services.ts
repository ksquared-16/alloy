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
    id: "gutter",
    name: "Gutter Cleaning",
    description: "Sign up early and get $25 off your first service when we launch.",
    status: "available",
    href: "/gutters",
  },
  {
    id: "HVAC",
    name: "HVAC Services",
    description: "Coming soon",
    status: "coming_soon",
    href: "#",
  },
];

