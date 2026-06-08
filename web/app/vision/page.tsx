import ArtifactCard from "@/components/marketing/ArtifactCard";
import CTAButton from "@/components/marketing/CTAButton";
import SectionShell from "@/components/marketing/SectionShell";
import { MARKETING_ARTIFACTS } from "@/lib/marketing/artifactPaths";

const SHIPPED = [
  "Platform Foundation",
  "Enrollment & Family Operations",
  "Communications",
  "Documents & Forms",
  "Tasks",
  "Workflow Automation",
  "Operational Intelligence / BOS",
] as const;

const NEXT_DIRECTION = [
  "Billing",
  "Payments",
  "Attendance",
  "Scheduling",
  "Staffing",
  "Parent Experience",
  "Reporting & Analytics",
] as const;

export default function VisionPage() {
  return (
    <>
      <SectionShell className="!pt-12 md:!pt-16" innerClassName="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-alloy-juniper">
          Vision & Roadmap
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-alloy-forge md:text-5xl">
          From Enrollment Operations to the Operating System for Childcare
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-alloy-forge/70">
          Alloy starts with enrollment — the workflow where families meet your organization — and
          expands toward a single operating system for childcare. This roadmap reflects direction,
          not guaranteed release dates.
        </p>
      </SectionShell>

      <SectionShell variant="muted">
        <div className="grid items-start gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-alloy-juniper">
              Shipped / Current
            </h2>
            <ul className="mt-4 space-y-3">
              {SHIPPED.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-lg border border-alloy-juniper/15 bg-alloy-juniper/5 px-4 py-3"
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-alloy-juniper" aria-hidden />
                  <span className="text-sm font-medium text-alloy-forge">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-alloy-forge/45">
              Next — Direction, not commitments
            </h2>
            <ul className="mt-4 space-y-3">
              {NEXT_DIRECTION.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-lg border border-alloy-forge/8 bg-white px-4 py-3"
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border border-alloy-forge/25" aria-hidden />
                  <span className="text-sm text-alloy-forge/70">{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-alloy-forge/50">
              Sequencing and scope may change as we learn from operators in the field. We share
              direction early so you can see where Alloy is headed — not to lock in timelines.
            </p>
          </div>
        </div>
      </SectionShell>

      <SectionShell>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <ArtifactCard src={MARKETING_ARTIFACTS.vision} alt="Alloy platform vision" />
          <div>
            <h2 className="text-2xl font-bold text-alloy-forge md:text-3xl">
              One platform. One source of truth. One operating system for childcare.
            </h2>
            <p className="mt-4 text-lg text-alloy-forge/70">
              The goal is not more software — it is fewer systems. Every workflow Alloy adds shares
              the same foundation, so operators stop being the integration layer.
            </p>
            <div className="mt-8">
              <CTAButton href="/contact">Request a Demo</CTAButton>
            </div>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
