import Link from "next/link";

export const dynamic = "force-dynamic";

function SettingsCard({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-admin-border bg-white/80 p-4 shadow-sm hover:bg-white"
    >
      <div className="text-sm font-semibold text-alloy-midnight">{title}</div>
      <div className="mt-1 text-xs text-alloy-midnight/60">{children}</div>
    </Link>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-alloy-midnight/55">{title}</h3>
        {description ? <p className="mt-1 text-sm text-alloy-midnight/60">{description}</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function AdminV2SettingsIndexPage() {
  return (
    <div className="w-full max-w-5xl space-y-10">
      <div className="mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/55">
          Control plane
        </div>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-alloy-midnight">Settings</h2>
        <p className="mt-2 text-sm text-alloy-midnight/65">
          Tenant configuration lives here. Workspace surfaces may link to these pages but should not host full editors.
        </p>
      </div>

      <Section
        title="Organization & workspace"
        description="Structure for departments, queues, and work-unit surfaces."
      >
        <SettingsCard href="/adminV2/settings/departments" title="Departments">
          Org departments that scope work units and workspace layout.
        </SettingsCard>
        <SettingsCard href="/adminV2/settings/work-units" title="Work units">
          Queues and work surfaces; queue definitions follow the existing edit flow.
        </SettingsCard>
      </Section>

      <Section
        title="Records & workflow"
        description="How entities behave in the UI: statuses, field layout, and per-entity field registry."
      >
        <SettingsCard href="/adminV2/settings/statuses" title="Statuses">
          Workflow and entity status keys (drawers and APIs resolve labels from here).
        </SettingsCard>
        <SettingsCard href="/adminV2/settings/field-sections" title="Field sections">
          Group and order fields on record layouts.
        </SettingsCard>
        <SettingsCard href="/adminV2/settings/fields" title="Fields">
          Field definitions by entity (person, customer, job, opportunity, vendor, schedule, location).
        </SettingsCard>
      </Section>

      <Section
        title="Supporting vocabulary"
        description="Reusable lists referenced by fields, booking, and pricing (not entity records themselves)."
      >
        <SettingsCard href="/adminV2/settings/option-sets" title="Option sets">
          Org-scoped lists for select fields, booking, and pricing dimensions.
        </SettingsCard>
      </Section>

      <Section title="Documents" description="Document-type field registry (separate from core entity fields).">
        <SettingsCard href="/adminV2/settings/documents/document-fields" title="Document field definitions">
          Custom fields and types for document records.
        </SettingsCard>
      </Section>

      <section className="rounded-lg border border-dashed border-admin-border bg-white/40 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-alloy-midnight/50">Labels & terminology</h3>
        <p className="mt-1 text-xs text-alloy-midnight/55">
          Entity display names and plural labels will live here as Settings matures. Today they are configured under
          classic Admin workspace tooling (entity labels); no migration in this batch.
        </p>
      </section>
    </div>
  );
}

