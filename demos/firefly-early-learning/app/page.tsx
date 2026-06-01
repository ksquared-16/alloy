import Link from "next/link";
import FeatureCard from "@/components/FeatureCard";
import ProgramCard from "@/components/ProgramCard";
import LocationCard from "@/components/LocationCard";
import { campuses } from "@/lib/locations";

const features = [
  {
    title: "Caring Teachers",
    description:
      "Our educators bring warmth, patience, and expertise to every classroom. Your child is known, valued, and supported each day.",
  },
  {
    title: "Safe Environment",
    description:
      "Secure campuses, thoughtful routines, and attentive supervision give families peace of mind while children feel free to explore.",
  },
  {
    title: "Play-Based Learning",
    description:
      "Hands-on discovery and guided play build confidence, creativity, and early skills that prepare children for what comes next.",
  },
];

const programs = [
  {
    title: "Infants",
    description:
      "Gentle care and sensory-rich experiences for babies 6 weeks and up, with individualized feeding and nap routines.",
  },
  {
    title: "Toddlers",
    description:
      "Active exploration, language development, and social beginnings in a safe, engaging classroom designed for busy little learners.",
  },
  {
    title: "Preschool",
    description:
      "Structured play, early literacy, and cooperative activities that nurture curiosity and independence.",
  },
  {
    title: "Pre-K",
    description:
      "Kindergarten readiness through problem-solving, early math and reading foundations, and confident social skills.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-cream px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-sm font-medium tracking-wide text-forest uppercase">
            Firefly Early Learning
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-navy sm:text-5xl lg:text-6xl">
            Where curiosity grows.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
            Safe, nurturing early childhood programs designed to help children
            explore, learn, and thrive.
          </p>
          <div className="mt-10">
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-full bg-firefly px-8 py-3.5 text-base font-semibold text-navy shadow-sm transition-colors hover:bg-firefly-dark"
            >
              Schedule a Tour
            </Link>
          </div>
        </div>
      </section>

      {/* Why Families Choose Firefly */}
      <section className="bg-cream-dark px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-semibold text-navy sm:text-3xl">
            Why Families Choose Firefly
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <FeatureCard
                key={feature.title}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Programs */}
      <section className="bg-cream px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-semibold text-navy sm:text-3xl">
            Programs
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted">
            Age-appropriate classrooms and curriculum for every stage of early
            childhood.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {programs.map((program) => (
              <ProgramCard
                key={program.title}
                title={program.title}
                description={program.description}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Locations */}
      <section className="bg-cream-dark px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-semibold text-navy sm:text-3xl">
            Our Locations
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted">
            Three welcoming campuses serving families across the region.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {campuses.map((campus) => (
              <LocationCard
                key={campus.slug}
                slug={campus.slug}
                name={campus.name}
                ages={campus.ages}
                address={campus.address}
                phone={campus.phone}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-forest px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold text-cream sm:text-3xl">
            Ready to visit?
          </h2>
          <p className="mt-4 text-cream/80">
            Schedule a tour and see how Firefly can be the right fit for your
            family.
          </p>
          <Link
            href="/contact"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-firefly px-8 py-3.5 text-base font-semibold text-navy transition-colors hover:bg-firefly-dark"
          >
            Schedule a Tour
          </Link>
        </div>
      </section>
    </>
  );
}
