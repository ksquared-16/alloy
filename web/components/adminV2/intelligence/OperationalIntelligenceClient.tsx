"use client";

import { useRouter } from "next/navigation";

import {
    AnalyticsContextProvider,
    type AnalyticsContextScope,
} from "@/lib/analytics/runtime/AnalyticsContextProvider";
import type { OperationalSurfaceModel } from "@/lib/analytics/runtime/operationalSurfaceModel";
import { OperationalFilterBar } from "@/components/adminV2/intelligence/OperationalFilterBar";
import { OperationalMetricCard } from "@/components/adminV2/intelligence/OperationalMetricCard";
import { AnalyticsSection, DiagnosticPanel, AffectedWorkPanel } from "@/app/dev/analytics-surface-mocks/slice2/primitives";
import { BarChart } from "@/app/dev/analytics-surface-mocks/slice2/charts";
import type { ChartBar, AffectedWorkItem } from "@/app/dev/analytics-surface-mocks/slice2/types";

/**
 * Operational Intelligence surface shell (client). Composes the approved Slice 2
 * visual language over a server-resolved, real-data model. Drill marks navigate to
 * real workspace queues.
 */
export function OperationalIntelligenceClient({
    scope,
    model,
}: {
    scope: AnalyticsContextScope;
    model: OperationalSurfaceModel;
}) {
    const router = useRouter();

    const navigate = (href: string | null | undefined) => {
        if (href && href.startsWith("/")) router.push(href);
    };

    const bars: ChartBar[] = model.breakdown.bars.map((b) => ({
        label: b.label,
        value: b.value,
        formatted: b.formatted,
        drill: b.drillHref
            ? { kind: "queue", label: `Open ${b.label} queue`, target: b.drillHref }
            : undefined,
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
        <AnalyticsContextProvider scope={scope}>
            <div className="space-y-5" data-analytics-surface="operational_intelligence">
                <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">Operational Intelligence</p>
                        <h1 className="text-2xl font-semibold tracking-tight text-alloy-midnight">Operational pulse</h1>
                        <p className="mt-1 text-sm text-alloy-midnight/55">
                            Measure → understand → drill → work. Live OIP-backed facts for {model.windowLabel.toLowerCase()}.
                        </p>
                    </div>
                </header>

                <OperationalFilterBar siteLabel={model.siteLabel} />

                <AnalyticsSection eyebrow="Measure" title="Operational metrics" description="Resolved live from Operational Calculations (OIP). Each card drills into real work.">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5" data-metric-grid="operational">
                        {model.metrics.map((card) => (
                            <OperationalMetricCard key={card.key} card={card} />
                        ))}
                    </div>
                </AnalyticsSection>

                <AnalyticsSection eyebrow="Understand" title="Demand breakdown" description="Where enrollment work is sitting now — drill any bar into its filtered queue.">
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
                                <p className="py-6 text-center text-xs text-alloy-midnight/45">
                                    No open opportunities in scope.
                                </p>
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

                {model.dataNotes.length ? (
                    <ul className="space-y-1 rounded-xl border border-dashed border-alloy-stone/20 bg-white/60 p-3 text-[11px] text-alloy-midnight/55" data-analytics-data-notes="true">
                        {model.dataNotes.map((note, i) => (
                            <li key={i}>· {note}</li>
                        ))}
                    </ul>
                ) : null}
            </div>
        </AnalyticsContextProvider>
    );
}
