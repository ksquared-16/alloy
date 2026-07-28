"use client";

/**
 * Organization Operational Intelligence product workspace.
 *
 * Collection → selected measurement → focused regions.
 * Does not mount the legacy Calculations / Targets / Sources / Advanced peer rail.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    ConfigurationContext,
    ConfigurationQueue,
    ConfigurationQueueItem,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { OipSettingsProvider, useOipSettings } from "@/app/adminV2/settings/analytics/OipSettingsContext";
import MetricSnapshotButton from "@/app/adminV2/settings/analytics/MetricSnapshotButton";
import MetricBuilderPanel from "@/app/adminV2/settings/analytics/MetricBuilderPanel";
import VisualizationBuilderPanel from "@/app/adminV2/settings/analytics/VisualizationBuilderPanel";
import RollupBuilderPanel from "@/app/adminV2/settings/analytics/RollupBuilderPanel";
import OipVisibilityPanel from "@/app/adminV2/settings/analytics/OipVisibilityPanel";
import { formatKpiTargetHint } from "@/lib/metrics/kpiTargetFormatting";
import { fetchMetricTrends } from "@/lib/metrics/fetchMetricTrends";
import {
    oipHealthStatusChipClass,
    oipHealthStatusLabel,
} from "@/lib/metrics/oipStatusPresentation";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF,
    CANONICAL_ORGANIZATION_SURFACES_HREF,
} from "@/lib/admin/canonicalAdminRoutes";
import type { OipKpiKey } from "@/lib/metrics/types";
import type { OipTargetApiItem } from "@/lib/metrics/fetchOipSettingsSnapshot";
import {
    buildOiMeasurementRows,
    buildOiOverviewStats,
    filterOiMeasurements,
    findOiTarget,
    lifecycleLabel,
    ownershipLabel,
    type OiMeasurementRow,
} from "@/lib/adminV2/settings/operationalIntelligence/oiMeasurementCollection";
import type { OiOrgCalcMeasurement } from "@/lib/metrics/oiOrgCalcMeasurements";
import OiOrgCalcAddWizard from "@/components/adminV2/settings/operationalIntelligence/OiOrgCalcAddWizard";
import OiOrgCalcMeasurementPanel from "@/components/adminV2/settings/operationalIntelligence/OiOrgCalcMeasurementPanel";

type DetailRegion = "overview" | "target" | "history" | "lifecycle" | "provenance";
type WorkspaceChapter = "measurements" | "diagnostics";
type AddFlow = null | "chooser" | "org_calc";

const SURFACES_OI_HREF = `${CANONICAL_ORGANIZATION_SURFACES_HREF}?section=operational-intelligence`;

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

function OverviewStrip({
    stats,
}: {
    stats: ReturnType<typeof buildOiOverviewStats>;
}) {
    const cards = [
        { label: "Active measurements", value: String(stats.activeCount) },
        { label: "Off target", value: String(stats.offTargetCount) },
        { label: "Insufficient data", value: String(stats.insufficientDataCount) },
        { label: "Customized goals", value: String(stats.customizedCount) },
        { label: "Packs in use", value: String(stats.activePackCount) },
    ];
    return (
        <div
            className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
            data-testid="oi-overview-strip"
        >
            {cards.map((card) => (
                <div
                    key={card.label}
                    className="rounded-lg border border-alloy-stone/15 bg-white px-3 py-2"
                    data-testid={`oi-overview-${card.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        {card.label}
                    </p>
                    <p className="mt-0.5 text-lg font-semibold tabular-nums text-alloy-midnight">
                        {card.value}
                    </p>
                </div>
            ))}
        </div>
    );
}

function MeasurementDetail({
    row,
    canEdit,
    region,
    setRegion,
}: {
    row: OiMeasurementRow;
    canEdit: boolean;
    region: DetailRegion;
    setRegion: (r: DetailRegion) => void;
}) {
    const { snapshot, reload } = useOipSettings();
    const target = findOiTarget(snapshot, row.kpiKey);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [trendSummary, setTrendSummary] = useState<string | null>(null);
    const [trendLoading, setTrendLoading] = useState(false);

    useEffect(() => {
        if (target) setDraft(draftFromTarget(target));
    }, [target?.kpi_key, target?.target_display, target?.has_org_override]);

    useEffect(() => {
        let cancelled = false;
        if (region !== "history") return;
        setTrendLoading(true);
        void fetchMetricTrends({ keys: [row.metricKey], window: "rolling_30d", points: 8 }).then(
            (map) => {
                if (cancelled) return;
                const trend = map[row.metricKey];
                if (!trend || !trend.has_trend) {
                    setTrendSummary("No trend snapshots yet for this measurement.");
                } else {
                    const points = trend.sparkline_y?.length ?? 0;
                    setTrendSummary(
                        `${trend.trend_label} · ${points} snapshot points · direction ${trend.direction}.`,
                    );
                }
                setTrendLoading(false);
            },
        );
        return () => {
            cancelled = true;
        };
    }, [region, row.metricKey]);

    const saveTarget = useCallback(async () => {
        if (!canEdit || !target) return;
        setSaving(true);
        setSaveError(null);
        const parsed = Number(draft.trim());
        if (!draft.trim() || Number.isNaN(parsed)) {
            setSaveError("Enter a valid number");
            setSaving(false);
            return;
        }
        let patch: Record<string, unknown> = {};
        if (target.target_kind === "rate_min") {
            const rate = parsed / 100;
            patch = { target_min_rate: rate, healthy_min_rate: rate };
        } else if (target.target_kind === "duration_max_hours") {
            patch = { target_max_hours: parsed, healthy_max_hours: parsed };
        } else if (target.target_kind === "count_max") {
            patch = { target_max_count: parsed, healthy_max_count: parsed };
        }
        try {
            const res = await fetch("/api/admin/metrics/kpi-targets", {
                ...workspaceDataFetchInit(),
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kpi_targets: { [target.kpi_key]: patch } }),
            });
            if (!res.ok) throw new Error("Save failed");
            await reload();
        } catch {
            setSaveError("Unable to save target");
        } finally {
            setSaving(false);
        }
    }, [canEdit, draft, reload, target]);

    const regions: { key: DetailRegion; label: string }[] = [
        { key: "overview", label: "Overview" },
        { key: "target", label: "Target & Health" },
        { key: "history", label: "History" },
        { key: "lifecycle", label: "Lifecycle" },
        { key: "provenance", label: "Provenance" },
    ];

    return (
        <div className="space-y-3" data-testid="oi-measurement-detail" data-measurement={row.id}>
            <div>
                <p className="config-typo-workspace-title">{row.label}</p>
                <p className="config-typo-sublabel mt-0.5">
                    {row.pack.replace(/_/g, " ")} · {ownershipLabel(row.ownership)} ·{" "}
                    {lifecycleLabel(row.lifecycle)}
                </p>
            </div>

            <div className="flex flex-wrap gap-1.5" data-testid="oi-measurement-regions">
                {regions.map((r) => (
                    <button
                        key={r.key}
                        type="button"
                        onClick={() => setRegion(r.key)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                            region === r.key
                                ? "border-alloy-juniper/40 bg-alloy-juniper/10 text-alloy-juniper"
                                : "border-alloy-stone/25 text-alloy-midnight/60"
                        }`}
                        data-testid={`oi-region-${r.key}`}
                    >
                        {r.label}
                    </button>
                ))}
            </div>

            {region === "overview" ?
                <div className="process-config-setup-card space-y-3 p-4" data-testid="oi-region-panel-overview">
                    <p className="text-sm text-alloy-midnight/70">
                        This measurement tracks organization performance for{" "}
                        <span className="font-medium text-alloy-midnight">{row.label}</span>. Goals and
                        health come from the organization target overlay; values resolve through the
                        Operational Intelligence runtime.
                    </p>
                    <dl className="grid gap-2 sm:grid-cols-2">
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Current value
                            </dt>
                            <dd className="text-lg font-semibold tabular-nums">{row.currentDisplay}</dd>
                        </div>
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Goal
                            </dt>
                            <dd className="text-lg font-semibold tabular-nums">{row.targetDisplay}</dd>
                        </div>
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Health
                            </dt>
                            <dd>
                                <span
                                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${oipHealthStatusChipClass(row.health)}`}
                                >
                                    {oipHealthStatusLabel(row.health)}
                                </span>
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Ownership
                            </dt>
                            <dd className="text-sm font-medium">{ownershipLabel(row.ownership)}</dd>
                        </div>
                    </dl>
                    <p className="text-xs text-alloy-midnight/55">
                        Presentation is owned by Surfaces.{" "}
                        <Link
                            href={SURFACES_OI_HREF}
                            className="font-medium text-alloy-bend-pine hover:underline"
                            data-testid="oi-surfaces-handoff"
                        >
                            Manage presentation in Surfaces
                        </Link>
                    </p>
                </div>
            : null}

            {region === "target" ?
                <div className="process-config-setup-card space-y-3 p-4" data-testid="oi-region-panel-target">
                    {!target ?
                        <p className="text-sm text-alloy-midnight/60">No editable target for this measurement.</p>
                    :   <>
                            <p className="text-sm text-alloy-midnight/70">
                                Canonical administrator target authority is the organization KPI overlay.
                                Health uses the same target the workspace evaluates against.
                            </p>
                            <p className="text-[11px] text-alloy-midnight/45">
                                {formatKpiTargetHint(target.kpi_key)}
                            </p>
                            {saveError ?
                                <p className="text-xs text-alloy-ember">{saveError}</p>
                            :   null}
                            <div className="flex flex-wrap items-end gap-2">
                                <label className="text-xs">
                                    <span className="mb-1 block text-alloy-midnight/55">Goal</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        className="w-24 rounded-md border border-alloy-stone/20 px-2 py-1.5 text-sm font-semibold tabular-nums"
                                        value={draft}
                                        disabled={!canEdit}
                                        onChange={(e) => setDraft(e.target.value)}
                                        aria-label={`Target for ${row.label}`}
                                        data-testid="oi-target-input"
                                    />
                                </label>
                                <span className="pb-2 text-[10px] text-alloy-midnight/45">
                                    {target.target_kind === "rate_min" ?
                                        "%"
                                    : target.target_kind === "duration_max_hours" ?
                                        "hours"
                                    :   "max count"}
                                </span>
                                {canEdit ?
                                    <button
                                        type="button"
                                        disabled={saving}
                                        onClick={() => void saveTarget()}
                                        className="rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                        data-testid="oi-target-save"
                                    >
                                        {saving ? "Saving…" : "Save goal"}
                                    </button>
                                :   null}
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <span>
                                    Current:{" "}
                                    <strong className="tabular-nums">{row.currentDisplay}</strong>
                                </span>
                                <span
                                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${oipHealthStatusChipClass(row.health)}`}
                                >
                                    {oipHealthStatusLabel(row.health)}
                                </span>
                            </div>
                        </>
                    }
                </div>
            : null}

            {region === "history" ?
                <div className="process-config-setup-card space-y-2 p-4" data-testid="oi-region-panel-history">
                    <p className="text-sm text-alloy-midnight/70">
                        History uses the canonical Operational Intelligence snapshot and trends path.
                        Snapshot triggering stays in Diagnostics.
                    </p>
                    {trendLoading ?
                        <p className="text-sm text-alloy-midnight/55">Loading history…</p>
                    :   <p className="text-sm text-alloy-midnight" data-testid="oi-history-summary">
                            {trendSummary ?? "—"}
                        </p>
                    }
                </div>
            : null}

            {region === "lifecycle" ?
                <div className="process-config-setup-card space-y-2 p-4" data-testid="oi-region-panel-lifecycle">
                    <p className="text-sm text-alloy-midnight/70">
                        Platform-provided measurements stay available for the organization. Customizing a
                        goal marks ownership as Customized without creating a duplicate collection row.
                    </p>
                    <ul className="list-inside list-disc text-sm text-alloy-midnight/75">
                        <li>Lifecycle: {lifecycleLabel(row.lifecycle)}</li>
                        <li>Ownership: {ownershipLabel(row.ownership)}</li>
                        <li>
                            {row.ownership === "customized" ?
                                "Organization goal override is active."
                            :   "Using platform default goal."}
                        </li>
                    </ul>
                </div>
            : null}

            {region === "provenance" ?
                <div className="process-config-setup-card space-y-2 p-4" data-testid="oi-region-panel-provenance">
                    <p className="text-sm text-alloy-midnight/70">
                        Values resolve from governed Operational Intelligence adapters for this pack.
                        Source authoring is not open-ended — adapters are platform-provided.
                    </p>
                    <dl className="grid gap-2 text-sm">
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Pack / domain
                            </dt>
                            <dd>{row.pack.replace(/_/g, " ")}</dd>
                        </div>
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Cadence
                            </dt>
                            <dd>Live resolve · rolling 30-day window for settings overview</dd>
                        </div>
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Availability
                            </dt>
                            <dd>
                                {row.health === "unknown" ?
                                    "Insufficient data for the current window"
                                :   "Value available"}
                            </dd>
                        </div>
                    </dl>
                    <p className="pt-2 text-xs text-alloy-midnight/55">
                        <Link
                            href={SURFACES_OI_HREF}
                            className="font-medium text-alloy-bend-pine hover:underline"
                        >
                            Manage presentation in Surfaces
                        </Link>
                    </p>
                </div>
            : null}
        </div>
    );
}

function DiagnosticsWorkspace({ canEdit }: { canEdit: boolean }) {
    const [tab, setTab] = useState<"definitions" | "displays" | "rollups" | "snapshots" | "v1">("definitions");
    const items = [
        { key: "definitions" as const, label: "Organization definitions", note: "V2 metric definitions — power-admin path until fully absorbed into Measurements." },
        { key: "displays" as const, label: "Display styles", note: "Default render styles. Card chrome belongs in Surfaces." },
        { key: "rollups" as const, label: "Combined scores", note: "Rollups persist but are not primary workspace surfaces." },
        { key: "snapshots" as const, label: "Snapshot refresh", note: "Platform snapshot trigger for trend backing." },
        { key: "v1" as const, label: "Experience placement (legacy)", note: "Legacy V1 strip placement — migrate via Surfaces." },
    ];
    return (
        <div className="space-y-3" data-testid="oi-diagnostics-workspace">
            <p className="config-typo-sublabel">
                Restricted diagnostics — not the day-to-day Operational Intelligence flow. Placement editing
                belongs in Surfaces.
            </p>
            <div className="flex flex-wrap gap-2">
                {items.map((it) => (
                    <button
                        key={it.key}
                        type="button"
                        onClick={() => setTab(it.key)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                            tab === it.key
                                ? "border-alloy-juniper/40 bg-alloy-juniper/10 text-alloy-juniper"
                                : "border-alloy-stone/25 text-alloy-midnight/60"
                        }`}
                    >
                        {it.label}
                    </button>
                ))}
            </div>
            <p className="config-typo-sublabel">{items.find((i) => i.key === tab)?.note}</p>
            <div>
                {tab === "definitions" ?
                    <MetricBuilderPanel canEdit={canEdit} />
                : tab === "displays" ?
                    <VisualizationBuilderPanel canEdit={canEdit} />
                : tab === "rollups" ?
                    <RollupBuilderPanel canEdit={canEdit} />
                : tab === "snapshots" ?
                    <MetricSnapshotButton />
                :   <OipVisibilityPanel canEdit={canEdit} />}
            </div>
            <p className="text-xs text-alloy-midnight/55">
                Competing placement editors are not part of the primary product.{" "}
                <Link href={SURFACES_OI_HREF} className="font-medium text-alloy-bend-pine hover:underline">
                    Open Surfaces
                </Link>
            </p>
        </div>
    );
}

function OperationalIntelligenceInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { canMutate } = useAdminAuth();
    const { snapshot, loading, error } = useOipSettings();

    const chapterParam = searchParams.get("tab");
    const chapter: WorkspaceChapter =
        chapterParam === "diagnostics" ? "diagnostics" : "measurements";
    const measurementParam = searchParams.get("measurement");
    const orgMeasurementId = searchParams.get("orgMeasurement");
    const regionParam = searchParams.get("region");

    const [query, setQuery] = useState("");
    const [ownershipFilter, setOwnershipFilter] = useState<"all" | "platform" | "customized">("all");
    const [healthFilter, setHealthFilter] = useState<"all" | "off_target" | "healthy" | "insufficient">("all");
    const [addFlow, setAddFlow] = useState<AddFlow>(null);
    const [orgCalcMeasurements, setOrgCalcMeasurements] = useState<OiOrgCalcMeasurement[]>([]);
    const [region, setRegion] = useState<DetailRegion>(() => {
        if (regionParam === "target" || regionParam === "history" || regionParam === "lifecycle" || regionParam === "provenance") {
            return regionParam;
        }
        return "overview";
    });

    const reloadOrgCalcs = useCallback(async () => {
        const res = await fetch("/api/admin/metrics/oi-org-calc-measurements");
        const json = (await res.json()) as { measurements?: OiOrgCalcMeasurement[] };
        if (res.ok) setOrgCalcMeasurements(json.measurements ?? []);
    }, []);

    useEffect(() => {
        void reloadOrgCalcs().catch(() => {
            /* optional until route exists */
        });
    }, [reloadOrgCalcs]);

    const rows = useMemo(() => buildOiMeasurementRows(snapshot), [snapshot]);
    const stats = useMemo(() => {
        const base = buildOiOverviewStats(snapshot);
        const orgActive = orgCalcMeasurements.filter((m) => m.status === "active").length;
        return {
            ...base,
            activeCount: base.activeCount + orgActive,
        };
    }, [snapshot, orgCalcMeasurements]);
    const filtered = useMemo(
        () =>
            filterOiMeasurements(rows, {
                query,
                ownership: ownershipFilter,
                health: healthFilter,
            }),
        [rows, query, ownershipFilter, healthFilter],
    );
    const visibleOrgCalcs = useMemo(() => {
        const q = query.trim().toLowerCase();
        return orgCalcMeasurements.filter((m) => {
            if (m.status === "retired") return false;
            if (!q) return true;
            return (
                m.name.toLowerCase().includes(q)
                || m.source.calculation_name.toLowerCase().includes(q)
            );
        });
    }, [orgCalcMeasurements, query]);

    const selectedId = orgMeasurementId
        ? null
        : ((measurementParam as OipKpiKey | null) ?? filtered[0]?.id ?? null);
    const selected = selectedId
        ? (filtered.find((r) => r.id === selectedId) ?? rows.find((r) => r.id === selectedId) ?? null)
        : null;

    const setParams = (patch: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString());
        for (const [key, value] of Object.entries(patch)) {
            if (value == null || value === "") params.delete(key);
            else params.set(key, value);
        }
        const q = params.toString();
        router.replace(
            q ?
                `${CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF}?${q}`
            :   CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF,
        );
    };

    const selectMeasurement = (id: string) => {
        setParams({ measurement: id, orgMeasurement: null, tab: null });
    };

    const selectOrgCalc = (id: string) => {
        setParams({ orgMeasurement: id, measurement: null, tab: null });
    };

    const openChapter = (next: WorkspaceChapter) => {
        if (next === "diagnostics") {
            setParams({ tab: "diagnostics", measurement: null, orgMeasurement: null });
        } else {
            setParams({ tab: null });
        }
    };

    return (
        <div
            className="process-config-page min-h-0 flex-1"
            data-testid="operational-intelligence-organization-product"
            data-adminv2-operational-intelligence="true"
        >
            <ConfigurationContext
                title="Operational Intelligence"
                titleIcon={<Activity className="h-5 w-5" strokeWidth={2} />}
                subtitle="What this organization measures, against which goals, with what health, lifecycle, and history."
                testId="oi-configuration-context"
                actions={
                    chapter === "measurements" && canMutate ?
                        <button
                            type="button"
                            onClick={() => setAddFlow("chooser")}
                            className="rounded-md border border-alloy-juniper/30 bg-alloy-juniper/10 px-2.5 py-1.5 text-xs font-semibold text-alloy-juniper"
                            data-testid="oi-add-measurement"
                        >
                            Add measurement
                        </button>
                    :   null
                }
            />

            {error && !snapshot ?
                <p className="mb-2 text-sm text-alloy-ember" data-testid="oi-load-error">
                    {error}
                </p>
            : null}
            {loading && !snapshot ?
                <p className="mb-2 text-xs text-alloy-midnight/50">Loading platform measurements…</p>
            : null}
            <>
                    {chapter === "measurements" ?
                        <OverviewStrip stats={stats} />
                    :   null}

                    <ConfigurationShell
                        testId="operational-intelligence-shell"
                        queueColumn={
                            <ConfigurationQueue
                                title={chapter === "diagnostics" ? "Diagnostics" : "Measurements"}
                                summary={
                                    chapter === "diagnostics" ?
                                        "Secondary platform internals"
                                    :   "Search · filter · select a measurement"
                                }
                            >
                                <div className="mb-2 flex flex-wrap gap-1 px-1">
                                    <button
                                        type="button"
                                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                            chapter === "measurements"
                                                ? "bg-alloy-juniper/15 text-alloy-juniper"
                                                : "text-alloy-midnight/50"
                                        }`}
                                        onClick={() => openChapter("measurements")}
                                        data-testid="oi-chapter-measurements"
                                    >
                                        Measurements
                                    </button>
                                    <button
                                        type="button"
                                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                            chapter === "diagnostics"
                                                ? "bg-alloy-juniper/15 text-alloy-juniper"
                                                : "text-alloy-midnight/50"
                                        }`}
                                        onClick={() => openChapter("diagnostics")}
                                        data-testid="oi-chapter-diagnostics"
                                    >
                                        Diagnostics
                                    </button>
                                </div>

                                {chapter === "measurements" ?
                                    <>
                                        <div className="mb-2 space-y-1.5 px-1">
                                            <input
                                                type="search"
                                                placeholder="Search measurements"
                                                value={query}
                                                onChange={(e) => setQuery(e.target.value)}
                                                className="w-full rounded-md border border-alloy-stone/20 px-2 py-1.5 text-xs"
                                                data-testid="oi-measurement-search"
                                            />
                                            <div className="flex flex-wrap gap-1">
                                                {(
                                                    [
                                                        ["all", "All"],
                                                        ["platform", "Platform"],
                                                        ["customized", "Customized"],
                                                    ] as const
                                                ).map(([key, label]) => (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        onClick={() => setOwnershipFilter(key)}
                                                        className={`rounded-full border px-2 py-0.5 text-[10px] ${
                                                            ownershipFilter === key
                                                                ? "border-alloy-juniper/40 bg-alloy-juniper/10 text-alloy-juniper"
                                                                : "border-alloy-stone/20 text-alloy-midnight/55"
                                                        }`}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {(
                                                    [
                                                        ["all", "Any health"],
                                                        ["off_target", "Off target"],
                                                        ["healthy", "Healthy"],
                                                        ["insufficient", "No data"],
                                                    ] as const
                                                ).map(([key, label]) => (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        onClick={() => setHealthFilter(key)}
                                                        className={`rounded-full border px-2 py-0.5 text-[10px] ${
                                                            healthFilter === key
                                                                ? "border-alloy-juniper/40 bg-alloy-juniper/10 text-alloy-juniper"
                                                                : "border-alloy-stone/20 text-alloy-midnight/55"
                                                        }`}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {visibleOrgCalcs.map((m) => (
                                            <ConfigurationQueueItem
                                                key={m.id}
                                                active={orgMeasurementId === m.id}
                                                title={m.name}
                                                subtitle={`Organization calculation · v${m.source.version_number} · seats`}
                                                onClick={() => selectOrgCalc(m.id)}
                                                testId={`oi-org-calc-row-${m.id}`}
                                            />
                                        ))}
                                        {filtered.length === 0 && visibleOrgCalcs.length === 0 ?
                                            <p className="px-2 text-xs text-alloy-midnight/50">
                                                No measurements match these filters.
                                            </p>
                                        :   filtered.map((row) => (
                                                <ConfigurationQueueItem
                                                    key={row.id}
                                                    active={selected?.id === row.id && !orgMeasurementId}
                                                    title={row.label}
                                                    subtitle={`${ownershipLabel(row.ownership)} · ${row.currentDisplay} · ${oipHealthStatusLabel(row.health)}`}
                                                    onClick={() => selectMeasurement(row.id)}
                                                    testId={`oi-measurement-${row.id}`}
                                                />
                                            ))
                                        }
                                    </>
                                :   <p className="px-2 text-xs text-alloy-midnight/50">
                                        Use the workspace for diagnostic tools. Placement stays in Surfaces.
                                    </p>
                                }
                            </ConfigurationQueue>
                        }
                    >
                        {chapter === "diagnostics" ?
                            <DiagnosticsWorkspace canEdit={canMutate} />
                        : orgMeasurementId ?
                            <OiOrgCalcMeasurementPanel measurementId={orgMeasurementId} />
                        : selected ?
                            <MeasurementDetail
                                row={selected}
                                canEdit={canMutate}
                                region={region}
                                setRegion={setRegion}
                            />
                        :   <div className="process-config-setup-card p-5">
                                <p className="config-typo-workspace-title">Select a measurement</p>
                                <p className="config-typo-sublabel mt-1">
                                    Choose a measurement to review its goal, health, history, and provenance.
                                    Or add a calculation-backed measurement such as Future Room Capacity.
                                </p>
                            </div>
                        }
                    </ConfigurationShell>
            </>

            {addFlow === "chooser" ?
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
                    data-testid="oi-add-source-chooser"
                >
                    <div className="w-full max-w-md rounded-xl border border-alloy-stone/20 bg-white p-5 shadow-lg">
                        <h2 className="text-sm font-semibold text-alloy-midnight">Add measurement</h2>
                        <p className="mt-1 text-xs text-alloy-midnight/60">
                            Choose a source that already works. Only organization calculations are available
                            in this slice.
                        </p>
                        <button
                            type="button"
                            className="mt-4 w-full rounded-lg border border-alloy-juniper/30 bg-alloy-juniper/5 px-3 py-3 text-left"
                            onClick={() => setAddFlow("org_calc")}
                            data-testid="oi-add-source-org-calc"
                        >
                            <p className="text-sm font-semibold text-alloy-midnight">Organization calculation</p>
                            <p className="mt-0.5 text-xs text-alloy-midnight/55">
                                Bind an exact published calculation version — for example Future Room Capacity.
                            </p>
                        </button>
                        <button
                            type="button"
                            className="mt-3 text-xs font-semibold text-alloy-midnight/55 hover:underline"
                            onClick={() => setAddFlow(null)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            : null}

            {addFlow === "org_calc" ?
                <OiOrgCalcAddWizard
                    busy={false}
                    onClose={() => setAddFlow(null)}
                    onCreated={(id) => {
                        setAddFlow(null);
                        void reloadOrgCalcs();
                        selectOrgCalc(id);
                    }}
                />
            : null}
        </div>
    );
}

export default function OperationalIntelligenceWorkspace() {
    return (
        <OipSettingsProvider>
            <OperationalIntelligenceInner />
        </OipSettingsProvider>
    );
}
