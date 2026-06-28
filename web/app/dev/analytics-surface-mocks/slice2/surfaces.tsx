"use client";

import { useState } from "react";

import { BarChart, CohortChart, DataTable, FunnelChart, LineChart, RankedList, StackedBarChart } from "./charts";
import {
    AffectedWorkPanel,
    AnalyticsFilterBar,
    AnalyticsSection,
    CommandPanel,
    DiagnosticPanel,
    DrillBanner,
    ForecastPanel,
    InsightPanel,
    Panel,
    RecommendationPanel,
    ReportSection,
    useDrillLog,
} from "./primitives";
import { TONE_TEXT, tone } from "./tokens";
import {
    AR_AGING_BARS,
    COMMAND_CENTER_AFFECTED,
    COMMAND_CENTER_COMMANDS,
    COMMAND_CENTER_QUEUES,
    CONVERSION_BY_SITE_STACK,
    CONVERSION_COMMANDS,
    CONVERSION_RECOMMENDATIONS,
    ENROLLMENT_FILTERS,
    ENROLLMENT_FUNNEL,
    EXECUTIVE_FILTERS,
    EXECUTIVE_NARRATIVE,
    FAMILIES_STUCK_BY_SITE,
    FINANCIAL_FILTERS,
    MONTHLY_SUMMARY_COLUMNS,
    MONTHLY_SUMMARY_ROWS,
    OPTIMIZATION_FILTERS,
    RATIO_AFFECTED_ROOMS,
    RATIO_CURRENT_STATE,
    RATIO_RECOMMENDATIONS,
    RATIO_SIMULATION,
    RESPONSE_TIME_BARS,
    RETENTION_COHORT_COLUMNS,
    RETENTION_COHORT_ROWS,
    REVENUE_BY_SITE_TABLE,
    REVENUE_CONTRIBUTION_STACK,
    REVENUE_LINE,
    STAFFING_GROUPED,
} from "./fixtures";

const SECTION_CARD = "rounded-xl border border-alloy-stone/15 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]";

function ChartCaption({ measure, scope, children }: { measure: string; scope: string; children?: React.ReactNode }) {
    return (
        <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-xs text-alloy-midnight/55"><span className="font-semibold text-alloy-midnight/75">{measure}</span> · {scope}</p>
            {children}
        </div>
    );
}

// ── 1. Executive Summary (narrative, not tiles) ──────────────────────────────

export function ExecutiveSummarySurface() {
    const log = useDrillLog();
    return (
        <AnalyticsSection
            id="executive-summary"
            eyebrow="Executive · Narrative"
            title="Executive Summary"
            description="What matters this quarter, in plain language — each statement drills to the report or work behind it."
        >
            <AnalyticsFilterBar dimensions={EXECUTIVE_FILTERS} />
            <DrillBanner log={log} />
            <div className="grid gap-4 lg:grid-cols-3">
                {EXECUTIVE_NARRATIVE.map((insight) => (
                    <InsightPanel key={insight.id} insight={insight} onDrill={log.onDrill} />
                ))}
            </div>
            <div className={SECTION_CARD}>
                <ChartCaption measure="Revenue trend" scope="Trailing 6 months · all locations" />
                <LineChart series={REVENUE_LINE} onDrill={log.onDrill} />
                <p className="mt-1 text-[11px] text-alloy-midnight/45">Click any point to open that period&rsquo;s report detail.</p>
            </div>
        </AnalyticsSection>
    );
}

// ── 2. Diagnostic + Affected Work (interactive drilldown) ────────────────────

