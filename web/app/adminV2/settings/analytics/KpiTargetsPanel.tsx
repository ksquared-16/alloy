"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { formatKpiTargetHint } from "@/lib/metrics/kpiTargetFormatting";
import type { OipTargetApiItem } from "@/lib/metrics/fetchOipSettingsSnapshot";
import { useOipSettings } from "@/app/adminV2/settings/analytics/OipSettingsContext";
import { OipSectionCard } from "@/app/adminV2/analytics/oipWorkspaceUi";
import {
    oipHealthStatusChipClass,
    oipHealthStatusLabel,
} from "@/lib/metrics/oipStatusPresentation";

function draftFromTarget(item: OipTargetApiItem): string {
    if (item.target_kind === "rate_min") {
        const rate = item.target.target_min_rate;
        return rate != null ? String(Math.round(rate * 100)) : "";
    }
    if (item.target_kind === "duration_max_hours") {
        return item.target.target_max_hours != null ? String(item.target.target_max_hours) : "";
    }
    if (item.target_kind === "count_max") {
        return item.target.target_max_count != null ? String(item.target.target_max_count) : "";
    }
    return item.target_display.replace(/[%h≤ ]/g, "").trim();
}

export default function KpiTargetsPanel({ canEdit }: { canEdit: boolean }) {
    const { snapshot, loading, error, reload } = useOipSettings();
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [savingKey, setSavingKey] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    const items = snapshot?.targets ?? [];

    useEffect(() => {
        if (!snapshot) return;
        const nextDrafts: Record<string, string> = {};
        for (const item of snapshot.targets) {
            nextDrafts[item.kpi_key] = draftFromTarget(item);
        }
        setDrafts(nextDrafts);
    }, [snapshot]);

    const saveTarget = useCallback(
        async (item: OipTargetApiItem) => {
            if (!canEdit) return;
            setSavingKey(item.kpi_key);
            setSaveError(null);
            const raw = drafts[item.kpi_key]?.trim() ?? "";
            const parsed = Number(raw);
            if (!raw || Number.isNaN(parsed)) {
                setSaveError("Enter a valid number");
                setSavingKey(null);
                return;
            }

            let patch: Record<string, unknown> = {};
            if (item.target_kind === "rate_min") {
                const rate = parsed / 100;
                patch = { target_min_rate: rate, healthy_min_rate: rate };
            } else if (item.target_kind === "duration_max_hours") {
                patch = { target_max_hours: parsed, healthy_max_hours: parsed };
            } else if (item.target_kind === "count_max") {
                patch = { target_max_count: parsed, healthy_max_count: parsed };
            }

            try {
                const res = await fetch("/api/admin/metrics/kpi-targets", {
                    ...workspaceDataFetchInit(),
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ kpi_targets: { [item.kpi_key]: patch } }),
                });
                if (!res.ok) throw new Error("Save failed");
                await reload();
            } catch {
                setSaveError("Unable to save target");
            } finally {
                setSavingKey(null);
            }
        },
        [canEdit, drafts, reload]
    );

    if (loading && !snapshot) {
        return <p className="text-sm text-alloy-midnight/55">Loading targets…</p>;
    }

    if (error && !snapshot) {
        return <p className="text-sm text-alloy-ember">{error}</p>;
    }

    const byPack = items.reduce<Record<string, typeof items>>((acc, item) => {
        const pack = item.pack.replace(/_/g, " ");
        if (!acc[pack]) acc[pack] = [];
        acc[pack].push(item);
        return acc;
    }, {});

    return (
        <div className="space-y-4" data-testid="kpi-targets-panel">
            <OipSectionCard
                title="Goals & current performance"
                helper="Live results against the goals you set. Adjust a goal to change what success looks like."
            >
                {saveError ?
                    <p className="text-xs text-alloy-ember">{saveError}</p>
                :   null}
                <div className="space-y-5">
                    {Object.entries(byPack).map(([pack, packItems]) => (
                        <div key={pack}>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                {pack}
                            </div>
                            <div className="mt-2 overflow-x-auto rounded-lg border border-alloy-stone/15">
                                <table className="w-full min-w-[36rem] text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-alloy-stone/12 bg-alloy-stone/[0.03] text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                            <th className="px-3 py-2">Indicator</th>
                                            <th className="px-3 py-2 text-right">Goal</th>
                                            <th className="px-3 py-2 text-right">Current</th>
                                            <th className="px-3 py-2 text-center">Status</th>
                                            {canEdit ?
                                                <th className="px-3 py-2 text-right">Change target</th>
                                            :   null}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {packItems.map((item) => {
                                            const row = snapshot?.kpi_rows.find((r) => r.kpi_key === item.kpi_key);
                                            return (
                                                <tr key={item.kpi_key} className="border-b border-alloy-stone/8">
                                                    <td className="px-3 py-3">
                                                        <div className="font-semibold text-alloy-midnight">{item.label}</div>
                                                        <div className="text-[10px] text-alloy-midnight/45">
                                                            {formatKpiTargetHint(item.kpi_key)}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-alloy-midnight/75">
                                                        {item.target_display}
                                                    </td>
                                                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-alloy-midnight">
                                                        {row?.current_display ?? "—"}
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span
                                                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${oipHealthStatusChipClass(row?.status ?? "unknown")}`}
                                                        >
                                                            {oipHealthStatusLabel(row?.status ?? "unknown")}
                                                        </span>
                                                    </td>
                                                    {canEdit ?
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <input
                                                                    type="text"
                                                                    inputMode="decimal"
                                                                    className="w-16 rounded-md border border-alloy-stone/20 px-2 py-1 text-sm font-semibold tabular-nums"
                                                                    value={drafts[item.kpi_key] ?? ""}
                                                                    onChange={(e) =>
                                                                        setDrafts((d) => ({
                                                                            ...d,
                                                                            [item.kpi_key]: e.target.value,
                                                                        }))
                                                                    }
                                                                    aria-label={`New target for ${item.label}`}
                                                                />
                                                                <span className="text-[10px] text-alloy-midnight/45">
                                                                    {item.target_kind === "rate_min" ?
                                                                        "%"
                                                                    : item.target_kind === "duration_max_hours" ?
                                                                        "h"
                                                                    :   "max"}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    disabled={savingKey === item.kpi_key}
                                                                    onClick={() => void saveTarget(item)}
                                                                    className="rounded-md bg-alloy-pine px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                                                                >
                                                                    {savingKey === item.kpi_key ? "…" : "Save"}
                                                                </button>
                                                                {item.has_org_override ?
                                                                    <span className="rounded-full bg-alloy-pine/10 px-1.5 py-0.5 text-[9px] font-medium text-alloy-pine">
                                                                        Custom
                                                                    </span>
                                                                :   null}
                                                            </div>
                                                        </td>
                                                    :   null}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            </OipSectionCard>
            <p className="text-[11px] text-alloy-midnight/45">
                To change where indicators appear, open{" "}
                <Link href="/admin/settings/analytics?tab=visibility" className="font-medium text-alloy-pine hover:underline">
                    Experience placement
                </Link>
                .
            </p>
        </div>
    );
}
