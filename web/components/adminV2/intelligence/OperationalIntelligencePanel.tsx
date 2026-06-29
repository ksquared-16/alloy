"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import {
    isInternalDrillHref,
    type OperationalSurfaceModel,
} from "@/lib/analytics/runtime/operationalSurfaceModel";
import { OperationalMetricCard } from "@/components/adminV2/intelligence/OperationalMetricCard";
import { AnalyticsSection, DiagnosticPanel, AffectedWorkPanel } from "@/app/dev/analytics-surface-mocks/slice2/primitives";
import { BarChart } from "@/app/dev/analytics-surface-mocks/slice2/charts";
import type { ChartBar, AffectedWorkItem } from "@/app/dev/analytics-surface-mocks/slice2/types";

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
    const selectedSiteId = siteFilter?.selectedSiteId ?? null;

    const [compareOn, setCompareOn] = useState(false);
    const scopeKey = `${selectedSiteId ?? ""}|${compareOn ? "1" : "0"}`;

    // All state lands in async callbacks (no synchronous setState in the effect body);
    // `loading` is derived by comparing the loaded scope to the current scope.
    const [loaded, setLoaded] = useState<{ scope: string; model: OperationalSurfaceModel | null; error: string | null }>(
        { scope: "", model: null, error: null },
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
        const qs = new URLSearchParams();
        if (selectedSiteId) qs.set("site_id", selectedSiteId);
        if (compareOn) qs.set("compare", "1");
        fetch(`/api/admin/intelligence/operational?${qs.toString()}`, { credentials: "include" })
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json() as Promise<OperationalSurfaceModel>;
            })
            .then((data) => {
                if (!cancelled) setLoaded({ scope: scopeKey, model: data, error: null });
            })
            .catch(() => {
                if (!cancelled)
                    setLoaded({ scope: scopeKey, model: null, error: "Unable to load operational intelligence right now." });
            });
        return () => {
            cancelled = true;
        };
    }, [scopeKey, selectedSiteId, compareOn]);

    if (loading && !model) {
        return (
            <div className="space-y-3" data-operational-intelligence-loading="true" aria-busy="true">
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
            <p className="rounded-lg border border-alloy-ember/30 bg-white px-3 py-2 text-xs text-alloy-ember" data-operational-intelligence-error="true">
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
        <div className="space-y-5" data-analytics-surface="operational_intelligence">
            <AnalyticsSection
                eyebrow="Measure"
                title="Operational metrics"
                description="Resolved live from Operational Calculations (OIP). Each card drills into real work."
            >
                <div className="mb-3 flex items-center justify-end">
                    <label className="inline-flex items-center gap-1 rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.04] px-2 py-1 text-xs">
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
                </div>
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
