"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import {
    isInternalDrillHref,
    type OperationalSurfaceModel,
} from "@/lib/analytics/runtime/operationalSurfaceModel";
import {
    getOperationalIntelligenceWarm,
    subscribeOperationalIntelligenceWarm,
    warmOperationalIntelligence,
} from "@/lib/analytics/runtime/operationalIntelligenceWarmCache";
import { ANALYTICS_WINDOW_OPTIONS } from "@/lib/analytics/runtime/metricWindow";
import type { MetricTimeWindowKey } from "@/lib/metrics/types";
import { OperationalMetricCard } from "@/components/adminV2/intelligence/OperationalMetricCard";
import { AnalyticsSection, DiagnosticPanel, AffectedWorkPanel } from "@/app/dev/analytics-surface-mocks/slice2/primitives";
import { BarChart } from "@/app/dev/analytics-surface-mocks/slice2/charts";
import type { ChartBar, AffectedWorkItem } from "@/app/dev/analytics-surface-mocks/slice2/types";
import { WS_OVERVIEW_CONTENT } from "@/components/workspace/workspaceTokens";

/**
 * Operational Intelligence runtime surface — rendered INSIDE the existing Workspace →
 * Analytics modal (not a standalone page). Real data comes from the shared server
 * model builder via /api/admin/intelligence/operational; site scope comes from the
 * existing workspace site filter. Adds the breakdown + drill + affected-work
 * ("Understand → Drill → Work") the modal Overview previously lacked.
 *
 * Doctrine: runtime lives in the shell/modal; configuration lives in Surfaces; the
 * API route is an implementation detail, not a product surface.
 */
