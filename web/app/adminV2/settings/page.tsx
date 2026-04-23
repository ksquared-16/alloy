import Link from "next/link";

export const dynamic = "force-dynamic";

type SettingsCardAccent = "organization" | "records" | "vocabulary";

function SettingsCard({
    href,
    title,
    children,
    accent = "vocabulary",
}: {
    href: string;
    title: string;
    children: React.ReactNode;
    accent?: SettingsCardAccent;
}) {
    const accentBorder =
        accent === "records"
            ? "border-l-alloy-pine/60"
            : accent === "organization"
              ? "border-l-slate-500/50"
              : "border-l-alloy-forge/25";
    return (
        <Link
            href={href}
            className={[
                "group flex min-h-[4.25rem] flex-col justify-center rounded-lg border border-alloy-forge/12 bg-white/50 px-3 py-2.5 shadow-sm backdrop-blur-[1px] transition-colors hover:bg-white/75",
                "border-l-[3px]",
                accentBorder,
            ].join(" ")}
        >
            <div className="text-sm font-semibold leading-tight text-alloy-midnight group-hover:text-alloy-pine">{title}</div>
            <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-alloy-midnight/55">{children}</div>
        </Link>
    );
}

function Group({
    label,
    accentClass,
    children,
}: {
    label: string;
    accentClass: string;
    children: React.ReactNode;
}) {
    return (
        <div className={`space-y-2 border-l-2 pl-3 ${accentClass}`}>
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/50">{label}</h3>
            {children}
        </div>
    );
}

export default function AdminV2SettingsIndexPage() {
    return (
        <div className="w-full max-w-4xl space-y-5 pb-2">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Settings</h1>
                <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                    Tenant control plane — workspace links here; editors stay in Settings, not on department surfaces.
                </p>
            </header>

            <div className="space-y-4">
                <Group label="Organization" accentClass="border-slate-400/40">
                    <div className="grid grid-cols-2 gap-2">
                        <SettingsCard href="/adminV2/settings/departments" title="Departments" accent="organization">
                            Departments and workspace hierarchy.
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/work-units" title="Work units" accent="organization">
                            Queues and work-unit definitions.
                        </SettingsCard>
                    </div>
                </Group>

                <Group label="Records" accentClass="border-alloy-pine/45">
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                        <SettingsCard href="/adminV2/settings/fields" title="Fields" accent="records">
                            Field definitions by entity for forms and drawers.
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/field-sections" title="Field sections" accent="records">
                            Group and order fields on layouts.
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/statuses" title="Statuses" accent="records">
                            Status keys and labels per entity type.
                        </SettingsCard>
                        <SettingsCard href="/adminV2/settings/entity-labels" title="Entity labels" accent="records">
                            Display names (Family, Inquiry, etc.).
                        </SettingsCard>
                    </div>
                </Group>

                <Group label="Vocabulary & documents" accentClass="border-alloy-forge/25">
                    <div className="grid grid-cols-2 gap-2">
                        <SettingsCard href="/adminV2/settings/option-sets" title="Option sets" accent="vocabulary">
                            Select lists, booking, and pricing dimensions.
                        </SettingsCard>
                        <SettingsCard
                            href="/adminV2/settings/documents/document-fields"
                            title="Document field definitions"
                            accent="vocabulary"
                        >
                            Schema per document type.
                        </SettingsCard>
                    </div>
                </Group>
            </div>

            <footer className="border-t border-alloy-forge/10 pt-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/35">Later</p>
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5 text-[10px] text-alloy-midnight/40">
                    <span>Automation</span>
                    <span>Financial configuration</span>
                </div>
            </footer>
        </div>
    );
}
