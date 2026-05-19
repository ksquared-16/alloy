import Link from "next/link";
import type { ReactNode } from "react";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";

export const dynamic = "force-dynamic";

const TILE_MIN_H = "min-h-[4.75rem]";

function SettingsLink({
    href,
    title,
    children,
    emphasis = false,
}: {
    href: string;
    title: string;
    children: React.ReactNode;
    emphasis?: boolean;
}) {
    return (
        <Link
            href={href}
            prefetch={shouldDisableAdminV2LinkPrefetch(href) ? false : undefined}
            className={[
                "group flex h-full flex-col justify-center rounded-lg border px-3 py-2.5 shadow-sm transition-colors",
                TILE_MIN_H,
                emphasis
                    ? "border-alloy-pine/25 bg-alloy-pine/[0.06] hover:bg-alloy-pine/[0.1]"
                    : "border-alloy-forge/12 bg-white/60 hover:bg-white/85",
            ].join(" ")}
        >
            <div className="text-sm font-semibold leading-tight text-alloy-midnight group-hover:text-alloy-pine">{title}</div>
            <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-alloy-midnight/55">{children}</div>
        </Link>
    );
}

function SettingsGroup({ label, children }: { label: string; children: ReactNode }) {
    return (
        <section className="space-y-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">{label}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
        </section>
    );
}

function DiagnosticLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            prefetch={shouldDisableAdminV2LinkPrefetch(href) ? false : undefined}
            className="block rounded-md border border-dashed border-alloy-forge/22 bg-white/40 px-3 py-2 text-sm transition-colors hover:border-alloy-forge/35 hover:bg-white/70"
        >
            <span className="font-medium text-alloy-midnight/85">{title}</span>
            <span className="mt-0.5 block text-xs leading-snug text-alloy-midnight/50">{children}</span>
        </Link>
    );
}

export default function AdminV2SettingsIndexPage() {
    return (
        <div className="w-full max-w-6xl space-y-6 pb-6">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Settings</h1>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-alloy-midnight/60">
                    Configure how your organization runs in Alloy — teams, records, layouts, vocabulary, and automation.
                </p>
            </header>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)] lg:items-start">
                <div className="space-y-7">
                    <SettingsGroup label="Organization setup">
                        <SettingsLink href="/adminV2/settings/communications" title="Communications">
                            Email and messaging setup.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/departments" title="Departments">
                            Teams, sites, and structure.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/work-units" title="Work units & queues">
                            Queue lanes in the workspace.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/placement-priority" title="Waitlist priority">
                            Priority for waitlisted families.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/kpis" title="Workspace metrics">
                            Dashboard KPIs.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/users-roles" title="Users & access">
                            Staff, roles, and data access.
                        </SettingsLink>
                    </SettingsGroup>

                    <SettingsGroup label="Records & layouts">
                        <SettingsLink href="/adminV2/settings/layouts" title="Record layouts">
                            Choose drawer sections and fields.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/fields" title="Fields">
                            Labels, visibility, and required rules.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/statuses" title="Statuses">
                            Manage status names and order.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/entity-labels" title="Record labels">
                            Family, Inquiry, and other names.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/attention-sla-rules" title="Attention & SLA">
                            Needs-attention rules and thresholds.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/tours/availability" title="Tour availability">
                            Bookable tour windows.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/relationships" title="Relationships">
                            Person and customer relationship types.
                        </SettingsLink>
                    </SettingsGroup>

                    <SettingsGroup label="Workflows & automation">
                        <SettingsLink href="/adminV2/workflows" title="Automations">
                            Workflows, triggers, and status-changing automation.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/actions" title="Action buttons">
                            Create and place operator buttons that trigger approved actions or workflows.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/config-proposals" title="Configuration proposals">
                            Review approved config changes.
                        </SettingsLink>
                    </SettingsGroup>

                    <SettingsGroup label="Communication & documents">
                        <SettingsLink href="/adminV2/settings/option-sets" title="Option lists">
                            Dropdown values.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/documents/document-fields" title="Document fields">
                            Enrollment and packet fields.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/forms" title="Forms & packets">
                            Forms and public links.
                        </SettingsLink>
                    </SettingsGroup>
                </div>

                <aside className="space-y-3 rounded-xl border border-dashed border-alloy-forge/20 bg-alloy-stone/[0.05] p-4 lg:sticky lg:top-4">
                    <div>
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                            Diagnostics & reference
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/50">
                            Read-only — for troubleshooting, not everyday configuration.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <DiagnosticLink href="/adminV2/settings/status-transition-rules" title="Workflow automation rules">
                            When conditions are met, workflows may update status (read-only reference).
                        </DiagnosticLink>
                        <DiagnosticLink href="/adminV2/settings/field-sections" title="Field grouping (advanced)">
                            Bulk catalog section names — drawer composition uses Record layouts.
                        </DiagnosticLink>
                    </div>
                </aside>
            </div>
        </div>
    );
}
