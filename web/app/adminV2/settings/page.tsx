import Link from "next/link";

export const dynamic = "force-dynamic";

type SettingsCardAccent = "organization" | "records" | "supporting";

function SettingsCard({
    href,
    title,
    children,
    accent = "supporting",
    prominent = false,
}: {
    href: string;
    title: string;
    children: React.ReactNode;
    accent?: SettingsCardAccent;
    /** Larger callout (e.g. Fields hub). */
    prominent?: boolean;
}) {
    const accentBorder =
        accent === "records"
            ? "border-l-[3px] border-l-alloy-pine"
            : accent === "organization"
              ? "border-l-[3px] border-l-slate-500/45"
              : "border-l-[3px] border-l-alloy-forge/20";
    return (
        <Link
            href={href}
            className={[
                "group block rounded-xl border border-alloy-forge/12 bg-white/55 shadow-[0_2px_10px_rgba(39,63,82,0.05)] backdrop-blur-[2px] transition-colors hover:bg-white/80",
                accentBorder,
                prominent ? "p-5 sm:p-6" : "p-4",
            ].join(" ")}
        >
            <div
                className={
                    prominent
                        ? "text-base font-semibold tracking-tight text-alloy-midnight group-hover:text-alloy-pine"
                        : "text-sm font-semibold text-alloy-midnight group-hover:text-alloy-pine"
                }
            >
                {title}
            </div>
            <div className={`mt-1 text-alloy-midnight/60 ${prominent ? "text-sm leading-snug" : "text-xs"}`}>{children}</div>
        </Link>
    );
}

function SectionHeader({ title, description, prominent }: { title: string; description?: string; prominent?: boolean }) {
    return (
        <div className={prominent ? "mb-4" : "mb-3"}>
            <h3
                className={
                    prominent
                        ? "text-sm font-semibold uppercase tracking-[0.08em] text-alloy-midnight"
                        : "text-xs font-semibold uppercase tracking-[0.1em] text-alloy-midnight/55"
                }
            >
                {title}
            </h3>
            {description ? (
                <p className={`mt-1 text-alloy-midnight/60 ${prominent ? "text-sm" : "text-xs"}`}>{description}</p>
            ) : null}
        </div>
    );
}

export default function AdminV2SettingsIndexPage() {
    return (
        <div className="w-full max-w-5xl space-y-12">
            <div className="mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/55">Control plane</div>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-alloy-midnight">Settings</h2>
                <p className="mt-2 text-sm text-alloy-midnight/65">
                    Tenant configuration lives here. Workspace surfaces may link to these pages but should not host full editors.
                </p>
            </div>

            <section className="space-y-3">
                <SectionHeader title="Organization" description="Structure for departments, queues, and work-unit surfaces." />
                <div className="grid gap-3 sm:grid-cols-2">
                    <SettingsCard href="/adminV2/settings/departments" title="Departments" accent="organization">
                        Org departments that scope work units and workspace layout.
                    </SettingsCard>
                    <SettingsCard href="/adminV2/settings/work-units" title="Work units" accent="organization">
                        Queues and work surfaces; queue definitions follow the existing edit flow.
                    </SettingsCard>
                </div>
            </section>

            <section className="rounded-2xl border border-alloy-pine/20 bg-gradient-to-br from-white/75 via-white/60 to-alloy-pine/[0.04] p-5 shadow-[0_4px_24px_rgba(39,63,82,0.06)] sm:p-7">
                <SectionHeader
                    prominent
                    title="Records & terminology"
                    description="How entities behave in the UI: statuses, field layout, per-entity field registry, and display names."
                />
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                        <SettingsCard href="/adminV2/settings/fields" title="Fields" accent="records" prominent>
                            Field definitions by entity (person, customer, job, opportunity, vendor, schedule, location) — the
                            registry forms, drawers, and tables use these keys.
                        </SettingsCard>
                    </div>
                    <SettingsCard href="/adminV2/settings/statuses" title="Statuses" accent="records">
                        Workflow and entity status keys (drawers and APIs resolve labels from here).
                    </SettingsCard>
                    <SettingsCard href="/adminV2/settings/field-sections" title="Field sections" accent="records">
                        Group and order fields on record layouts.
                    </SettingsCard>
                    <SettingsCard href="/adminV2/settings/entity-labels" title="Entity labels" accent="records">
                        Industry defaults and per-org overrides for Family, Inquiry, Location, and other display names.
                    </SettingsCard>
                </div>
            </section>

            <section className="space-y-3">
                <SectionHeader
                    title="Supporting vocabulary"
                    description="Reusable lists referenced by fields, booking, and pricing (not entity records themselves)."
                />
                <div className="grid gap-3 sm:grid-cols-2">
                    <SettingsCard href="/adminV2/settings/option-sets" title="Option sets" accent="supporting">
                        Org-scoped lists for select fields, booking, and pricing dimensions.
                    </SettingsCard>
                    <SettingsCard href="/adminV2/settings/documents/document-fields" title="Document field definitions" accent="supporting">
                        Custom fields and types for document records.
                    </SettingsCard>
                </div>
            </section>
        </div>
    );
}