export function DiagnosticDrilldownSurface() {
    const log = useDrillLog();
    const [site, setSite] = useState<string>("Downtown");
    const families = FAMILIES_STUCK_BY_SITE[site] ?? [];

    const onChartDrill = (d: Parameters<typeof log.onDrill>[0]) => {
        log.onDrill(d);
        if (d.scope && FAMILIES_STUCK_BY_SITE[d.scope]) setSite(d.scope);
    };

    return (
        <AnalyticsSection
            id="diagnostic-conversion"
            eyebrow="Diagnostic · Enrollment"
            title="Why did tour conversion drop?"
            description="Measure → understand → decide → act. Click a site's “Not converted” segment to load the families it represents."
        >
            <AnalyticsFilterBar dimensions={ENROLLMENT_FILTERS} />
            <DrillBanner log={log} />
            <div className="grid gap-4 lg:grid-cols-5">
                <div className="lg:col-span-3">
                    <DiagnosticPanel
                        title="Tour conversion by site"
                        question="Where is conversion failing?"
                        caption="Converted vs not-converted tours, this quarter"
                        toneKey="warning"
                        headerRight={
                            <div className="flex gap-1">
                                {Object.keys(FAMILIES_STUCK_BY_SITE).map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => setSite(s)}
                                        className={`rounded-md px-2 py-1 text-[11px] font-medium ${site === s ? "bg-alloy-midnight text-white" : "bg-alloy-stone/10 text-alloy-midnight/60 hover:bg-alloy-stone/20"}`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        }
                    >
                        <StackedBarChart categories={CONVERSION_BY_SITE_STACK} mode="stacked" onDrill={onChartDrill} />
                        <p className="mt-1 text-[11px] text-alloy-midnight/45">
                            <span className="mr-3"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-alloy-juniper align-middle" />Converted</span>
                            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-alloy-ember align-middle" />Not converted (drillable)</span>
                        </p>
                    </DiagnosticPanel>
                </div>
                <div className="lg:col-span-2">
                    <AffectedWorkPanel
                        title={`Families stuck — ${site}`}
                        subtitle="Tour done, no conversion yet"
                        items={families}
                        onDrill={log.onDrill}
                    />
                </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <RecommendationPanel title="Recommended actions" recommendations={CONVERSION_RECOMMENDATIONS} onDrill={log.onDrill} />
                <CommandPanel title="Command" subtitle="Path to correction, then re-measure" commands={CONVERSION_COMMANDS} onDrill={log.onDrill} />
            </div>
        </AnalyticsSection>
    );
}

// ── 3. Operational Command Center ────────────────────────────────────────────

export function CommandCenterSurface() {
    const log = useDrillLog();
    return (
        <AnalyticsSection
            id="command-center"
            eyebrow="Command Center · Today"
            title="Operational Command Center"
            description="Where work happens: live load, ranked queues, the objects driving risk, and the commands to clear them."
        >
            <DrillBanner log={log} />
            <div className="grid gap-4 lg:grid-cols-5">
                <div className="lg:col-span-3">
                    <Panel title="Queue load" subtitle="Ranked by attention needed" eyebrow="Live" toneKey="critical" dataPanel="ranked">
                        <RankedList items={COMMAND_CENTER_QUEUES} onDrill={log.onDrill} />
                    </Panel>
                </div>
                <div className="lg:col-span-2">
                    <AffectedWorkPanel title="Driving risk now" items={COMMAND_CENTER_AFFECTED} onDrill={log.onDrill} />
                </div>
            </div>
            <CommandPanel title="Clear it" subtitle="Each command opens a queue, workflow, or optimization center" commands={COMMAND_CENTER_COMMANDS} onDrill={log.onDrill} />
        </AnalyticsSection>
    );
}

// ── 4. Ratio / Labor Optimization Center ─────────────────────────────────────

export function OptimizationCenterSurface() {
    const log = useDrillLog();
    const [applied, setApplied] = useState(false);

    return (
        <AnalyticsSection
            id="optimization-center"
            eyebrow="Optimization Center · Downtown"
            title="Ratio & Labor Optimization"
            description="Current state → constraint → recommended change → simulated impact → apply → track. A command center, not a dashboard."
        >
            <AnalyticsFilterBar dimensions={OPTIMIZATION_FILTERS} />
            <DrillBanner log={log} />
            <div className="grid gap-4 lg:grid-cols-4">
                {RATIO_CURRENT_STATE.map((s) => (
                    <div key={s.label} className={`${SECTION_CARD} border-l-[3px] ${tone(s.tone) === "critical" ? "border-l-alloy-ember/70" : tone(s.tone) === "warning" ? "border-l-amber-500/70" : "border-l-alloy-stone/30"}`}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">{s.label}</p>
                        <p className={`mt-1 text-xl font-semibold tabular-nums ${TONE_TEXT[tone(s.tone)]}`}>{s.value}</p>
                    </div>
                ))}
            </div>
            <div className="rounded-xl border border-alloy-ember/25 bg-alloy-ember/[0.05] px-4 py-3" data-analytics-panel="constraint">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-ember">Constraint diagnosis</p>
                <p className="mt-1 text-sm text-alloy-midnight">
                    Toddler B is at <span className="font-semibold">1:9</span> (max 1:8) — one staff short. Preschool C is under max and can lend a floater.
                </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-5">
                <div className="lg:col-span-2">
                    <AffectedWorkPanel title="Affected rooms" subtitle="Downtown · now" items={RATIO_AFFECTED_ROOMS} onDrill={log.onDrill} />
                </div>
                <div className="lg:col-span-3">
                    <RecommendationPanel title="Recommended changes" recommendations={RATIO_RECOMMENDATIONS} onDrill={log.onDrill} />
                </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-5">
                <div className="lg:col-span-3">
                    <Panel
                        title="Simulated ratios after move"
                        subtitle="Projected impact of moving 1 floater Preschool C → Toddler B"
                        eyebrow="Simulation"
                        toneKey="healthy"
                        dataPanel="simulation"
                    >
                        <BarChart bars={RATIO_SIMULATION} onDrill={log.onDrill} />
                        <p className="mt-1 text-[11px] text-alloy-midnight/45">Lower is tighter staffing. All rooms within compliance after the move.</p>
                    </Panel>
                </div>
                <div className="lg:col-span-2 flex flex-col gap-4">
                    <Panel title="Apply & track" eyebrow="Act → re-measure" toneKey="neutral" dataPanel="apply">
                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setApplied(true);
                                    log.onDrill(RATIO_RECOMMENDATIONS[0].action);
                                }}
                                className="rounded-lg bg-alloy-pine px-3 py-2 text-sm font-semibold text-white hover:bg-alloy-pine/90"
                            >
                                Apply recommended move
                            </button>
                            <p className={`text-xs ${applied ? "text-alloy-juniper" : "text-alloy-midnight/45"}`} data-apply-state={applied ? "applied" : "idle"}>
                                {applied ? "✓ Applied — tracking ratios for the next 2 hours to confirm compliance holds." : "After applying, the center tracks the affected rooms to confirm the breach clears."}
                            </p>
                        </div>
                    </Panel>
                </div>
            </div>
        </AnalyticsSection>
    );
}

