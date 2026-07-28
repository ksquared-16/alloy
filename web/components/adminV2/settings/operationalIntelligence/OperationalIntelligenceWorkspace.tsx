"use client";

/**
 * Operational Intelligence V2 — measurements-first product workspace.
 * Charter: PRODUCT-REALIZATION-MEASUREMENTS-FIRST.md
 * Architecture unchanged; entry point and language redesigned.
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
    isOffTrackStatus,
    oipHealthStatusChipClass,
    oipHealthStatusLabel,
} from "@/lib/metrics/oipStatusPresentation";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF,
    CANONICAL_ORGANIZATION_SURFACES_HREF,
    organizationCalculationLibraryHref,
} from "@/lib/admin/canonicalAdminRoutes";
import type { OipKpiKey } from "@/lib/metrics/types";
import type { OipTargetApiItem } from "@/lib/metrics/fetchOipSettingsSnapshot";
import {
    buildOiMeasurementRows,
    filterOiMeasurements,
    findOiTarget,
    ownershipLabel,
    type OiMeasurementRow,
} from "@/lib/adminV2/settings/operationalIntelligence/oiMeasurementCollection";
import { capacityRecipeFromProductTypeLabel } from "@/lib/adminV2/settings/operationalIntelligence/oiCapacityRecipeCopy";
import type { OiOrgCalcMeasurement } from "@/lib/metrics/oiOrgCalcMeasurements";
import OiFutureRoomCapacityBuilder from "@/components/adminV2/settings/operationalIntelligence/OiFutureRoomCapacityBuilder";
import OiRoomUtilizationBuilder from "@/components/adminV2/settings/operationalIntelligence/OiRoomUtilizationBuilder";
import OiOrgCalcMeasurementPanel from "@/components/adminV2/settings/operationalIntelligence/OiOrgCalcMeasurementPanel";
import OrganizationCalculationsWorkspace from "@/components/adminV2/settings/organizationCalculations/OrganizationCalculationsWorkspace";
import { findFutureRoomCapacityMeasurement } from "@/lib/operationalQuestions/answerFutureRoomCapacity";
import { findRoomUtilizationMeasurement } from "@/lib/operationalQuestions/answerRoomUtilization";
import {
    FUTURE_ROOM_CAPACITY_QUESTION_KEY,
    ROOM_UTILIZATION_QUESTION_KEY,
    ROOM_UTILIZATION_FTE_QUESTION_KEY,
    EQUIVALENT_CHILD_COUNT_QUESTION_KEY,
} from "@/lib/operationalQuestions/catalog";
import { findMeasurementByQuestionKey } from "@/lib/operationalQuestions/answerMeasureQuestion";
import { formatOiOrgCalcTargetLabel } from "@/lib/metrics/oiOrgCalcTargetFormat";

type DetailRegion = "overview" | "target" | "history" | "lifecycle" | "provenance";
type WorkspaceView = "questions" | "measurements" | "calculations" | "advanced" | "builder";

const OI_PRODUCT_TABS: Array<{ key: "questions" | "measurements" | "calculations"; label: string }> = [
    { key: "questions", label: "Questions" },
    { key: "measurements", label: "Measurements" },
    { key: "calculations", label: "Calculation Library" },
];

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
                    setTrendSummary("No history snapshots yet for this measurement.");
                } else {
                    const points = trend.sparkline_y?.length ?? 0;
                    setTrendSummary(
                        `${trend.trend_label} · ${points} points · direction ${trend.direction}.`,
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
            setSaveError("Unable to save goal");
        } finally {
            setSaving(false);
        }
    }, [canEdit, draft, reload, target]);

    const regions: { key: DetailRegion; label: string }[] = [
        { key: "overview", label: "Overview" },
        { key: "target", label: "Goal" },
        { key: "history", label: "History" },
        { key: "lifecycle", label: "Availability" },
        { key: "provenance", label: "How it’s measured" },
    ];

    return (
        <div className="space-y-3" data-testid="oi-measurement-detail" data-measurement={row.id}>
            <div>
                <p className="config-typo-workspace-title">{row.label}</p>
                <p className="config-typo-sublabel mt-0.5">
                    {ownershipLabel(row.ownership)} · Current {row.currentDisplay} · Goal {row.targetDisplay}
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
                    <dl className="grid gap-2 sm:grid-cols-2">
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Current answer
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
                    </dl>
                    <p className="text-xs text-alloy-midnight/55">
                        Presentation is owned by Surfaces.{" "}
                        <Link href={SURFACES_OI_HREF} className="font-medium text-alloy-bend-pine hover:underline">
                            Manage presentation in Surfaces
                        </Link>
                    </p>
                </div>
            : null}

            {region === "target" ?
                <div className="process-config-setup-card space-y-3 p-4" data-testid="oi-region-panel-target">
                    {!target ?
                        <p className="text-sm text-alloy-midnight/60">No editable goal for this measurement.</p>
                    :   <>
                            <p className="text-[11px] text-alloy-midnight/45">{formatKpiTargetHint(target.kpi_key)}</p>
                            {saveError ? <p className="text-xs text-alloy-ember">{saveError}</p> : null}
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
                                    />
                                </label>
                                <button
                                    type="button"
                                    disabled={!canEdit || saving}
                                    onClick={() => void saveTarget()}
                                    className="rounded-md bg-alloy-juniper px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                >
                                    {saving ? "Saving…" : "Save goal"}
                                </button>
                            </div>
                        </>
                    }
                </div>
            : null}

            {region === "history" ?
                <div className="process-config-setup-card space-y-2 p-4" data-testid="oi-region-panel-history">
                    {trendLoading ?
                        <p className="text-sm text-alloy-midnight/55">Loading history…</p>
                    :   <p className="text-sm text-alloy-midnight/70">{trendSummary}</p>}
                </div>
            : null}

            {region === "lifecycle" ?
                <div className="process-config-setup-card space-y-2 p-4" data-testid="oi-region-panel-lifecycle">
                    <p className="text-sm text-alloy-midnight/70">
                        Platform measurements stay available for the organization. Customizing a goal does not change
                        how the answer is calculated.
                    </p>
                </div>
            : null}

            {region === "provenance" ?
                <div className="process-config-setup-card space-y-2 p-4" data-testid="oi-region-panel-provenance">
                    <p className="text-sm text-alloy-midnight/70">
                        This measurement uses Alloy’s built-in enrollment and operations answers. Presentation cards
                        live in Surfaces.
                    </p>
                </div>
            : null}
        </div>
    );
}

function AdvancedInternals({ canEdit }: { canEdit: boolean }) {
    const [tab, setTab] = useState<"definitions" | "displays" | "rollups" | "snapshots" | "v1">("definitions");
    const items = [
        { key: "definitions" as const, label: "Organization definitions" },
        { key: "displays" as const, label: "Display styles" },
        { key: "rollups" as const, label: "Combined scores" },
        { key: "snapshots" as const, label: "Snapshot refresh" },
        { key: "v1" as const, label: "Experience placement (legacy)" },
    ];
    return (
        <div className="space-y-3" data-testid="oi-diagnostics-workspace">
            <p className="config-typo-sublabel">
                Advanced platform tools — not the day-to-day measurement flow.
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
        </div>
    );
}

function questionCta(state: "start" | "measuring" | "needs_setup" | "needs_attention"): string {
    return state === "measuring" || state === "needs_attention" ? "View answer" : "Start measuring";
}

function QuestionRow({
    title,
    question,
    cta,
    onClick,
    testId,
}: {
    title: string;
    question: string;
    cta: string;
    onClick: () => void;
    testId: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#00a283]/30 bg-[#00a283]/5 px-3 py-2.5 text-left"
            data-testid={testId}
        >
            <div className="min-w-0">
                <p className="text-[13px] font-semibold text-alloy-midnight">{title}</p>
                <p className="mt-0.5 text-[11px] text-alloy-midnight/55">{question}</p>
            </div>
            <span className="shrink-0 rounded border border-[#00a283]/35 bg-white px-2 py-0.5 text-[10px] font-semibold text-[#007d68]">
                {cta}
            </span>
        </button>
    );
}

function DomainHome({
    activeMeasurements,
    needsAttentionCount,
    canMutate,
    onOpenMeasurements,
    futureRoomCapacityState,
    onOpenFutureRoomCapacity,
    roomUtilizationState,
    onOpenRoomUtilization,
    roomUtilizationFteState,
    onOpenRoomUtilizationFte,
    equivalentChildCountState,
    onOpenEquivalentChildCount,
    onSelectMeasurement,
}: {
    activeMeasurements: OiOrgCalcMeasurement[];
    needsAttentionCount: number;
    canMutate: boolean;
    onOpenMeasurements: () => void;
    futureRoomCapacityState: "start" | "measuring" | "needs_setup" | "needs_attention";
    onOpenFutureRoomCapacity: () => void;
    roomUtilizationState: "start" | "measuring" | "needs_setup" | "needs_attention";
    onOpenRoomUtilization: () => void;
    roomUtilizationFteState: "start" | "measuring" | "needs_setup" | "needs_attention";
    onOpenRoomUtilizationFte: () => void;
    equivalentChildCountState: "start" | "measuring" | "needs_setup" | "needs_attention";
    onOpenEquivalentChildCount: () => void;
    onSelectMeasurement: (id: string) => void;
}) {
    return (
        <div className="space-y-3" data-testid="oi-domain-home">
            <div className="process-config-setup-card p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/40">
                    Operational Intelligence
                </p>
                <h2 className="config-typo-workspace-title mt-1 text-xl text-alloy-midnight">
                    What do you want to know?
                </h2>
                <p className="config-typo-sublabel mt-1 max-w-2xl">
                    Choose a question, configure how it is determined, and start measuring.
                </p>
            </div>

            <div className="process-config-setup-card p-4" data-testid="oi-question-catalog">
                <p className="config-typo-queue-section-label">Capacity</p>
                <div className="mt-2 space-y-1.5">
                    <QuestionRow
                        title="Future Room Capacity"
                        question="How many seats will a room have on a future date?"
                        cta={questionCta(futureRoomCapacityState)}
                        onClick={onOpenFutureRoomCapacity}
                        testId="oi-question-future-room-capacity"
                    />
                    <QuestionRow
                        title="Room Utilization"
                        question="How full is a room compared with its usable seats?"
                        cta={questionCta(roomUtilizationState)}
                        onClick={onOpenRoomUtilization}
                        testId="oi-question-room-utilization"
                    />
                    <QuestionRow
                        title="Room Utilization (FTE)"
                        question="How full using full-time equivalent children?"
                        cta={questionCta(roomUtilizationFteState)}
                        onClick={onOpenRoomUtilizationFte}
                        testId="oi-question-room-utilization-fte"
                    />
                </div>
                <p className="config-typo-queue-section-label mt-3">Population</p>
                <div className="mt-2 space-y-1.5">
                    <QuestionRow
                        title="Equivalent Child Count"
                        question="How many equivalent children are expected in this room?"
                        cta={questionCta(equivalentChildCountState)}
                        onClick={onOpenEquivalentChildCount}
                        testId="oi-question-equivalent-child-count"
                    />
                </div>
            </div>

            <div className="process-config-setup-card p-4" data-testid="oi-home-measuring-now">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <p className="config-typo-queue-section-label">What we are measuring</p>
                        <p className="config-typo-sublabel mt-0.5">
                            Active measurements
                            {needsAttentionCount > 0 ? ` · ${needsAttentionCount} need attention` : ""}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onOpenMeasurements}
                        className="rounded-md border border-alloy-stone/25 bg-white px-2.5 py-1 text-[11px] font-semibold text-alloy-midnight"
                        data-testid="oi-home-view-measurements"
                    >
                        Browse all
                    </button>
                </div>
                {activeMeasurements.length === 0 ?
                    <p className="mt-2 text-sm text-alloy-midnight/55" data-testid="oi-home-no-measurements">
                        Nothing is being measured yet.
                        {canMutate ? " Start with a question above." : ""}
                    </p>
                :   <ul className="mt-2 divide-y divide-alloy-stone/15">
                        {activeMeasurements.map((m) => {
                            const goal = formatOiOrgCalcTargetLabel(m.target, m.unit);
                            const unitLabel =
                                m.unit === "percent" ? "percent"
                                : m.unit === "children" ? "children"
                                : "seats";
                            return (
                                <li key={m.id}>
                                    <button
                                        type="button"
                                        onClick={() => onSelectMeasurement(m.id)}
                                        className="flex min-h-[3.25rem] w-full items-center justify-between gap-2 py-2.5 text-left hover:bg-alloy-stone/[0.04]"
                                        data-testid={`oi-home-measurement-${m.id}`}
                                    >
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-semibold text-alloy-midnight">{m.name}</p>
                                            <p className="text-[11px] text-alloy-midnight/55">
                                                {goal} · {unitLabel}
                                            </p>
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                }
            </div>
        </div>
    );
}

function OperationalIntelligenceInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { canMutate } = useAdminAuth();
    const { snapshot, loading, error } = useOipSettings();

    const viewParam = searchParams.get("view");
    const tabParam = searchParams.get("tab");
    const measurementParam = searchParams.get("measurement");
    const orgMeasurementId = searchParams.get("orgMeasurement");
    const regionParam = searchParams.get("region");
    const justActivated = searchParams.get("activated") === "1";
    const addParam = searchParams.get("add") === "1";
    const questionParam = searchParams.get("question");

    const [query, setQuery] = useState("");
    const [healthFilter, setHealthFilter] = useState<"all" | "off_target" | "healthy" | "insufficient">("all");
    const [addOpen, setAddOpen] = useState(addParam);
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
        void reloadOrgCalcs().catch(() => undefined);
    }, [reloadOrgCalcs]);

    const frcMeasurement = findFutureRoomCapacityMeasurement(orgCalcMeasurements);
    const roomUtilMeasurement = findRoomUtilizationMeasurement(orgCalcMeasurements);
    const roomUtilFteMeasurement = findMeasurementByQuestionKey(
        orgCalcMeasurements,
        ROOM_UTILIZATION_FTE_QUESTION_KEY,
    );
    const equivalentChildMeasurement = findMeasurementByQuestionKey(
        orgCalcMeasurements,
        EQUIVALENT_CHILD_COUNT_QUESTION_KEY,
    );
    const activeOrgCalcs = orgCalcMeasurements.filter((m) => m.status === "active");

    const builderQuestion =
        questionParam === ROOM_UTILIZATION_QUESTION_KEY ?
            ROOM_UTILIZATION_QUESTION_KEY
        :   FUTURE_ROOM_CAPACITY_QUESTION_KEY;

    const view: WorkspaceView =
        tabParam === "diagnostics" || viewParam === "advanced" ? "advanced"
        : addOpen && !orgMeasurementId ? "builder"
        : viewParam === "calculations" ? "calculations"
        : viewParam === "measurements" || measurementParam || orgMeasurementId ? "measurements"
        : "questions";

    const rows = useMemo(() => buildOiMeasurementRows(snapshot), [snapshot]);
    const filtered = useMemo(
        () =>
            filterOiMeasurements(rows, {
                query,
                ownership: "all",
                health: healthFilter,
            }),
        [rows, query, healthFilter],
    );
    const visibleOrgCalcs = useMemo(() => {
        const q = query.trim().toLowerCase();
        return orgCalcMeasurements.filter((m) => {
            if (m.status === "retired") return false;
            if (!q) return true;
            return m.name.toLowerCase().includes(q) || m.source.calculation_name.toLowerCase().includes(q);
        });
    }, [orgCalcMeasurements, query]);

    const attentionCount = rows.filter(
        (r) => isOffTrackStatus(r.health) || r.health === "unknown",
    ).length;

    const selectedId = orgMeasurementId
        ? null
        : ((measurementParam as OipKpiKey | null) ?? null);
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
        setParams({ measurement: id, orgMeasurement: null, view: "measurements", tab: null, activated: null });
    };

    const selectOrgCalc = (id: string, opts?: { activated?: boolean }) => {
        setAddOpen(false);
        setParams({
            orgMeasurement: id,
            measurement: null,
            view: "measurements",
            tab: null,
            activated: opts?.activated ? "1" : null,
            add: null,
            question: null,
        });
    };

    const openAdd = () => {
        setAddOpen(true);
        setParams({ add: "1", activated: null });
    };

    const closeAdd = () => {
        setAddOpen(false);
        setParams({ add: null });
    };

    useEffect(() => {
        if (addParam) setAddOpen(true);
    }, [addParam]);

    const activeOrg = orgCalcMeasurements.find((m) => m.id === orgMeasurementId) ?? null;
    const futureRoomCapacityState: "start" | "measuring" | "needs_setup" | "needs_attention" =
        !frcMeasurement ? "start"
        : frcMeasurement.status !== "active" ? "needs_setup"
        : "measuring";
    const roomUtilizationState: "start" | "measuring" | "needs_setup" | "needs_attention" =
        !roomUtilMeasurement ? "start"
        : roomUtilMeasurement.status !== "active" ? "needs_setup"
        : "measuring";
    const roomUtilizationFteState: "start" | "measuring" | "needs_setup" | "needs_attention" =
        !roomUtilFteMeasurement ? "start"
        : roomUtilFteMeasurement.status !== "active" ? "needs_setup"
        : "measuring";
    const equivalentChildCountState: "start" | "measuring" | "needs_setup" | "needs_attention" =
        !equivalentChildMeasurement ? "start"
        : equivalentChildMeasurement.status !== "active" ? "needs_setup"
        : "measuring";

    const quickConfigure = async (questionKey: string) => {
        const res = await fetch("/api/admin/operational-questions/configure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question_key: questionKey,
                entry_point: "ui",
                reuse_existing: true,
                target_min_pct: 75,
                target_max_pct: 95,
            }),
        });
        const json = (await res.json()) as { measurement?: { id: string }; error?: string };
        if (!res.ok || !json.measurement?.id) {
            throw new Error(json.error ?? "Could not start measuring");
        }
        await reloadOrgCalcs();
        selectOrgCalc(json.measurement.id, { activated: true });
    };

    useEffect(() => {
        if (questionParam === FUTURE_ROOM_CAPACITY_QUESTION_KEY) {
            if (orgMeasurementId) return;
            if (frcMeasurement) {
                selectOrgCalc(frcMeasurement.id);
                return;
            }
            if (canMutate) {
                setAddOpen(true);
                setParams({ question: FUTURE_ROOM_CAPACITY_QUESTION_KEY, add: "1", view: null });
            }
            return;
        }
        if (questionParam === ROOM_UTILIZATION_QUESTION_KEY) {
            if (orgMeasurementId) return;
            if (roomUtilMeasurement) {
                selectOrgCalc(roomUtilMeasurement.id);
                return;
            }
            if (canMutate) {
                setAddOpen(true);
                setParams({ question: ROOM_UTILIZATION_QUESTION_KEY, add: "1", view: null });
            }
            return;
        }
        if (questionParam === ROOM_UTILIZATION_FTE_QUESTION_KEY) {
            if (orgMeasurementId) return;
            if (roomUtilFteMeasurement) selectOrgCalc(roomUtilFteMeasurement.id);
            else if (canMutate) void quickConfigure(ROOM_UTILIZATION_FTE_QUESTION_KEY).catch(() => undefined);
            return;
        }
        if (questionParam === EQUIVALENT_CHILD_COUNT_QUESTION_KEY) {
            if (orgMeasurementId) return;
            if (equivalentChildMeasurement) selectOrgCalc(equivalentChildMeasurement.id);
            else if (canMutate) void quickConfigure(EQUIVALENT_CHILD_COUNT_QUESTION_KEY).catch(() => undefined);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        questionParam,
        frcMeasurement?.id,
        roomUtilMeasurement?.id,
        roomUtilFteMeasurement?.id,
        equivalentChildMeasurement?.id,
        orgMeasurementId,
        canMutate,
    ]);

    const openFutureRoomCapacity = () => {
        if (frcMeasurement) {
            selectOrgCalc(frcMeasurement.id);
            return;
        }
        openAdd();
        setParams({ question: FUTURE_ROOM_CAPACITY_QUESTION_KEY, add: "1", view: null });
    };

    const openRoomUtilization = () => {
        if (roomUtilMeasurement) {
            selectOrgCalc(roomUtilMeasurement.id);
            return;
        }
        openAdd();
        setParams({ question: ROOM_UTILIZATION_QUESTION_KEY, add: "1", view: null });
    };

    const openRoomUtilizationFte = () => {
        if (roomUtilFteMeasurement) {
            selectOrgCalc(roomUtilFteMeasurement.id);
            return;
        }
        if (canMutate) void quickConfigure(ROOM_UTILIZATION_FTE_QUESTION_KEY).catch(() => undefined);
    };

    const openEquivalentChildCount = () => {
        if (equivalentChildMeasurement) {
            selectOrgCalc(equivalentChildMeasurement.id);
            return;
        }
        if (canMutate) void quickConfigure(EQUIVALENT_CHILD_COUNT_QUESTION_KEY).catch(() => undefined);
    };

    return (
        <div
            className="process-config-page min-h-0 flex-1"
            data-testid="operational-intelligence-organization-product"
            data-adminv2-operational-intelligence="true"
            data-oi-v2-measurements-first="true"
        >
            <ConfigurationContext
                title="Operational Intelligence"
                titleIcon={<Activity className="h-5 w-5" strokeWidth={2} />}
                subtitle="What do you want to know about how the organization is running?"
                testId="oi-configuration-context"
                actions={null}
            />

            <div
                className="mb-3 flex flex-wrap gap-1.5"
                data-testid="oi-product-tabs"
                role="tablist"
                aria-label="Operational Intelligence sections"
            >
                {OI_PRODUCT_TABS.map((t) => {
                    const active =
                        t.key === "questions" ? view === "questions" || view === "builder"
                        : t.key === "measurements" ? view === "measurements"
                        : view === "calculations";
                    return (
                        <button
                            key={t.key}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => {
                                setAddOpen(false);
                                if (t.key === "questions") {
                                    setParams({
                                        view: null,
                                        add: null,
                                        orgMeasurement: null,
                                        measurement: null,
                                        calculationId: null,
                                        libraryView: null,
                                        activated: null,
                                        question: null,
                                    });
                                    return;
                                }
                                if (t.key === "measurements") {
                                    setParams({
                                        view: "measurements",
                                        add: null,
                                        calculationId: null,
                                        libraryView: null,
                                        activated: null,
                                    });
                                    return;
                                }
                                setParams({
                                    view: "calculations",
                                    add: null,
                                    orgMeasurement: null,
                                    measurement: null,
                                    activated: null,
                                    question: null,
                                });
                            }}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                                active ?
                                    "border-[#00a283]/45 bg-[#00a283]/10 text-[#007d68]"
                                :   "border-alloy-stone/25 bg-white text-alloy-midnight/60"
                            }`}
                            data-testid={`oi-tab-${t.key}`}
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {error && !snapshot ?
                <p className="mb-2 text-sm text-alloy-ember" data-testid="oi-load-error">
                    {error}
                </p>
            : null}
            {loading && !snapshot ?
                <p className="mb-2 text-xs text-alloy-midnight/50">Loading measurements…</p>
            : null}

            {view === "questions" ?
                <DomainHome
                    activeMeasurements={activeOrgCalcs}
                    needsAttentionCount={attentionCount}
                    canMutate={canMutate}
                    onOpenMeasurements={() => setParams({ view: "measurements", activated: null, add: null })}
                    futureRoomCapacityState={futureRoomCapacityState}
                    onOpenFutureRoomCapacity={openFutureRoomCapacity}
                    roomUtilizationState={roomUtilizationState}
                    onOpenRoomUtilization={openRoomUtilization}
                    roomUtilizationFteState={roomUtilizationFteState}
                    onOpenRoomUtilizationFte={openRoomUtilizationFte}
                    equivalentChildCountState={equivalentChildCountState}
                    onOpenEquivalentChildCount={openEquivalentChildCount}
                    onSelectMeasurement={(id) => selectOrgCalc(id)}
                />
            : view === "builder" ?
                <div className="space-y-3" data-testid="oi-builder-view">
                    <button
                        type="button"
                        className="text-xs font-semibold text-[#007d68] hover:underline"
                        onClick={closeAdd}
                        data-testid="oi-builder-back-home"
                    >
                        ← Questions
                    </button>
                    {builderQuestion === ROOM_UTILIZATION_QUESTION_KEY ?
                        <OiRoomUtilizationBuilder
                            busy={!canMutate}
                            onClose={closeAdd}
                            onCreated={(id) => {
                                setAddOpen(false);
                                void reloadOrgCalcs().then(() => selectOrgCalc(id, { activated: true }));
                            }}
                        />
                    :   <OiFutureRoomCapacityBuilder
                            busy={!canMutate}
                            onClose={closeAdd}
                            onCreated={(id) => {
                                setAddOpen(false);
                                void reloadOrgCalcs().then(() => selectOrgCalc(id, { activated: true }));
                            }}
                        />
                    }
                </div>
            : view === "calculations" ?
                <div data-testid="oi-calculation-library-view">
                    <OrganizationCalculationsWorkspace embedded />
                </div>
            : view === "advanced" ?
                <div className="space-y-3">
                    <button
                        type="button"
                        className="text-xs font-semibold text-[#007d68] hover:underline"
                        onClick={() => setParams({ view: "home", tab: null })}
                    >
                        ← Back to Operational Intelligence
                    </button>
                    <AdvancedInternals canEdit={canMutate} />
                </div>
            :   <ConfigurationShell
                    testId="operational-intelligence-shell"
                    queueColumn={
                        <ConfigurationQueue
                            title="What we measure"
                            summary="Search and select a measurement"
                        >
                            <div className="mb-2 space-y-1.5 px-1">
                                <button
                                    type="button"
                                    className="text-[11px] font-semibold text-[#007d68] hover:underline"
                                    onClick={() => setParams({ view: null, measurement: null, orgMeasurement: null, activated: null })}
                                    data-testid="oi-back-home"
                                >
                                    ← Questions
                                </button>
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
                                            ["all", "Any health"],
                                            ["off_target", "Needs attention"],
                                            ["healthy", "On goal"],
                                            ["insufficient", "Not available"],
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
                            {visibleOrgCalcs.map((m) => {
                                const recipe = capacityRecipeFromProductTypeLabel(m.source.calculation_name);
                                return (
                                    <ConfigurationQueueItem
                                        key={m.id}
                                        active={orgMeasurementId === m.id}
                                        title={m.name}
                                        subtitle={`${recipe.sourceLine} · seats`}
                                        onClick={() => selectOrgCalc(m.id)}
                                        testId={`oi-org-calc-row-${m.id}`}
                                    />
                                );
                            })}
                            {filtered.map((row) => (
                                <ConfigurationQueueItem
                                    key={row.id}
                                    active={selected?.id === row.id && !orgMeasurementId}
                                    title={row.label}
                                    subtitle={`${row.currentDisplay} · ${oipHealthStatusLabel(row.health)}`}
                                    onClick={() => selectMeasurement(row.id)}
                                    testId={`oi-measurement-${row.id}`}
                                />
                            ))}
                            {filtered.length === 0 && visibleOrgCalcs.length === 0 ?
                                <p className="px-2 text-xs text-alloy-midnight/50">
                                    No measurements yet. Add Future Room Capacity to get started.
                                </p>
                            :   null}
                        </ConfigurationQueue>
                    }
                >
                    {justActivated && activeOrg ?
                        <div
                            className="mb-3 rounded-lg border border-[#00a283]/30 bg-[#00a283]/8 px-4 py-3"
                            data-testid="oi-post-activation"
                        >
                            <p className="text-sm font-semibold text-alloy-midnight">
                                Future Room Capacity is now being measured.
                            </p>
                            <p className="mt-1 text-xs text-alloy-midnight/65">
                                Check another room below anytime. Change the goal or how capacity is determined in
                                Settings.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                                <button
                                    type="button"
                                    className="text-[#007d68] hover:underline"
                                    onClick={() => setParams({ activated: null, orgMeasurement: activeOrg.id })}
                                >
                                    Continue on Overview
                                </button>
                                <span className="text-alloy-midnight/30">·</span>
                                <Link
                                    href={organizationCalculationLibraryHref({
                                        calculationId: activeOrg.source.calculation_id,
                                    })}
                                    className="text-[#007d68] hover:underline"
                                >
                                    View definition
                                </Link>
                            </div>
                        </div>
                    :   null}

                    {orgMeasurementId ?
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
                                Choose what you measure to review the answer, goal, health, and history.
                            </p>
                        </div>
                    }
                </ConfigurationShell>
            }

            <p className="mt-4 px-1 text-[11px] text-alloy-midnight/40">
                <button
                    type="button"
                    className="hover:underline"
                    onClick={() => setParams({ view: "advanced", tab: "diagnostics" })}
                    data-testid="oi-open-advanced"
                >
                    Advanced tools
                </button>
            </p>
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
