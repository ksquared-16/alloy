import Link from "next/link";
import type { ReactNode } from "react";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";

export const dynamic = "force-dynamic";

const TILE_MIN_H = "min-h-[5rem]";

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
                    : "border-alloy-forge/12 bg-white/50 hover:bg-white/80",
            ].join(" ")}
        >
            <div className="text-[length:var(--adminv2-settings-nav-card-title-size)] font-semibold leading-tight text-alloy-midnight group-hover:text-alloy-pine">
                {title}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[length:var(--adminv2-settings-nav-card-desc-size)] leading-snug text-alloy-midnight/55">
                {children}
            </div>
        </Link>
    );
}

function SettingsGroup({ label, children }: { label: string; children: ReactNode }) {
    return (
        <section className="space-y-2">
            <h2 className="text-[length:var(--adminv2-settings-section-eyebrow-size)] font-semibold tracking-wide text-alloy-midnight/45">
                {label}
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
        </section>
    );
}

function DiagnosticLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            prefetch={shouldDisableAdminV2LinkPrefetch(href) ? false : undefined}
            className="block rounded-md border border-dashed border-alloy-forge/20 bg-alloy-stone/[0.04] px-3 py-2 text-sm transition-colors hover:border-alloy-forge/30 hover:bg-alloy-stone/[0.08]"
        >
            <span className="font-medium text-alloy-midnight/80">{title}</span>
            <span className="mt-0.5 block text-xs leading-snug text-alloy-midnight/50">{children}</span>
        </Link>
    );
}

export default function AdminV2SettingsIndexPage() {
    return (
        <div className="w-full max-w-3xl space-y-6 pb-4">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Settings</h1>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-alloy-midnight/60">
                    Configure how your organization runs in Alloy — teams, records, layouts, vocabulary, and automation. Day-to-day
                    work stays in the workspace.
                </p>
            </header>

            <SettingsGroup label="Organization setup">
                <SettingsLink href="/adminV2/settings/communications" title="Communications">
                    Email and messaging setup for your org.
                </SettingsLink>
                <SettingsLink href="/adminV2/settings/departments" title="Departments">
                    Teams, sites, and department structure.
                </SettingsLink>
                <SettingsLink href="/adminV2/settings/work-units" title="Work units & queues">
                    Queue lanes and how work appears in the workspace.
                </SettingsLink>
                <SettingsLink href="/adminV2/settings/placement-priority" title="Waitlist priority">
                    Priority rules for waitlisted families.
                </SettingsLink>
                <SettingsLink href="/adminV2/settings/kpis" title="Workspace metrics">
                    Which KPIs appear on department dashboards.
                </SettingsLink>
                <SettingsLink href="/adminV2/settings/users-roles" title="Users & access">
                    Staff accounts, roles, and data access.
                </SettingsLink>
            </SettingsGroup>

            <SettingsGroup label="Records & layouts">
                <SettingsLink href="/adminV2/settings/layouts" title="Record layouts" emphasis>
                    Drawer sections, layout checks, and inquiry workflow order.
                </SettingsLink>
                <SettingsLink href="/adminV2/settings/fields" title="Fields">
                    Labels, visibility, and required rules for record fields.
                </SettingsLink>
                <SettingsLink href="/adminV2/settings/statuses" title="Statuses">
                    Status names and keys by record type.
                </SettingsLink>
                <SettingsLink href="/adminV2/settings/entity-labels" title="Record labels">
                    How record types read in the product (Family, Inquiry, etc.).
                </SettingsLink>
                <SettingsLink href="/adminV2/settings/attention-sla-rules" title="Attention & SLA">
                    When records need attention and SLA thresholds.
                </SettingsLink>
                <SettingsLink href="/adminV2/settings/tours/availability" title="Tour availability">
                    When tours can be booked by location.
                </SettingsLink>
                <SettingsLink href="/adminV2/settings/relationships" title="Relationships">
                    Person and customer relationship types.
                </SettingsLink>
            </SettingsGroup>

            <SettingsGroup label="Workflows & automation">
                <SettingsLink href="/adminV2/workflows" title="Automations">
                    Workflow definitions, runs, and triggers.
                </SettingsLink>
                <SettingsLink href="/adminV2/settings/config-proposals" title="Configuration proposals">
                    Review and apply approved configuration changes.
                </SettingsLink>
            </SettingsGroup>

            <SettingsGroup label="Communication & documents">
                <SettingsLink href="/adminV2/settings/option-sets" title="Option lists">
                    Dropdown values for forms, booking, and pricing.
                </SettingsLink>
                <SettingsLink href="/adminV2/settings/documents/document-fields" title="Document fields">
                    Fields collected on enrollment and document packets.
                </SettingsLink>
                <SettingsLink href="/adminV2/forms" title="Forms & packets">
                    Form builder, versions, and public enrollment links.
                </SettingsLink>
            </SettingsGroup>

            <section className="space-y-2 border-t border-alloy-forge/10 pt-4">
                <h2 className="text-[length:var(--adminv2-settings-section-eyebrow-size)] font-semibold tracking-wide text-alloy-midnight/45">
                    Diagnostics & reference
                </h2>
                <p className="text-xs leading-relaxed text-alloy-midnight/50">
                    Read-only inventories for troubleshooting and engineering handoff — not day-to-day configuration.
                </p>
                <div className="space-y-2">
                    <DiagnosticLink href="/adminV2/settings/actions" title="Action button inventory">
                        Where registry buttons are placed on drawers and queues.
                    </DiagnosticLink>
                    <DiagnosticLink href="/adminV2/settings/status-transition-rules" title="Status transition rules">
                        Server rules for which status changes are allowed.
                    </DiagnosticLink>
                    <DiagnosticLink href="/adminV2/settings/field-sections" title="Section label catalog (advanced)">
                        Internal labels for field grouping — use Record layouts for drawer section order.
                    </DiagnosticLink>
                </div>
            </section>
        </div>
    );
}
