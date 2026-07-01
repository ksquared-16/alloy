import type { MetricBreakdownSegment } from "@/components/admin/metrics/MetricBreakdownCard";
import type { ScorecardMetric } from "@/components/admin/metrics/MetricScorecard";
import type { MetricHealthState, MetricTrendDirection, MetricTrendSentiment } from "@/lib/metrics/platform/types";

/**
 * Static fixtures for the dev-only Analytics Surface preview.
 *
 * These describe sample Dashboard Design Surfaces composed from the Metric
 * archetype + shared Renderer catalog — matching the Phase 2 mockups in
 * `docs/sprints/06_2026/analytics-operational-intelligence-platform/mockups`.
 *
 * Fixtures are presentation data only: every value is a pre-resolved display
 * string (calculation stays in OIP). They never call an API and are not used by
 * production runtime.
 */

export type PreviewAccent =
    | "enrollment"
    | "operational"
    | "forms"
    | "communications"
    | "amber"
    | "critical"
    | "neutral";

export type PreviewGridSpan = 3 | 4 | 5 | 6 | 7 | 12;

type BaseCardFixture = {
    id: string;
    label: string;
    /** Optional operational question eyebrow. */
    question?: string;
    status?: MetricHealthState;
    accent?: PreviewAccent;
    /** Optional drill affordance label (rendered as the card footer). */
    drill?: string;
    span?: PreviewGridSpan;
};

export type AnalyticsMetricCardFixture =
    | (BaseCardFixture & { kind: "kpi"; value: string })
    | (BaseCardFixture & {
          kind: "trend";
          value: string;
          sparklinePoints: number[];
          direction?: MetricTrendDirection;
      })
    | (BaseCardFixture & {
          kind: "comparison";
          value: string;
          deltaPercent: number;
          sentiment: MetricTrendSentiment;
          baselineLabel?: string;
      })
    | (BaseCardFixture & { kind: "scorecard"; value: string; metrics: ScorecardMetric[] })
    | (BaseCardFixture & { kind: "health"; value: string; score?: number })
    | (BaseCardFixture & { kind: "breakdown"; segments: MetricBreakdownSegment[] })
    | (BaseCardFixture & { kind: "chip"; value: string });

export type AnalyticsSurfaceZoneFixture = {
    id: string;
    title: string;
    subtitle?: string;
    cards: AnalyticsMetricCardFixture[];
};

export type AnalyticsSurfaceFixture = {
    id: string;
    title: string;
    subtitle: string;
    /** Surface category breadcrumb context. */
    context: string;
    zones: AnalyticsSurfaceZoneFixture[];
};

export const EXECUTIVE_PERFORMANCE_FIXTURE: AnalyticsSurfaceFixture = {
    id: "executive-performance",
    title: "Executive Performance",
    subtitle: "How healthy is the organization, where is it growing, and what is coming next.",
    context: "Organization",
    zones: [
        {
            id: "health",
            title: "Organization Health",
            subtitle: "Composite of four process scores",
            cards: [
                {
                    id: "org-health",
                    kind: "health",
                    label: "Organization health",
                    question: "How healthy is the organization?",
                    value: "84 / 100",
                    score: 84,
                    status: "healthy",
                    accent: "enrollment",
                    drill: "Open health roll-up",
                    span: 4,
                },
                {
                    id: "enrollment-health",
                    kind: "kpi",
                    label: "Enrollment",
                    value: "91",
                    status: "healthy",
                    accent: "enrollment",
                    span: 4,
                },
                {
                    id: "financial-health",
                    kind: "kpi",
                    label: "Financial",
                    value: "88",
                    status: "healthy",
                    accent: "communications",
                    span: 4,
                },
            ],
        },
        {
            id: "growth",
            title: "Growth",
            subtitle: "Demand, conversion, capacity fill",
            cards: [
                {
                    id: "net-new",
                    kind: "trend",
                    label: "Net new enrollments",
                    value: "42",
                    sparklinePoints: [22, 26, 28, 31, 35, 39, 42],
                    status: "healthy",
                    accent: "enrollment",
                    drill: "Enrollment Intelligence",
                    span: 3,
                },
                {
                    id: "tour-conversion",
                    kind: "comparison",
                    label: "Tour conversion",
                    question: "Are tours converting?",
                    value: "38%",
                    deltaPercent: -5,
                    sentiment: "bad",
                    baselineLabel: "target 45%",
                    status: "warning",
                    accent: "amber",
                    drill: "See affected sites",
                    span: 3,
                },
                {
                    id: "capacity-fill",
                    kind: "kpi",
                    label: "Capacity fill",
                    value: "87%",
                    status: "healthy",
                    accent: "enrollment",
                    span: 3,
                },
                {
                    id: "mrr",
                    kind: "trend",
                    label: "MRR",
                    value: "$418k",
                    sparklinePoints: [360, 372, 388, 392, 405, 412, 418],
                    status: "healthy",
                    accent: "communications",
                    span: 3,
                },
            ],
        },
    ],
};

