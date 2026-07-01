import ArtifactCard from "@/components/marketing/ArtifactCard";
import CTAButton from "@/components/marketing/CTAButton";
import SectionShell from "@/components/marketing/SectionShell";
import { MARKETING_ARTIFACTS } from "@/lib/marketing/artifactPaths";
import Link from "next/link";

const ENROLLMENT_STAGES: { label: string; active?: boolean }[] = [
  { label: "Lead", active: true },
  { label: "Qualification" },
  { label: "Tour" },
  { label: "Enrollment" },
  { label: "Enrolled", active: true },
];

const WORKFLOW_AREAS = [
  "Enrollment",
  "Billing",
  "Payments",
  "Attendance",
  "Scheduling",
  "Staffing",
  "Parent Experience",
] as const;

const VISION_TODAY = [
  "Enrollment",
  "Tours",
  "Communications",
  "Documents",
  "Tasks",
  "Operational Intelligence",
] as const;

const VISION_TOMORROW = [
  "Billing",
  "Payments",
  "Attendance",
  "Scheduling",
  "Staffing",
  "Parent Experience",
  "Reporting & Analytics",
] as const;

function SectionHeading({
  title,
  subtitle,
  align = "left",
}: {
  title: string;
  subtitle?: string;
  align?: "left" | "center";
}) {
  const alignClass = align === "center" ? "text-center mx-auto" : "";
  return (
    <div className={`max-w-2xl ${alignClass}`}>
      <h2 className="text-3xl font-bold tracking-tight text-alloy-forge md:text-4xl">{title}</h2>
      {subtitle ? (
        <p className="mt-4 text-lg leading-relaxed text-alloy-forge/70">{subtitle}</p>
      ) : null}
    </div>
  );
}

function WorkflowPill({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium ${
        active
          ? "bg-alloy-juniper/12 text-alloy-juniper ring-1 ring-alloy-juniper/25"
          : "bg-alloy-stone text-alloy-forge/75 ring-1 ring-alloy-forge/8"
      }`}
    >
      {label}
    </span>
  );
}

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <SectionShell className="!pt-12 md:!pt-16 lg:!pt-20" innerClassName="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-alloy-juniper">Alloy</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-alloy-forge md:text-5xl lg:text-6xl">
            A Platform For Operational Workflows
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-alloy-forge/70">
            Connecting people, processes, communications, documents, and actions into a single
            operating system.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CTAButton href="/contact">Book a Demo</CTAButton>
            <CTAButton href="/login" variant="secondary">
              Sign In
            </CTAButton>
          </div>
        </div>
        <ArtifactCard
          src={MARKETING_ARTIFACTS.title}
          alt="Abstract Alloy platform visual"
          priority
        />
      </SectionShell>

      {/* Problem */}
      <SectionShell variant="muted">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <ArtifactCard
            src={MARKETING_ARTIFACTS.problem}
            alt="Disconnected systems visualization"
            className="order-2 lg:order-1"
          />
          <div className="order-1 lg:order-2">
            <SectionHeading
              title="Most childcare organizations operate across disconnected systems."
              subtitle="CRM, email, forms, tasks, documents, and reports often live in separate places. People become the integration layer."
            />
          </div>
        </div>
      </SectionShell>

      {/* Platform Foundation */}
      <SectionShell>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              title="Built on a unified platform foundation."
              subtitle="Entities, workflows, lifecycle, layouts, forms, permissions, documents, messaging, and tasks — powered by the BOS Intelligence Layer."
            />
            <p className="mt-6">
              <Link href="/platform" className="text-sm font-semibold text-alloy-juniper hover:underline">
                Explore the platform →
              </Link>
            </p>
          </div>
          <ArtifactCard
            src={MARKETING_ARTIFACTS.platformFoundation}
            alt="Unified platform foundation diagram"
          />
        </div>
      </SectionShell>

      {/* First Operational Workflow */}
      <SectionShell variant="muted">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <ArtifactCard
            src={MARKETING_ARTIFACTS.enrollmentWorkflow}
            alt="Enrollment workflow stages"
            className="order-2 lg:order-1"
          />
          <div className="order-1 lg:order-2">
            <SectionHeading
              title="Enrollment & Family Operations"
              subtitle="The first operational workflow running on Alloy."
            />
            <div className="mt-8 flex flex-wrap gap-2">
              {ENROLLMENT_STAGES.map((stage) => (
                <WorkflowPill key={stage.label} label={stage.label} active={stage.active} />
              ))}
            </div>
            <p className="mt-4 text-sm text-alloy-forge/55">
              <span className="font-medium text-alloy-forge/70">Waitlist</span> — a parking spot
              within the workflow, not a dead end.
            </p>
          </div>
        </div>
      </SectionShell>

      {/* Built Differently */}
      <SectionShell>
        <div className="mx-auto max-w-3xl text-center">
          <SectionHeading
            align="center"
            title="Most software starts with features. Alloy started with the foundation."
            subtitle="The platform foundation allows new operational workflows to be added without creating disconnected systems."
          />
        </div>
      </SectionShell>

      {/* Bigger Picture */}
      <SectionShell variant="accent">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading title="Build the foundation once. Add workflows forever." />
            <div className="mt-8 flex flex-wrap gap-2">
              {WORKFLOW_AREAS.map((area, i) => (
                <WorkflowPill key={area} label={area} active={i === 0} />
              ))}
            </div>
          </div>
          <ArtifactCard
            src={MARKETING_ARTIFACTS.biggerPicture}
            alt="Workflow areas on unified platform"
          />
        </div>
      </SectionShell>

      {/* Vision */}
      <SectionShell>
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading title="From Enrollment Operations to the Operating System for Childcare" />
            <div className="mt-10 grid gap-8 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-alloy-juniper">
                  Today
                </h3>
                <ul className="mt-3 space-y-2">
                  {VISION_TODAY.map((item) => (
                    <li key={item} className="text-sm text-alloy-forge/75">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-alloy-forge/45">
                  Tomorrow
                </h3>
                <ul className="mt-3 space-y-2">
                  {VISION_TOMORROW.map((item) => (
                    <li key={item} className="text-sm text-alloy-forge/55">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-8 text-lg font-medium text-alloy-forge">
              One platform. One source of truth. One operating system for childcare.
            </p>
            <p className="mt-4">
              <Link href="/vision" className="text-sm font-semibold text-alloy-juniper hover:underline">
                See the full roadmap →
              </Link>
            </p>
          </div>
          <ArtifactCard src={MARKETING_ARTIFACTS.vision} alt="Platform vision timeline" />
        </div>
      </SectionShell>

      {/* Final CTA */}
      <SectionShell variant="muted" className="!pb-20 md:!pb-28">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-alloy-forge md:text-4xl">
            See Alloy in action.
          </h2>
          <p className="mt-4 text-lg text-alloy-forge/65">
            Walk through enrollment operations on a platform built for how childcare teams actually
            work.
          </p>
          <div className="mt-8">
            <CTAButton href="/contact">Book a Demo</CTAButton>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
