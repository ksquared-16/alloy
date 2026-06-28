"use client";

import type { ReactNode } from "react";

import { MetricKpiCard } from "@/components/admin/metrics/MetricKpiCard";
import { MetricTrendCard } from "@/components/admin/metrics/MetricTrendCard";
import { MetricComparisonCard } from "@/components/admin/metrics/MetricComparisonCard";
import { MetricScorecard } from "@/components/admin/metrics/MetricScorecard";
import { MetricHealthCard } from "@/components/admin/metrics/MetricHealthCard";
import { MetricBreakdownCard } from "@/components/admin/metrics/MetricBreakdownCard";
import { MetricChip } from "@/components/admin/metrics/MetricChip";
import type { MetricEvaluationResult, MetricTrendComparison, MetricTrendSentiment } from "@/lib/metrics/platform/types";

import {
    ANALYTICS_SURFACE_FIXTURES,
    DENSITY_EXAMPLE,
    METRIC_GALLERY_CARDS,
    type AnalyticsMetricCardFixture,
    type AnalyticsSurfaceFixture,
    type PreviewGridSpan,
} from "./fixtures";

const SPAN_CLASS: Record<PreviewGridSpan, string> = {
    3: "col-span-12 sm:col-span-6 lg:col-span-3",
    4: "col-span-12 sm:col-span-6 lg:col-span-4",
    5: "col-span-12 lg:col-span-5",
    6: "col-span-12 lg:col-span-6",
    7: "col-span-12 lg:col-span-7",
    12: "col-span-12",
};

function previewComparison(deltaPercent: number, sentiment: MetricTrendSentiment): MetricTrendComparison {
    const now = new Date().toISOString();
    const current: MetricEvaluationResult = {
        metricDefinitionId: "preview",
        key: "preview",
        label: "preview",
        unit: "none",
        value: null,
        numeratorValue: null,
        denominatorValue: null,
        formattedValue: "—",
        healthState: "unknown",
        periodStart: now,
        periodEnd: now,
        computedAt: now,
    };
    return {
        current,
        previous: null,
        deltaValue: null,
        deltaPercent,
        direction: deltaPercent > 0 ? "up" : deltaPercent < 0 ? "down" : "flat",
        sentiment,
    };
}

function drillFooter(drill: string | undefined): ReactNode {
    if (!drill) return undefined;
    return (
        <span className="inline-flex items-center gap-1 font-semibold text-alloy-pine" data-metric-drill="true">
            <span aria-hidden="true">→</span>
            {drill}
        </span>
    );
}

export function PreviewMetricCard({ card }: { card: AnalyticsMetricCardFixture }) {
    const footer = drillFooter(card.drill);
    switch (card.kind) {
        case "kpi":
            return (
                <MetricKpiCard label={card.label} value={card.value} status={card.status} accent={card.accent} question={card.question} footer={footer} />
            );
        case "trend":
            return (
                <MetricTrendCard
                    label={card.label}
                    value={card.value}
                    status={card.status}
                    accent={card.accent}
                    question={card.question}
                    sparklinePoints={card.sparklinePoints}
                    direction={card.direction}
                    footer={footer}
                />
            );
        case "comparison":
            return (
                <MetricComparisonCard
                    label={card.label}
                    value={card.value}
                    accent={card.accent}
                    question={card.question}
                    comparison={previewComparison(card.deltaPercent, card.sentiment)}
                    baselineLabel={card.baselineLabel}
                    footer={footer}
                />
            );
        case "scorecard":
            return (
                <MetricScorecard label={card.label} value={card.value} status={card.status} accent={card.accent} question={card.question} metrics={card.metrics} footer={footer} />
            );
        case "health":
            return (
                <MetricHealthCard label={card.label} value={card.value} score={card.score} status={card.status} accent={card.accent} question={card.question} footer={footer} />
            );
        case "breakdown":
            return (
                <MetricBreakdownCard label={card.label} segments={card.segments} status={card.status} accent={card.accent} question={card.question} footer={footer} />
            );
        case "chip":
            return <MetricChip label={card.label} value={card.value} status={card.status} />;
    }
}