export const OPERATIONAL_INTELLIGENCE_FIXTURE: AnalyticsSurfaceFixture = {
    id: "operational-intelligence",
    title: "Operational Intelligence",
    subtitle: "What needs attention right now, and where the operation is constrained today.",
    context: "Organization · Today",
    zones: [
        {
            id: "pulse",
            title: "Pulse",
            subtitle: "Live operational health",
            cards: [
                { id: "response", kind: "kpi", label: "Avg response time", value: "4.2h", status: "warning", accent: "amber", drill: "Lead queues", span: 3 },
                { id: "tours-today", kind: "kpi", label: "Tours today", value: "11", status: "healthy", accent: "enrollment", span: 3 },
                { id: "forms", kind: "kpi", label: "Forms completion", value: "82%", status: "healthy", accent: "forms", span: 3 },
                { id: "overdue", kind: "kpi", label: "Overdue work", value: "14", status: "critical", accent: "critical", drill: "Overdue queue", span: 3 },
            ],
        },
        {
            id: "bottlenecks",
            title: "Bottlenecks",
            subtitle: "Where the operation is constrained",
            cards: [
                {
                    id: "response-by-site",
                    kind: "breakdown",
                    label: "Lead response time by site",
                    question: "Where is the queue constrained?",
                    status: "warning",
                    accent: "amber",
                    drill: "Downtown lead queue",
                    span: 6,
                    segments: [
                        { label: "Maple St", value: 1.4, formattedValue: "1.4h", tone: "healthy" },
                        { label: "Lakeside", value: 1.9, formattedValue: "1.9h", tone: "healthy" },
                        { label: "Riverside", value: 4.8, formattedValue: "4.8h", tone: "warning" },
                        { label: "Downtown", value: 6.1, formattedValue: "6.1h", tone: "critical" },
                    ],
                },
                {
                    id: "needs-attention",
                    kind: "scorecard",
                    label: "Needs attention",
                    question: "What requires action?",
                    value: "7",
                    status: "critical",
                    accent: "critical",
                    drill: "Resolve queue",
                    span: 6,
                    metrics: [
                        { label: "Tours unconfirmed < 24h", value: "3", status: "critical" },
                        { label: "Leads no contact > 48h", value: "5", status: "warning" },
                        { label: "Invoices past due > 30d", value: "9", status: "warning" },
                    ],
                },
            ],
        },
    ],
};

export const ENROLLMENT_ANALYTICS_FIXTURE: AnalyticsSurfaceFixture = {
    id: "enrollment-intelligence",
    title: "Enrollment Intelligence",
    subtitle: "Demand → conversion → capacity. Every stage drills to the families inside it.",
    context: "Organization · Business Process · Enrollment",
    zones: [
        {
            id: "funnel",
            title: "Pipeline Funnel",
            subtitle: "Stage volume & conversion",
            cards: [
                {
                    id: "funnel-breakdown",
                    kind: "breakdown",
                    label: "Where are families in the process?",
                    status: "warning",
                    accent: "enrollment",
                    drill: "Open 'Tour done' queue (104)",
                    span: 7,
                    segments: [
                        { label: "New inquiry", value: 248, formattedValue: "248", tone: "neutral" },
                        { label: "Contacted", value: 196, formattedValue: "196", tone: "neutral" },
                        { label: "Tour booked", value: 134, formattedValue: "134", tone: "neutral" },
                        { label: "Tour done", value: 104, formattedValue: "104", tone: "warning" },
                        { label: "Enrolled", value: 40, formattedValue: "40", tone: "healthy" },
                    ],
                },
                {
                    id: "conversion",
                    kind: "trend",
                    label: "Tour conversion",
                    question: "Are tours converting?",
                    value: "38%",
                    sparklinePoints: [45, 44, 43, 41, 40, 39, 38],
                    direction: "down",
                    status: "warning",
                    accent: "amber",
                    drill: "Affected sites",
                    span: 5,
                },
            ],
        },
        {
            id: "capacity",
            title: "Capacity & Sources",
            cards: [
                {
                    id: "capacity-by-program",
                    kind: "breakdown",
                    label: "Capacity fill by program",
                    status: "warning",
                    accent: "enrollment",
                    span: 6,
                    segments: [
                        { label: "Infant", value: 98, formattedValue: "98%", tone: "critical" },
                        { label: "Toddler", value: 84, formattedValue: "84%", tone: "healthy" },
                        { label: "Preschool", value: 62, formattedValue: "62%", tone: "warning" },
                        { label: "Pre-K", value: 91, formattedValue: "91%", tone: "healthy" },
                    ],
                },
                { id: "lead-count", kind: "kpi", label: "Lead count", value: "248", status: "healthy", accent: "enrollment", span: 3 },
                { id: "time-to-tour", kind: "kpi", label: "Time to first tour", value: "2.1d", status: "healthy", accent: "enrollment", span: 3 },
            ],
        },
    ],
};

