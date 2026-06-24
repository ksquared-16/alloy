"use client";

import {
    kpiPlacementSurfaceOperatorLabel,
    listKpiPlacementCatalog,
    type KpiPlacementSurface,
} from "@/lib/metrics/kpiPlacementCatalog";
import KpiPlacementsSettingsClient from "@/app/adminV2/settings/kpis/KpiPlacementsSettingsClient";
import { OipSectionCard } from "@/app/adminV2/analytics/oipWorkspaceUi";

const SURFACE_ORDER: KpiPlacementSurface[] = [
    "workspace_strip",
    "lifecycle_tile",
    "work_unit_strip",
    "analytics_modal",
];

export default function OipVisibilityPanel({ canEdit }: { canEdit: boolean }) {
    const rows = listKpiPlacementCatalog();

    return (
        <div className="space-y-5" data-testid="kpi-placement-panel">
            <OipSectionCard
                title="V1 indicator placement"
                helper="Legacy Operational Intelligence indicators (playbook KPIs). For V2 metric cards, use Metric builders → Where it appears."
            >
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[36rem] text-left text-xs">
                        <thead>
                            <tr className="border-b border-alloy-stone/12 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                <th className="py-2 pr-3">Indicator</th>
                                <th className="py-2 pr-3">Playbook</th>
                                {SURFACE_ORDER.map((s) => (
                                    <th key={s} className="py-2 px-1.5 text-center">
                                        {kpiPlacementSurfaceOperatorLabel(s)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.kpi_key} className="border-b border-alloy-stone/8">
                                    <td className="py-2 pr-3 font-medium text-alloy-midnight">{row.label}</td>
                                    <td className="py-2 pr-3 capitalize text-alloy-midnight/60">{row.pack.replace(/_/g, " ")}</td>
                                    {SURFACE_ORDER.map((surface) => {
                                        const active = row.surfaces.includes(surface);
                                        return (
                                            <td key={surface} className="py-2 px-1.5 text-center">
                                                <span
                                                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                                                        active ? "bg-alloy-pine/12 text-alloy-pine" : "text-alloy-midnight/20"
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
            </OipSectionCard>

            {canEdit ?
                <OipSectionCard
                    title="Customize workspace strips"
                    helper="Add, reorder, or hide indicators on the organization workspace and individual work units."
                >
                    <KpiPlacementsSettingsClient embedded />
                </OipSectionCard>
            :   <p className="text-xs text-alloy-midnight/55">Admin access required to edit placement.</p>}
        </div>
    );
}