function SurfaceBlock({ surface }: { surface: AnalyticsSurfaceFixture }) {
    return (
        <section className="rounded-2xl border border-alloy-stone/15 bg-white shadow-sm" data-analytics-preview-surface={surface.id}>
            <header className="border-b border-alloy-stone/15 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">{surface.context}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">{surface.title}</h2>
                <p className="mt-1 text-sm text-alloy-midnight/55">{surface.subtitle}</p>
            </header>
            <div className="space-y-6 bg-alloy-stone/[0.04] p-5">
                {surface.zones.map((zone) => (
                    <div key={zone.id} data-analytics-preview-zone={zone.id}>
                        <div className="mb-3 flex items-baseline gap-2">
                            <h3 className="text-xs font-bold uppercase tracking-wide text-alloy-midnight/70">{zone.title}</h3>
                            {zone.subtitle ? <span className="text-xs text-alloy-midnight/45">{zone.subtitle}</span> : null}
                        </div>
                        <div className="grid grid-cols-12 gap-4">
                            {zone.cards.map((card) => (
                                <div key={card.id} className={SPAN_CLASS[card.span ?? 3]}>
                                    <PreviewMetricCard card={card} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

export default function AnalyticsSurfaceMocksGallery() {
    return (
        <div className="min-h-screen bg-alloy-stone/[0.06] px-6 py-8">
            <div className="mx-auto max-w-[1200px] space-y-8">
                <header>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">Dev preview · not production</p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight text-alloy-midnight">Analytics Surface Preview</h1>
                    <p className="mt-2 max-w-2xl text-sm text-alloy-midnight/60">
                        Dashboard Design Surfaces composed from the Metric archetype and the shared Renderer catalog
                        (KPI · Trend · Comparison · Health · Breakdown · Scorecard · Chip). Values are static fixtures —
                        calculation stays in OIP. Source of truth:{" "}
                        <code className="rounded bg-white px-1 py-0.5 text-xs">
                            docs/sprints/06_2026/analytics-operational-intelligence-platform/mockups
                        </code>
                        .
                    </p>
                </header>

                {ANALYTICS_SURFACE_FIXTURES.map((surface) => (
                    <SurfaceBlock key={surface.id} surface={surface} />
                ))}

                <section className="rounded-2xl border border-alloy-stone/15 bg-white shadow-sm" data-analytics-preview-surface="metric-card-gallery">
                    <header className="border-b border-alloy-stone/15 px-5 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">Card Language</p>
                        <h2 className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">Metric Card Gallery</h2>
                        <p className="mt-1 text-sm text-alloy-midnight/55">One Metric archetype, all renderers — plus the Health and Breakdown renderers added in this slice.</p>
                    </header>
                    <div className="bg-alloy-stone/[0.04] p-5">
                        <div className="grid grid-cols-12 gap-4">
                            {METRIC_GALLERY_CARDS.map((card) => (
                                <div key={card.id} className={card.kind === "chip" ? "col-span-6 sm:col-span-3 lg:col-span-2 self-start" : SPAN_CLASS[card.span ?? 3]}>
                                    <PreviewMetricCard card={card} />
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border border-alloy-stone/15 bg-white shadow-sm" data-analytics-preview-surface="density-ladder">
                    <header className="border-b border-alloy-stone/15 px-5 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">Surface Independence</p>
                        <h2 className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">Density examples</h2>
                        <p className="mt-1 text-sm text-alloy-midnight/55">
                            One card language across contexts. Header / tile strips render compact (light footprint in
                            Workspace / Focus Panel chrome); dashboards render standard. MetricPlacementRenderer picks
                            density from layout automatically.
                        </p>
                    </header>
                    <div className="space-y-6 bg-alloy-stone/[0.04] p-5">
                        <div data-density-context="header-strip">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Header strip — compact (inline / row layout)
                            </p>
                            <div className="flex flex-wrap items-stretch gap-2">
                                <div className="w-[180px]">
                                    <MetricKpiCard label="Tours today" value="11" status="healthy" accent="enrollment" density="compact" />
                                </div>
                                <div className="w-[180px]">
                                    <MetricKpiCard label={DENSITY_EXAMPLE.label} value={DENSITY_EXAMPLE.value} status={DENSITY_EXAMPLE.status} accent={DENSITY_EXAMPLE.accent} density="compact" />
                                </div>
                                <div className="w-[210px]">
                                    <MetricTrendCard label="MRR" value="$418k" status="healthy" accent="communications" density="compact" sparklinePoints={[360, 388, 405, 418]} />
                                </div>
                                <div className="w-[200px]">
                                    <MetricHealthCard label="Org health" value="84" score={84} status="healthy" accent="enrollment" density="compact" />
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-start gap-4" data-density-context="dashboard-tile">
                            <div className="w-[200px]" data-density="compact">
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Compact</p>
                                <MetricKpiCard label={DENSITY_EXAMPLE.label} value={DENSITY_EXAMPLE.value} status={DENSITY_EXAMPLE.status} accent={DENSITY_EXAMPLE.accent} density="compact" />
                            </div>
                            <div className="w-[260px]" data-density="standard">
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Standard (dashboard)</p>
                                <MetricKpiCard
                                    label={DENSITY_EXAMPLE.label}
                                    value={DENSITY_EXAMPLE.value}
                                    status={DENSITY_EXAMPLE.status}
                                    accent={DENSITY_EXAMPLE.accent}
                                    question={DENSITY_EXAMPLE.question}
                                    density="standard"
                                    footer={drillFooter("Affected sites")}
                                />
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
