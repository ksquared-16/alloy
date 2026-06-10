import type { ReactNode } from "react";
import { SettingsNavGroup, SettingsNavTile } from "@/components/adminV2/settings/SettingsNavTile";
import { SETTINGS_PAGE_INTRO_CLASS, SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";
import { SETTINGS_INDEX_SUBTITLE } from "@/lib/adminV2/settingsPageSubtitles";

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

function SettingsGroup({ label, children }: { label: string; children: ReactNode }) {
    return <SettingsNavGroup label={label}>{children}</SettingsNavGroup>;
}

function DiagnosticLink(props: { href: string; title: string; children: React.ReactNode }) {
    return <SettingsNavTile {...props} variant="diagnostic" />;
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
                        <SettingsLink href="/admin/settings/departments" title="Departments" mode="editable">
                            Teams, sites, and structure.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/locations" title="Locations & hierarchy" mode="editable">
                            Physical sites and classroom or room structure.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/users-roles" title="Users & access" mode="editable">
                            Staff, roles, and data access.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/communications" title="Communications" mode="editable">
                            Email and messaging setup.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/kpis" title="Workspace metrics" mode="editable">
                            Dashboard KPI tiles.
                        </SettingsLink>
                    </SettingsGroup>

                    <SettingsGroup label="Enrollment Operations">
                        <SettingsLink href="/admin/settings/lifecycle" title="Business Processes" mode="editable" emphasis>
                            Configure processes, stages, requirements, statuses, queues, actions, and forms.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/work-units" title="Work Units & Queues" mode="partial">
                            Pipeline lanes and queue layout in the workspace.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/statuses" title="Statuses" mode="editable">
                            Display names and order for inquiry statuses.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/placement-priority" title="Waitlist ranking" mode="editable">
                            Priority factors and order for waitlisted children.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/attention-sla-rules" title="Attention & SLA" mode="editable">
                            Needs-attention buckets and timing thresholds.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/tours/availability" title="Tour availability" mode="editable">
                            Bookable tour windows.
                        </SettingsLink>
                    </SettingsGroup>

                    <SettingsGroup label="Record Setup">
                        <SettingsLink href="/admin/settings/layouts" title="Record Layouts" mode="editable">
                            Drawer sections and how fields appear.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/fields" title="Fields" mode="editable">
                            Field labels, visibility, and help text.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/entity-labels" title="Record labels" mode="editable">
                            Family, inquiry, and other record names.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/relationships" title="Relationships" mode="partial">
                            Person and customer relationship types.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/option-sets" title="Option lists" mode="editable">
                            Dropdown values for fields.
                        </SettingsLink>
                    </SettingsGroup>

                    <SettingsGroup label="Actions & Automation">
                        <SettingsLink href="/admin/settings/actions" title="Action Buttons" mode="editable">
                            Where enrollment buttons appear in the drawer and workspace.
                        </SettingsLink>
                        <SettingsLink href="/admin/workflows" title="Automations" mode="editable">
                            Workflows, triggers, and automated status changes.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/config-proposals" title="Configuration proposals" mode="partial">
                            Review proposed layout changes.
                        </SettingsLink>
                    </SettingsGroup>

                    <SettingsGroup label="Documents & Forms">
                        <SettingsLink href="/admin/forms" title="Forms & Packets" mode="related_hub">
                            Form definitions and enrollment packets.
                        </SettingsLink>
                        <SettingsLink href="/admin/settings/documents/document-fields" title="Document fields" mode="partial">
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
                        <DiagnosticLink href="/admin/settings/status-transition-rules" title="Workflow automation rules">
                            When workflows may update status (read-only reference).
                        </DiagnosticLink>
                        <DiagnosticLink href="/admin/settings/field-sections" title="Field grouping (advanced)">
                            Bulk catalog section names — drawer composition uses Record Layouts.
                        </DiagnosticLink>
                    </div>
                </aside>
            </div>
        </div>
    );
}