// ── 5. Financial Report / Output Surface ─────────────────────────────────────

export function FinancialReportSurface() {
    const log = useDrillLog();
    return (
        <AnalyticsSection
            id="financial-report"
            eyebrow="Report · Output"
            title="Monthly Financial Summary"
            description="A reporting/output surface — business-cycle, board-ready, less operational triage. Rows still drill to detail."
        >
            <AnalyticsFilterBar dimensions={FINANCIAL_FILTERS} />
            <DrillBanner log={log} />
            <div className="grid gap-4 lg:grid-cols-2">
                <ReportSection title="Summary — June 2026" period="vs May 2026" footnote="Figures are pre-resolved fixtures. Generated outputs would export to PDF / board packet.">
                    <DataTable columns={MONTHLY_SUMMARY_COLUMNS} rows={MONTHLY_SUMMARY_ROWS} onDrill={log.onDrill} />
                </ReportSection>
                <ReportSection title="Revenue by site" period="June 2026">
                    <DataTable columns={MONTHLY_SUMMARY_COLUMNS} rows={REVENUE_BY_SITE_TABLE} onDrill={log.onDrill} />
                </ReportSection>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <div className={SECTION_CARD}>
                    <ChartCaption measure="Receivables by aging bucket" scope="June 2026 · all accounts" />
                    <BarChart bars={AR_AGING_BARS} onDrill={log.onDrill} />
                </div>
                <ForecastPanel
                    title="Collections forecast"
                    currentLabel="Open AR"
                    currentValue="$84k"
                    projectedLabel="Projected 30d"
                    projectedValue="$71k"
                    note="Assumes the 60+ day collections workflow runs on the 9 flagged accounts."
                    toneKey="warning"
                    action={{ kind: "workflow", label: "Start collections workflow", target: "workflow/collections", scope: "60+ d" }}
                    onDrill={log.onDrill}
                />
            </div>
        </AnalyticsSection>
    );
}

