"use client";

import Link from "next/link";
import {
    kpiPlacementSurfaceLabel,
    listKpiPlacementCatalog,
    type KpiPlacementSurface,
} from "@/lib/metrics/kpiPlacementCatalog";

const SURFACE_ORDER: KpiPlacementSurface[] = [
    "workspace_strip",
    "work_unit_strip",
    "analytics_modal",
    "lifecycle_tile",
];

function SettingsSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3 rounded-lg border border-alloy-forge/12 bg-white/80 p-4 shadow-sm">
            <div>
                <h2 className="text-sm font-semibold text-alloy-midnight">{title}</h2>
                {description ?
                    <p className="mt-1 max-w-3xl text-[11px] leading-snug text-alloy-midnight/55">{description}</p>
                :   null}
            </div>
            {children}
        </section>
    );
}

export default function KpiPlacementOverviewPanel({ canEdit }: { canEdit: boolean }) {
    const rows = listKpiPlacementCatalog();

    return (
        <div className="space-y-4" data-testid="kpi-placement-panel">
            <SettingsSection
                title="Where KPIs appear"
                description="Operational intelligence surfaces across the workspace. Custom placement rows can override defaults on workspace and work unit strips."
            >
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[36rem] text-left text-xs">
                        <thead>
                            <tr className="border-b border-alloy-forge/10 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                <th className="py-2 pr-3">KPI</th>
                                <th className="py-2 pr-3">Pack</th>
                                {SURFACE_ORDER.map((s) => (
                                    <th key={s} className="py-2 px-2 text-center">
                                        {kpiPlacementSurfaceLabel(s)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.kpi_key} className="border-b border-alloy-forge/6">
                                    <td className="py-2.5 pr-3">
                                        <div className="font-medium text-alloy-midnight">{row.label}</div>
                                        <div className="text-[10px] text-alloy-midnight/40">{row.metric_key}</div>
                                    </td>
                                    <td className="py-2.5 pr-3 capitalize text-alloy-midnight/65">{row.pack.replace(/_/g, " ")}</td>
                                    {SURFACE_ORDER.map((surface) => {
                                        const active = row.surfaces.includes(surface);
                                        return (
                                            <td key={surface} className="py-2.5 px-2 text-center">
                                                <span
                                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                                                        active ? "bg-alloy-pine/12 text-alloy-pine" : "bg-alloy-stone/10 text-alloy-midnight/25"
                                                    }`}
                                                    aria-label={active ? "Visible" : "Not shown"}
                                                >
                                                    {active ? "✓" : "—"}
                                                </span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </SettingsSection>

            <SettingsSection title="Customize strip placement" description="Add, reorder, or hide workspace and work unit KPI cells.">
                {canEdit ?
                    <Link
                        href="/admin/settings/kpis"
                        className="inline-flex items-center rounded-md border border-alloy-pine/30 bg-alloy-pine/5 px-3 py-2 text-xs font-semibold text-alloy-pine hover:bg-alloy-pine/10"
                    >
                        Open workspace metrics →
                    </Link>
                :   <p className="text-xs text-alloy-midnight/55">Admin access required to edit placements.</p>}
            </SettingsSection>

            <SettingsSection title="Work unit coverage (defaults)" description="Enrollment pipeline work units receive OIP strip metrics by default.">
                <ul className="space-y-1 text-xs text-alloy-midnight/70">
                    <li>
                        <span className="font-medium">Enrollment Pipeline</span> — tour conversion, time to schedule tour, forms completion, overdue work
                    </li>
                    <li>
                        <span className="font-medium">Lifecycle stage work units</span> — OIP performance strip (queue KPIs hidden on builder-owned shells)
                    </li>
                    <li>
                        <span className="font-medium">Tours / Forms / Communications</span> — inherits department or work unit placements when configured
                    </li>
                </ul>
            </SettingsSection>
        </div>
    );
}
