import type { ReactNode } from "react";
import { SettingsNavGroup, SettingsNavTile } from "@/components/adminV2/settings/SettingsNavTile";
import { SETTINGS_PAGE_INTRO_CLASS, SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";
import { SETTINGS_INDEX_SUBTITLE } from "@/lib/adminV2/settingsPageSubtitles";
import { ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";

export const dynamic = "force-dynamic";

function SettingsLink(props: {
    href: string;
    title: string;
    children: React.ReactNode;
    emphasis?: boolean;
    mode?: import("@/lib/adminV2/settingsSurfaceModes").SettingsSurfaceMode;
}) {
    return <SettingsNavTile {...props} />;
}

function SettingsGroup({
    label,
    description,
    children,
}: {
    label: string;
    description?: string;
    children: ReactNode;
}) {
    return <SettingsNavGroup label={label} description={description}>{children}</SettingsNavGroup>;
}

function DiagnosticLink(props: { href: string; title: string; children: React.ReactNode }) {
    return <SettingsNavTile {...props} variant="diagnostic" />;
}

export default function AdminV2SettingsIndexPage() {
    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS} data-testid="settings-index-page">
            <header className="rounded-xl border border-alloy-forge/12 border-l-4 border-l-alloy-pine bg-white/90 px-5 py-4 shadow-sm">
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Settings</h1>
                <p className={`mt-1 ${SETTINGS_PAGE_INTRO_CLASS}`}>{SETTINGS_INDEX_SUBTITLE}</p>
            </header>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)] lg:items-start">
                <div className="space-y-8">
                    <SettingsGroup
                        label="Configure"
                        description="Organization structure, access, and communications."
                    >
                        <SettingsLink href="/admin/settings/locations" title="Locations & hierarchy" mode="editable">
                            Physical sites and classroom or room structure.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/departments" title="Departments" mode="editable">
                            Teams, sites, and structure.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/users-roles" title="Users & access" mode="editable">
                            Staff, roles, and data access.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/communications" title="Communications" mode="editable">
                            Email and messaging setup.
                        </SettingsLink>
                    </SettingsGroup>

                    <SettingsGroup
                        label="Sources"
                        description="Where information enters Alloy. Sources feed Processing (Information → Action)."
                    >
                        <SettingsLink href="/admin/forms" title="Forms" mode="editable">
                            Form definitions, fields, and Processing connection.
                        </SettingsLink>
                        <SettingsLink href="/admin/forms/packets" title="Packets" mode="editable">
                            Multi-step packet definitions.
                        </SettingsLink>
                    </SettingsGroup>

                    <SettingsGroup label="Data Model" description="Fields, labels, and how records appear in drawers.">
                        <SettingsLink href="/admin/settings/fields" title="Fields" mode="editable">
                            Field labels, visibility, and help text.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/relationships" title="Relationships" mode="partial">
                            Person and customer relationship types.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/entity-labels" title="Record labels" mode="editable">
                            Family, inquiry, and other record names.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/option-sets" title="Option lists" mode="editable">
                            Dropdown values for fields.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/layouts" title="Layouts" mode="editable">
                            Drawer sections, field placement, and queue row presentation.
                        </SettingsLink>
                    </SettingsGroup>

                    <SettingsGroup
                        label="Operations"
                        description="How work moves, what staff can do, and when attention is needed."
                    >
                        <SettingsLink
                            href={ADMIN_V2_SETTINGS_BUSINESS_PROCESSES_PATH}
                            title="Business Processes"
                            mode="editable"
                            emphasis
                        >
                            Configure processes, stages, membership, expected work, and actions.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/statuses" title="Statuses" mode="editable">
                            Display names and order for inquiry statuses.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/actions" title="Action Buttons" mode="editable">
                            Where enrollment buttons appear in the drawer and workspace.
                        </SettingsLink>
                        <SettingsLink href="/admin/workflows" title="Automations" mode="editable">
                            Workflows, triggers, and automated status changes.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/attention-sla-rules" title="Attention & SLA" mode="editable">
                            Needs-attention buckets and timing thresholds.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/work-units" title="Work Units & Queues" mode="partial">
                            Pipeline lanes and queue layout in the workspace.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/placement-priority" title="Waitlist ranking" mode="editable">
                            Priority factors and order for waitlisted children.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/tours/availability" title="Tour availability" mode="editable">
                            Bookable tour windows.
                        </SettingsLink>
                    </SettingsGroup>

                    <SettingsGroup label="Workspace Experience" description="Metrics, forms, and operator-facing surfaces.">
                        <SettingsLink href="/admin/settings/kpis" title="Workspace metrics" mode="editable">
                            Dashboard KPI tiles.
                        </SettingsLink>
                        <SettingsLink href="/admin/forms" title="Forms & Packets" mode="related_hub">
                            Form definitions and enrollment packets.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/documents/document-fields" title="Document fields" mode="partial">
                            Fields used on enrollment documents.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/config-proposals" title="Configuration proposals" mode="partial">
                            Review proposed layout changes.
                        </SettingsLink>
                    </SettingsGroup>
                </div>

                <aside className="space-y-3 rounded-xl border border-dashed border-alloy-forge/20 bg-alloy-stone/[0.05] p-4 lg:sticky lg:top-4">
                    <div>
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/45">
                            Advanced
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/50">
                            Diagnostics and internal references — not everyday configuration.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <DiagnosticLink href="/admin/settings/status-transition-rules" title="Workflow automation rules">
                            When workflows may update status (read-only reference).
                        </DiagnosticLink>
                        <DiagnosticLink href="/admin/settings/field-sections" title="Field grouping (advanced)">
                            Bulk catalog section names — drawer composition uses Layouts.
                        </DiagnosticLink>
                    </div>
                </aside>
            </div>
        </div>
    );
}
