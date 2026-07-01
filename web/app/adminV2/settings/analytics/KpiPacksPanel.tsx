"use client";

/**
 * Operational playbooks settings — V1: read-only playbooks with inline target/placement actions.
 */

import Link from "next/link";
import { useState } from "react";
import { listMetricPacks } from "@/lib/metrics/packs";
import { getMetricDefinition } from "@/lib/metrics/registry";
import {
    OIP_CARD_CLASS,
    OIP_INLINE_ACTION_CLASS,
    oipPackAccent,
} from "@/app/adminV2/analytics/oipWorkspaceUi";
import { packOperatorPurpose, packOperatorSurfaces } from "@/lib/metrics/oipOperatorCopy";
import { useOipSettings } from "@/app/adminV2/settings/analytics/OipSettingsContext";
import {
    oipHealthStatusChipClass,
    oipHealthStatusLabel,
} from "@/lib/metrics/oipStatusPresentation";
import type { OipKpiSnapshotRow } from "@/lib/metrics/fetchOipSettingsSnapshot";
import { OipKpiObjectCard, OipKpiObjectRow } from "@/components/admin/workspace/OipKpiObjectCard";

type Props = {
    onNavigateTab?: (tab: "targets" | "visibility") => void;
};

function rowForMetric(rows: OipKpiSnapshotRow[] | undefined, metricKey: string): OipKpiSnapshotRow | undefined {
    return rows?.find((r) => r.metric_key === metricKey);
}

export default function KpiPacksPanel({ onNavigateTab }: Props) {
    const { snapshot, loading } = useOipSettings();
    const allPacks = listMetricPacks();
    const availablePacks = allPacks.filter((pack) => pack.domainStatus === "available" && pack.metricKeys.length > 0);
    const comingSoonPacks = allPacks.filter((pack) => pack.domainStatus === "coming_soon");
    const [expandedPack, setExpandedPack] = useState<string | null>(null);
    const [comingSoonExpanded, setComingSoonExpanded] = useState(false);

    return (
        <div className="space-y-2.5" data-testid="kpi-packs-panel">
            <div className="grid gap-2.5 lg:grid-cols-2">
                {availablePacks.map((pack) => {
                    const surfaces = packOperatorSurfaces(pack.key);
                    const accent = oipPackAccent(pack.key);
                    const packStatus = snapshot?.pack_status[pack.key] ?? "unknown";
                    const isExpanded = expandedPack === pack.key;

                    return (
                        <div
                            key={pack.key}
                            className={`${OIP_CARD_CLASS} border-l-[3px] ${accent.border}`}
                            data-oip-playbook={pack.key}
                        >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className={`text-sm font-semibold ${accent.label}`}>{pack.label}</div>
                                        <span
                                            className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${oipHealthStatusChipClass(packStatus)}`}
                                        >
                                            {oipHealthStatusLabel(packStatus)}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/55">
                                        {packOperatorPurpose(pack)}
                                    </p>
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-3">
                                    <Link
                                        href="/admin/settings/analytics?tab=targets"
                                        className={OIP_INLINE_ACTION_CLASS}
                                        onClick={() => onNavigateTab?.("targets")}
                                    >
                                        Edit targets
                                    </Link>
                                    <Link
                                        href="/admin/settings/analytics?tab=visibility"
                                        className={OIP_INLINE_ACTION_CLASS}
                                        onClick={() => onNavigateTab?.("visibility")}
                                    >
                                        Experience placement
                                    </Link>
                                </div>
                            </div>

                            <div className="mt-2.5">
                                {loading && !snapshot ?
                                    <div className="h-14 animate-pulse rounded-lg border border-alloy-stone/12 bg-white" />
                                :   <OipKpiObjectRow layout="command">
                                        {pack.metricKeys.map((metricKey) => {
                                            const def = getMetricDefinition(metricKey);
                                            const row = rowForMetric(snapshot?.kpi_rows, metricKey);
                                            return (
                                                <OipKpiObjectCard
                                                    key={metricKey}
                                                    label={def.label}
                                                    value={row?.current_display ?? "—"}
                                                    target={row?.target_display ?? null}
                                                    status={row?.status ?? "unknown"}
                                                    layout="command"
                                                    metricKey={metricKey}
                                                />
                                            );
                                        })}
                                    </OipKpiObjectRow>
                                }
                            </div>

                            {surfaces.length ?
                                <button
                                    type="button"
                                    className="mt-2 text-left text-[10px] text-alloy-midnight/45 hover:text-alloy-midnight/65"
                                    onClick={() => setExpandedPack(isExpanded ? null : pack.key)}
                                    aria-expanded={isExpanded}
                                >
                                    {isExpanded ? "Hide placement" : "Where shown"} · {surfaces.length} surfaces
                                </button>
                            :   null}
                            {isExpanded && surfaces.length ?
                                <p className="mt-1 text-[11px] text-alloy-midnight/60">{surfaces.join(" · ")}</p>
                            :   null}
                        </div>
                    );
                })}
            </div>

            {comingSoonPacks.length ?
                <div
                    className="rounded-lg border border-dashed border-alloy-stone/18 bg-white px-3 py-2"
                    data-oip-settings-coming-soon="true"
                >
                    <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 text-left"
                        onClick={() => setComingSoonExpanded((open) => !open)}
                        aria-expanded={comingSoonExpanded}
                    >
                        <span className="text-xs font-semibold text-alloy-midnight/50">Coming soon</span>
                        <span className="text-[10px] text-alloy-midnight/35">
                            {comingSoonPacks.length} playbook{comingSoonPacks.length === 1 ? "" : "s"}
                        </span>
                    </button>
                    {comingSoonExpanded ?
                        <ul className="mt-2 space-y-1 border-t border-alloy-stone/10 pt-2">
                            {comingSoonPacks.map((pack) => (
                                <li key={pack.key} className="text-[11px] text-alloy-midnight/45">
                                    {pack.label}
                                </li>
                            ))}
                        </ul>
                    :   null}
                </div>
            :   null}
        </div>
    );
}
