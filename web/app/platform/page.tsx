import ArtifactCard from "@/components/marketing/ArtifactCard";
import CTAButton from "@/components/marketing/CTAButton";
import SectionShell from "@/components/marketing/SectionShell";
import { MARKETING_ARTIFACTS } from "@/lib/marketing/artifactPaths";

const FOUNDATION_CAPABILITIES = [
  {
    title: "Entities & Records",
    description: "People, families, opportunities, and operational records — structured and connected.",
  },
  {
    title: "Workflows & Lifecycle",
    description: "Configurable stages, transitions, and requirements that mirror how work actually flows.",
  },
  {
    title: "Layouts & Forms",
    description: "Operator-facing layouts and family-facing forms, driven by the same field model.",
  },
  {
    title: "Permissions",
    description: "Role-based access scoped to org, department, and site — without bolt-on security layers.",
  },
  {
    title: "Documents & Messaging",
    description: "Documents, communications, and tasks tied to the record — not scattered across inboxes.",
  },
  {
    title: "BOS Intelligence Layer",
    description: "Operational intelligence that surfaces context, urgency, and next actions where teams work.",
  },
] as const;

export default function PlatformPage() {
  return (
    <>
      <SectionShell className="!pt-12 md:!pt-16" innerClassName="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-alloy-juniper">Platform</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-alloy-forge md:text-5xl">
          Built on a unified platform foundation
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-alloy-forge/70">
          Alloy is not a collection of point solutions stitched together. It is a platform where
          operational workflows share entities, permissions, communications, and intelligence —
          so teams work from one source of truth.
        </p>
      </SectionShell>

      <SectionShell variant="muted" innerClassName="grid items-center gap-12 lg:grid-cols-2">
        <ArtifactCard
          src={MARKETING_ARTIFACTS.platformFoundation}
          alt="Platform foundation architecture"
        />
        <div>
          <h2 className="text-2xl font-bold text-alloy-forge">What the foundation includes</h2>
          <p className="mt-4 text-alloy-forge/70">
            Every operational workflow on Alloy runs on the same core capabilities — configured for
            your organization, not rebuilt from scratch.
          </p>
        </div>
      </SectionShell>

      <SectionShell>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FOUNDATION_CAPABILITIES.map((cap) => (
            <div
              key={cap.title}
              className="rounded-xl border border-alloy-forge/8 bg-white p-6 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-alloy-forge">{cap.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-alloy-forge/65">{cap.description}</p>
            </div>
          ))}
        </div>
      </SectionShell>

      <SectionShell variant="muted">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-alloy-forge md:text-3xl">
            Enrollment is the first workflow. The foundation is forever.
          </h2>
          <p className="mt-4 text-lg text-alloy-forge/70">
            New operational areas — billing, attendance, scheduling, and more — plug into the same
            platform instead of adding another disconnected system.
          </p>
          <div className="mt-8">
            <CTAButton href="/contact">Book a Demo</CTAButton>
          </div>
        </div>
      </SectionShell>
    </>
  );
}
