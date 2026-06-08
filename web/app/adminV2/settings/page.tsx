import Link from "next/link";
import type { ReactNode } from "react";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";
import { SETTINGS_PAGE_INTRO_CLASS, SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";
import { SETTINGS_INDEX_SUBTITLE } from "@/lib/adminV2/settingsPageSubtitles";
import { settingsSurfacePrefix, type SettingsSurfaceMode } from "@/lib/adminV2/settingsSurfaceModes";

export const dynamic = "force-dynamic";

const TILE_MIN_H = "min-h-[4.75rem]";

function SettingsLink({
    href,
    title,
    children,
    emphasis = false,
    mode,
}: {
    href: string;
    title: string;
    children: React.ReactNode;
    emphasis?: boolean;
    mode?: SettingsSurfaceMode;
}) {
    const description = mode ? `${settingsSurfacePrefix(mode)}${children}` : children;
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
            <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-alloy-midnight/55">{description}</div>
        </Link>
    );
}

function SettingsGroup({ label, children }: { label: string; children: ReactNode }) {
    return (
        <section className="space-y-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">{label}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{children}</div>
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
        <div className={SETTINGS_PAGE_SHELL_CLASS} data-testid="settings-index-page">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Settings</h1>
                <p className={`mt-0.5 ${SETTINGS_PAGE_INTRO_CLASS}`}>{SETTINGS_INDEX_SUBTITLE}</p>
            </header>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)] lg:items-start">
                <div className="space-y-7">
                    <SettingsGroup label="Organization">
                        <SettingsLink href="/adminV2/settings/departments" title="Departments" mode="editable">
                            Teams, sites, and structure.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/locations" title="Locations & hierarchy" mode="editable">
                            Physical sites and classroom or room structure.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/users-roles" title="Users & access" mode="editable">
                            Staff, roles, and data access.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/communications" title="Communications" mode="editable">
                            Email and messaging setup.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/kpis" title="Workspace metrics" mode="editable">
                            Dashboard KPI tiles.
                        </SettingsLink>
                    </SettingsGroup>

                    <SettingsGroup label="Enrollment Operations">
                        <SettingsLink href="/adminV2/settings/lifecycle" title="Lifecycle" mode="editable" emphasis>
                            Configure processes, stages, requirements, statuses, queues, actions, and forms.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/work-units" title="Work Units & Queues" mode="partial">
                            Pipeline lanes and queue layout in the workspace.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/statuses" title="Statuses" mode="editable">
                            Display names and order for inquiry statuses.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/placement-priority" title="Waitlist ranking" mode="editable">
                            Priority factors and order for waitlisted children.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/attention-sla-rules" title="Attention & SLA" mode="editable">
                            Needs-attention buckets and timing thresholds.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/tours/availability" title="Tour availability" mode="editable">
                            Bookable tour windows.
                        </SettingsLink>
                    </SettingsGroup>

                    <SettingsGroup label="Record Setup">
                        <SettingsLink href="/adminV2/settings/layouts" title="Record Layouts" mode="editable">
                            Drawer sections and how fields appear.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/fields" title="Fields" mode="editable">
                            Field labels, visibility, and help text.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/entity-labels" title="Record labels" mode="editable">
                            Family, inquiry, and other record names.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/relationships" title="Relationships" mode="partial">
                            Person and customer relationship types.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/option-sets" title="Option lists" mode="editable">
                            Dropdown values for fields.
                        </SettingsLink>
                    </SettingsGroup>

                    <SettingsGroup label="Actions & Automation">
                        <SettingsLink href="/adminV2/settings/actions" title="Action Buttons" mode="editable">
                            Where enrollment buttons appear in the drawer and workspace.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/workflows" title="Automations" mode="editable">
                            Workflows, triggers, and automated status changes.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/config-proposals" title="Configuration proposals" mode="partial">
                            Review proposed layout changes.
                        </SettingsLink>
                    </SettingsGroup>

                    <SettingsGroup label="Documents & Forms">
                        <SettingsLink href="/adminV2/forms" title="Forms & Packets" mode="related_hub">
                            Form definitions and enrollment packets.
                        </SettingsLink>
                        <SettingsLink href="/adminV2/settings/documents/document-fields" title="Document fields" mode="partial">
                            Fields used on enrollment documents.
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
                            When workflows may update status (read-only reference).
                        </DiagnosticLink>
                        <DiagnosticLink href="/adminV2/settings/field-sections" title="Field grouping (advanced)">
                            Bulk catalog section names — drawer composition uses Record Layouts.
                        </DiagnosticLink>
                    </div>
                </aside>
            </div>
        </div>
    );
}
