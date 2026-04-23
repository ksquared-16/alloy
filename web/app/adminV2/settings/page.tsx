import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsIndexPage() {
  return (
    <div className="w-full max-w-5xl">
      <div className="mb-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/55">
          Control plane
        </div>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-alloy-midnight">Settings</h2>
        <p className="mt-2 text-sm text-alloy-midnight/65">
          Tenant configuration lives here. Workspace surfaces may link to these pages but should not host full editors.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/adminV2/settings/option-sets"
          className="rounded-xl border border-admin-border bg-white/80 p-4 shadow-sm hover:bg-white"
        >
          <div className="text-sm font-semibold text-alloy-midnight">Option sets</div>
          <div className="mt-1 text-xs text-alloy-midnight/60">
            Org-scoped lists for select fields, booking, and pricing dimensions.
          </div>
        </Link>
        <Link
          href="/adminV2/settings/statuses"
          className="rounded-xl border border-admin-border bg-white/80 p-4 shadow-sm hover:bg-white"
        >
          <div className="text-sm font-semibold text-alloy-midnight">Statuses</div>
          <div className="mt-1 text-xs text-alloy-midnight/60">Workflow and entity status values.</div>
        </Link>
        <Link
          href="/adminV2/settings/field-sections"
          className="rounded-xl border border-admin-border bg-white/80 p-4 shadow-sm hover:bg-white"
        >
          <div className="text-sm font-semibold text-alloy-midnight">Field sections</div>
          <div className="mt-1 text-xs text-alloy-midnight/60">Group and order fields on record layouts.</div>
        </Link>
        <Link
          href="/adminV2/settings/documents/document-fields"
          className="rounded-xl border border-admin-border bg-white/80 p-4 shadow-sm hover:bg-white"
        >
          <div className="text-sm font-semibold text-alloy-midnight">Document field definitions</div>
          <div className="mt-1 text-xs text-alloy-midnight/60">Custom fields and types for document records.</div>
        </Link>
      </div>
    </div>
  );
}