export function OperationalIntelligencePanel() {
    const router = useRouter();
    const siteFilter = useWorkspaceSiteFilter();

    // Modal-local filters. Site defaults from the workspace context but is overridable
    // here without mutating the global workspace site filter.
    const [windowKey, setWindowKey] = useState<MetricTimeWindowKey>("rolling_30d");
    const [siteId, setSiteId] = useState<string | null>(siteFilter?.selectedSiteId ?? null);
    const [compareOn, setCompareOn] = useState(false);
    const scopeKey = `${siteId ?? ""}|${windowKey}|${compareOn ? "1" : "0"}`;

    const warmParams = { siteId, window: windowKey, compare: compareOn };
    // Warm-first: seed from the shared OI warm cache (Analytics nav intent warms it) so a warmed scope
    // paints with NO skeleton. `loading` is derived by comparing the loaded scope to the current scope,
    // so a warm seed for the current scope is immediately "not loading".
    const [loaded, setLoaded] = useState<{ scope: string; model: OperationalSurfaceModel | null; error: string | null }>(
        () => {
            const seed = getOperationalIntelligenceWarm(warmParams);
            return seed ? { scope: scopeKey, model: seed, error: null } : { scope: "", model: null, error: null };
        },
    );
    const loading = loaded.scope !== scopeKey;
    const model = loaded.model;
    const error = loaded.error;

    const navigate = useCallback(
        (href: string | null | undefined) => {
            if (isInternalDrillHref(href)) router.push(href as string);
        },
        [router],
    );

    useEffect(() => {
        let cancelled = false;
        // Reflect a warm entry for THIS scope immediately (covers a scope change to an already-warm
        // scope), then load through the shared cache — warm-first + deduped, SWR on stale.
        const warm = getOperationalIntelligenceWarm({ siteId, window: windowKey, compare: compareOn });
        if (warm) setLoaded({ scope: scopeKey, model: warm, error: null });
        void warmOperationalIntelligence({ siteId, window: windowKey, compare: compareOn }).then((result) => {
            if (cancelled) return;
            if (result.model) setLoaded({ scope: scopeKey, model: result.model, error: null });
            else if (!warm) setLoaded({ scope: scopeKey, model: null, error: result.error });
        });
        // Keep in sync if another consumer warms the same scope.
        const unsubscribe = subscribeOperationalIntelligenceWarm(() => {
            const snap = getOperationalIntelligenceWarm({ siteId, window: windowKey, compare: compareOn });
            if (snap && !cancelled) setLoaded({ scope: scopeKey, model: snap, error: null });
        });
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [scopeKey, siteId, windowKey, compareOn]);

    if (loading && !model) {
        return (
            <div
                className={`${WS_OVERVIEW_CONTENT} space-y-3`}
                data-operational-intelligence-loading="true"
                aria-busy="true"
            >
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-24 animate-pulse rounded-xl bg-alloy-forge/8" />
                    ))}
                </div>
                <div className="h-48 animate-pulse rounded-xl bg-alloy-forge/8" />
            </div>
        );
    }

    if (error) {
        return (
            <p
                className={`${WS_OVERVIEW_CONTENT} rounded-lg border border-alloy-ember/30 bg-white px-3 py-2 text-xs text-alloy-ember`}
                data-operational-intelligence-error="true"
            >
                {error}
            </p>
        );
    }

    if (!model) return null;

    const bars: ChartBar[] = model.breakdown.bars.map((b) => ({
        label: b.label,
        value: b.value,
        formatted: b.formatted,
        drill: b.drillHref ? { kind: "queue", label: `Open ${b.label} queue`, target: b.drillHref } : undefined,
    }));

    const affected: AffectedWorkItem[] = model.affectedWork.map((a) => ({
        id: a.id,
        title: a.title,
        detail: a.detail,
        badge: a.badge,
        tone: "warning",
        drill: { kind: "queue", label: `Open ${a.title} queue`, target: a.drillHref ?? "#" },
    }));

    return (
        <div
            className={`${WS_OVERVIEW_CONTENT} space-y-5`}
            data-analytics-surface="operational_intelligence"
            data-workspace-overview-width="true"
        >            <div
                className="flex flex-wrap items-center gap-2 rounded-xl border border-alloy-stone/15 bg-white p-2.5"
                data-operational-filter-bar="true"
                aria-busy={loading}
            >
                <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine">Filters</span>
                <label className="inline-flex items-center gap-1 rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.04] px-2 py-1 text-xs" data-filter-dimension="date_range">
                    <span className="text-alloy-midnight/45">Window:</span>
                    <select
                        value={windowKey}
                        onChange={(e) => setWindowKey(e.target.value as MetricTimeWindowKey)}
                        className="bg-transparent font-semibold text-alloy-midnight focus:outline-none"
                        data-operational-window-filter="true"
                    >
                        {ANALYTICS_WINDOW_OPTIONS.map((o) => (
                            <option key={o.windowKey} value={o.windowKey}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="inline-flex items-center gap-1 rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.04] px-2 py-1 text-xs" data-filter-dimension="location">
                    <span className="text-alloy-midnight/45">Site:</span>
                    <select
                        value={siteId ?? ""}
                        onChange={(e) => setSiteId(e.target.value || null)}
                        className="bg-transparent font-semibold text-alloy-midnight focus:outline-none"
                        data-operational-site-filter="true"
                    >
                        <option value="">All sites</option>
                        {model.siteOptions.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="inline-flex items-center gap-1 rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.04] px-2 py-1 text-xs" data-filter-dimension="comparison">
                    <span className="text-alloy-midnight/45">Compare:</span>
                    <select
                        value={compareOn ? "prior" : "off"}
                        onChange={(e) => setCompareOn(e.target.value === "prior")}
                        className="bg-transparent font-semibold text-alloy-midnight focus:outline-none"
                        data-operational-compare-toggle="true"
                    >
                        <option value="off">Off</option>
                        <option value="prior">Prior period</option>
                    </select>
                </label>
                {loading ? <span className="ml-auto text-[11px] text-alloy-midnight/45">Updating…</span> : null}
            </div>

            <AnalyticsSection
                eyebrow="Measure"
                title="Operational metrics"
                description={
                    model.metricsSource === "configured"
                        ? "Configured in Configuration → Operational Calculations → Where it appears. Resolved live from OIP; each card drills into real work."
                        : "Default set (no placements configured). Resolved live from OIP; each card drills into real work."
                }
            >
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5" data-metric-grid="operational">
                    {model.metrics.map((card) => (
                        <OperationalMetricCard key={card.key} card={card} />
                    ))}
                </div>
            </AnalyticsSection>

            <AnalyticsSection
                eyebrow="Understand"
                title="Demand breakdown"
                description="Where enrollment work is sitting now — drill any bar into its filtered queue."
            >
                <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
                    <DiagnosticPanel
                        title={model.breakdown.title}
                        question={model.breakdown.question}
                        caption={model.breakdown.note}
                        toneKey="neutral"
                    >
                        {bars.length ? (
                            <BarChart bars={bars} onDrill={(d) => navigate(d.target)} />
                        ) : (
                            <p className="py-6 text-center text-xs text-alloy-midnight/45">No open opportunities in scope.</p>
                        )}
                    </DiagnosticPanel>

                    <AffectedWorkPanel
                        title="Top affected queues"
                        subtitle="Highest-volume stages right now"
                        items={affected}
                        onDrill={(d) => navigate(d.target)}
                        emptyHint="No affected work in scope."
                    />
                </div>
            </AnalyticsSection>

            <div className="rounded-xl border border-dashed border-alloy-stone/20 bg-white/60 p-3 text-[11px] text-alloy-midnight/55" data-analytics-data-notes="true">
                <p className="font-medium text-alloy-midnight/70" data-analytics-freshness={model.freshnessIso ?? "none"}>
                    {model.freshnessIso
                        ? `Data as of ${new Date(model.freshnessIso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${model.windowLabel}`
                        : `Live · ${model.windowLabel}`}
                </p>
                <ul className="mt-1 space-y-1">
                    {model.dataNotes.map((note, i) => (
                        <li key={i}>· {note}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