export const FINANCIAL_PERFORMANCE_FIXTURE: AnalyticsSurfaceFixture = {
    id: "financial-performance",
    title: "Financial Performance",
    subtitle: "Revenue, receivables, and margin — each figure drills to its accounts and invoices.",
    context: "Organization",
    zones: [
        {
            id: "revenue",
            title: "Revenue & Margin",
            cards: [
                { id: "revenue", kind: "trend", label: "Revenue (QTD)", value: "$1.24M", sparklinePoints: [1.0, 1.05, 1.12, 1.16, 1.2, 1.24], status: "healthy", accent: "communications", span: 3 },
                { id: "margin", kind: "kpi", label: "Net margin", value: "19%", status: "healthy", accent: "communications", span: 3 },
                { id: "ar", kind: "comparison", label: "Accounts receivable", value: "$84k", deltaPercent: 16.7, sentiment: "bad", baselineLabel: "prior period", status: "warning", accent: "amber", drill: "Past-due accounts", span: 3 },
                { id: "collected", kind: "kpi", label: "Collected rate", value: "94%", status: "healthy", accent: "enrollment", span: 3 },
            ],
        },
        {
            id: "aging",
            title: "Receivables Aging",
            subtitle: "Where cash is stuck",
            cards: [
                {
                    id: "ar-aging",
                    kind: "breakdown",
                    label: "AR by age bucket",
                    status: "warning",
                    accent: "communications",
                    drill: "Open 60+ day accounts",
                    span: 6,
                    segments: [
                        { label: "Current", value: 46, formattedValue: "$46k", tone: "healthy" },
                        { label: "1–30 d", value: 20, formattedValue: "$20k", tone: "healthy" },
                        { label: "31–60 d", value: 12, formattedValue: "$12k", tone: "warning" },
                        { label: "60+ d", value: 6.2, formattedValue: "$6.2k", tone: "critical" },
                    ],
                },
                {
                    id: "ar-scorecard",
                    kind: "scorecard",
                    label: "Revenue by site",
                    value: "$1.24M",
                    status: "healthy",
                    accent: "communications",
                    span: 6,
                    metrics: [
                        { label: "Maple St", value: "$386k", status: "healthy" },
                        { label: "Lakeside", value: "$341k", status: "healthy" },
                        { label: "Downtown", value: "$298k", status: "warning" },
                        { label: "Riverside", value: "$215k", status: "healthy" },
                    ],
                },
            ],
        },
    ],
};

export const ANALYTICS_SURFACE_FIXTURES: AnalyticsSurfaceFixture[] = [
    EXECUTIVE_PERFORMANCE_FIXTURE,
    OPERATIONAL_INTELLIGENCE_FIXTURE,
    ENROLLMENT_ANALYTICS_FIXTURE,
    FINANCIAL_PERFORMANCE_FIXTURE,
];

/** One card per renderer/composition for the Metric Card Gallery. */
export const METRIC_GALLERY_CARDS: AnalyticsMetricCardFixture[] = [
    { id: "g-kpi", kind: "kpi", label: "Lead count", question: "How much demand?", value: "248", status: "healthy", accent: "enrollment", drill: "Leads", span: 3 },
    { id: "g-trend", kind: "trend", label: "Revenue", value: "$418k", sparklinePoints: [360, 372, 388, 405, 418], status: "healthy", accent: "communications", span: 3 },
    { id: "g-comparison", kind: "comparison", label: "Conversion", value: "38%", deltaPercent: -5, sentiment: "bad", baselineLabel: "target 45%", status: "warning", accent: "amber", span: 3 },
    { id: "g-health", kind: "health", label: "Org health", value: "84", score: 84, status: "healthy", accent: "enrollment", span: 3 },
    { id: "g-breakdown", kind: "breakdown", label: "Response by site", status: "warning", accent: "amber", span: 3, segments: [
        { label: "Maple", value: 1.4, formattedValue: "1.4h", tone: "healthy" },
        { label: "Downtown", value: 6.1, formattedValue: "6.1h", tone: "critical" },
        { label: "Riverside", value: 4.8, formattedValue: "4.8h", tone: "warning" },
    ] },
    { id: "g-scorecard", kind: "scorecard", label: "Enrollment scorecard", value: "Strong", status: "healthy", accent: "enrollment", span: 3, metrics: [
        { label: "Conversion", value: "38%", status: "warning" },
        { label: "Velocity", value: "2.1d", status: "healthy" },
        { label: "Fill", value: "87%", status: "healthy" },
    ] },
    { id: "g-chip", kind: "chip", label: "Needs attention", value: "7", status: "critical" },
];

/** Density ladder — same KPI at compact and standard. */
export const DENSITY_EXAMPLE = {
    label: "Tour conversion",
    question: "Are tours converting?",
    value: "38%",
    status: "warning" as MetricHealthState,
    accent: "amber" as PreviewAccent,
};

export function totalFixtureCardCount(): number {
    return ANALYTICS_SURFACE_FIXTURES.reduce(
        (sum, surface) => sum + surface.zones.reduce((z, zone) => z + zone.cards.length, 0),
        0,
    );
}
