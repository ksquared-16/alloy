"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { formatKpiTargetHint } from "@/lib/metrics/kpiTargetFormatting";
import type { OipKpiKey } from "@/lib/metrics/types";

type TargetItem = {
    kpi_key: OipKpiKey;
    label: string;
    metric_key: string;
    pack: string;
    target_kind: string;
    target_display: string;
    target: {
        target_max_hours: number | null;
        target_min_rate: number | null;
        target_max_count: number | null;
    };
    has_org_override: boolean;
};

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

export default function KpiTargetsPanel({ canEdit }: { canEdit: boolean }) {
    const [items, setItems] = useState<TargetItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [savingKey, setSavingKey] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/metrics/kpi-targets", workspaceDataFetchInit());
            if (!res.ok) throw new Error("Unable to load KPI targets");
            const data = (await res.json()) as { items: TargetItem[] };
            setItems(data.items ?? []);
            const nextDrafts: Record<string, string> = {};
            for (const item of data.items ?? []) {
                nextDrafts[item.kpi_key] = item.target_display.replace(/[%h≤ ]/g, "").trim();
                if (item.target_kind === "rate_min") {
                    const rate = item.target.target_min_rate;
                    nextDrafts[item.kpi_key] = rate != null ? String(Math.round(rate * 100)) : "";
                } else if (item.target_kind === "duration_max_hours") {
                    nextDrafts[item.kpi_key] = item.target.target_max_hours != null ? String(item.target.target_max_hours) : "";
                } else if (item.target_kind === "count_max") {
                    nextDrafts[item.kpi_key] = item.target.target_max_count != null ? String(item.target.target_max_count) : "";
                }
            }
            setDrafts(nextDrafts);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to load KPI targets");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const saveTarget = async (item: TargetItem) => {
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
            const data = (await res.json()) as { items: TargetItem[] };
            setItems(data.items ?? []);
        } catch {
            setSaveError("Unable to save target");
        } finally {
            setSavingKey(null);
        }
    };

    if (loading) {
        return <p className="text-sm text-alloy-midnight/55">Loading KPI targets…</p>;
    }

    if (error) {
        return <p className="text-sm text-alloy-ember">{error}</p>;
    }

    const byPack = items.reduce<Record<string, TargetItem[]>>((acc, item) => {
        const pack = item.pack.replace(/_/g, " ");
        if (!acc[pack]) acc[pack] = [];
        acc[pack].push(item);
        return acc;
    }, {});

    return (
        <div className="space-y-4" data-testid="kpi-targets-panel">
            <SettingsSection
                title="Org KPI targets"
                description="Targets drive health status on workspace strips, work units, and the Analytics modal. Defaults apply until you save an org override."
            >
                {saveError ?
                    <p className="text-xs text-alloy-ember">{saveError}</p>
                :   null}
                <div className="space-y-5">
                    {Object.entries(byPack).map(([pack, packItems]) => (
                        <div key={pack}>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">{pack}</div>
                            <ul className="mt-2 divide-y divide-alloy-forge/8 rounded-lg border border-alloy-forge/10">
                                {packItems.map((item) => (
                                    <li key={item.kpi_key} className="flex flex-wrap items-center gap-3 px-3 py-3">
                                        <div className="min-w-[10rem] flex-1">
                                            <div className="text-sm font-medium text-alloy-midnight">{item.label}</div>
                                            <div className="text-[11px] text-alloy-midnight/45">{formatKpiTargetHint(item.kpi_key)}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {canEdit ?
                                                <>
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        className="w-20 rounded-md border border-alloy-forge/20 px-2 py-1 text-sm"
                                                        value={drafts[item.kpi_key] ?? ""}
                                                        onChange={(e) =>
                                                            setDrafts((d) => ({ ...d, [item.kpi_key]: e.target.value }))
                                                        }
                                                        aria-label={`Target for ${item.label}`}
                                                    />
                                                    <span className="text-xs text-alloy-midnight/45">
                                                        {item.target_kind === "rate_min" ? "%" : item.target_kind === "duration_max_hours" ? "h" : "max"}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        disabled={savingKey === item.kpi_key}
                                                        onClick={() => void saveTarget(item)}
                                                        className="rounded-md bg-alloy-pine px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                                                    >
                                                        {savingKey === item.kpi_key ? "Saving…" : "Save"}
                                                    </button>
                                                </>
                                            :   <span className="text-sm font-semibold tabular-nums text-alloy-midnight">
                                                    {item.target_display}
                                                </span>
                                            }
                                            {item.has_org_override ?
                                                <span className="rounded-full bg-alloy-pine/10 px-2 py-0.5 text-[10px] font-medium text-alloy-pine">
                                                    Custom
                                                </span>
                                            :   null}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </SettingsSection>
            <p className="text-[11px] text-alloy-midnight/45">
                To change which metrics appear on workspace surfaces, use{" "}
                <Link href="/admin/settings/kpis" className="font-medium text-alloy-pine hover:underline">
                    Workspace metrics
                </Link>
                .
            </p>
        </div>
    );
}