// ── 6. Chart Gallery (x/y, stacked, grouped, funnel, cohort, ranked) ─────────

export function ChartGallerySurface() {
    const log = useDrillLog();
    return (
        <AnalyticsSection
            id="chart-gallery"
            eyebrow="Card Language · Charts"
            title="Chart Renderers & Drilldown Grammar"
            description="Analytics is more than KPI tiles. Real x/y charts, stacked/grouped bars, funnel, cohort, table, and ranked list — every mark drills."
        >
            <AnalyticsFilterBar dimensions={ENROLLMENT_FILTERS} />
            <DrillBanner log={log} />
            <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Lead response time by site" subtitle="Bar chart · x/y axes · click a bar → lead queue" eyebrow="Bar" toneKey="warning" dataPanel="chart-bar">
                    <BarChart bars={RESPONSE_TIME_BARS} onDrill={log.onDrill} />
                </Panel>
                <Panel title="Revenue trend" subtitle="Line chart · click a point → period report" eyebrow="Line" toneKey="healthy" dataPanel="chart-line">
                    <LineChart series={REVENUE_LINE} onDrill={log.onDrill} />
                </Panel>
                <Panel title="Required vs scheduled staff" subtitle="Grouped bars · click a gap → labor optimization" eyebrow="Grouped" toneKey="neutral" dataPanel="chart-grouped">
                    <StackedBarChart categories={STAFFING_GROUPED} mode="grouped" onDrill={log.onDrill} />
                </Panel>
                <Panel title="Revenue contribution by site" subtitle="Stacked bars · click a segment → revenue detail" eyebrow="Stacked" toneKey="healthy" dataPanel="chart-stacked">
                    <StackedBarChart categories={REVENUE_CONTRIBUTION_STACK} mode="stacked" onDrill={log.onDrill} />
                </Panel>
                <Panel title="Enrollment funnel" subtitle="Funnel · click a stage → that stage's queue" eyebrow="Funnel" toneKey="warning" dataPanel="chart-funnel">
                    <FunnelChart stages={ENROLLMENT_FUNNEL} onDrill={log.onDrill} />
                </Panel>
                <Panel title="Retention by enrollment cohort" subtitle="Cohort heatmap · click a cell → cohort records" eyebrow="Cohort" toneKey="healthy" dataPanel="chart-cohort">
                    <CohortChart columns={RETENTION_COHORT_COLUMNS} rows={RETENTION_COHORT_ROWS} onDrill={log.onDrill} />
                </Panel>
            </div>
        </AnalyticsSection>
    );
}

export const SLICE2_SURFACES = [
    { id: "executive-summary", label: "Executive Summary", Component: ExecutiveSummarySurface },
    { id: "diagnostic-conversion", label: "Diagnostic + Affected Work", Component: DiagnosticDrilldownSurface },
    { id: "command-center", label: "Command Center", Component: CommandCenterSurface },
    { id: "optimization-center", label: "Optimization Center", Component: OptimizationCenterSurface },
    { id: "financial-report", label: "Financial Report", Component: FinancialReportSurface },
    { id: "chart-gallery", label: "Chart Gallery", Component: ChartGallerySurface },
] as const;
