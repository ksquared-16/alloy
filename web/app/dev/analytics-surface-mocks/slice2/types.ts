import type { MetricHealthState } from "@/lib/metrics/platform/types";

/**
 * Slice 2 — Analytics Surface composition contracts.
 *
 * These types describe the *grammar* that lets Analytics move beyond KPI tiles:
 * charts, diagnostics, affected work, recommendations, command panels, filters,
 * and deterministic drilldown destinations.
 *
 * Everything here is presentation/preview contract only. No calculation, no API.
 * Drill handlers are fixture-backed in the dev preview; the contract (what a mark
 * resolves to) is what production runtime would honor.
 */

export type Tone = MetricHealthState | "neutral";

/**
 * Deterministic drill destinations. Every meaningful chart mark, table row, or
 * insight resolves to exactly one of these — no chart should dead-end when the
 * underlying data represents operational objects.
 */
export type DrillDestinationKind =
    | "queue" // filtered work queue
    | "records" // affected records panel / list
    | "work_unit" // a specific work unit
    | "business_process" // a business process surface
    | "drawer" // entity drawer / focus panel
    | "report_detail" // report drill row
    | "workflow" // launch an action / workflow
    | "optimization_center"; // open a command/optimization center

export type DrillDestination = {
    kind: DrillDestinationKind;
    /** Operator-facing label, e.g. "Open Downtown lead queue". */
    label: string;
    /** Stable target token (route/key) the runtime would resolve. Fixture-only here. */
    target: string;
    /** Scope carried into the destination (filtered queue / records). */
    scope?: string;
};

/** A single plotted point on a line/area chart. */
export type ChartPoint = {
    x: string;
    y: number;
    /** Display value for the point (axis stays numeric). */
    formatted?: string;
    drill?: DrillDestination;
};

export type ChartSeries = {
    id: string;
    label: string;
    tone?: Tone;
    points: ChartPoint[];
};

/** A categorical bar (single-measure) with an optional drill. */
export type ChartBar = {
    label: string;
    value: number;
    formatted?: string;
    tone?: Tone;
    drill?: DrillDestination;
};

/** A stacked/grouped category: one x-label, multiple keyed segment values. */
export type ChartStackSegment = {
    key: string;
    label: string;
    value: number;
    formatted?: string;
    tone?: Tone;
    drill?: DrillDestination;
};

export type ChartStackCategory = {
    label: string;
    segments: ChartStackSegment[];
};

export type FunnelStage = {
    label: string;
    value: number;
    formatted?: string;
    /** Conversion vs the previous stage, e.g. "79%". */
    conversion?: string;
    tone?: Tone;
    drill?: DrillDestination;
};

export type CohortCell = {
    /** 0–1 intensity used for the heat fill. */
    intensity: number;
    formatted: string;
    tone?: Tone;
    drill?: DrillDestination;
};

export type CohortRow = {
    label: string;
    cells: CohortCell[];
};

export type TableColumn = {
    key: string;
    label: string;
    align?: "left" | "right";
};

export type TableRow = {
    id: string;
    cells: Record<string, string>;
    tone?: Tone;
    drill?: DrillDestination;
};

export type RankedItem = {
    label: string;
    value: number;
    formatted: string;
    tone?: Tone;
    drill?: DrillDestination;
};

/** An affected operational object surfaced from an insight/chart mark. */
export type AffectedWorkItem = {
    id: string;
    /** Primary object label (classroom, family, invoice, schedule, lead…). */
    title: string;
    /** Secondary context line. */
    detail: string;
    /** Status pill value, e.g. "Ratio 1:9 (max 1:8)". */
    badge?: string;
    tone?: Tone;
    drill: DrillDestination;
};

export type Recommendation = {
    id: string;
    title: string;
    rationale: string;
    /** Projected impact statement, e.g. "+6 conversions / mo". */
    projectedImpact?: string;
    tone?: Tone;
    action: DrillDestination;
};

/** A surface-level filter dimension. */
export type FilterDimensionKind =
    | "date_range"
    | "comparison"
    | "location"
    | "room"
    | "program"
    | "age_group"
    | "business_process"
    | "work_unit"
    | "stage"
    | "staff"
    | "account"
    | "category"
    | "aging_bucket"
    | "source";

export type FilterDimension = {
    kind: FilterDimensionKind;
    label: string;
    /** Currently-selected value shown in the bar. */
    value: string;
    /** Options the operator could pick (preview only). */
    options: string[];
};

/** Narrative insight headline for executive summary surfaces. */
export type NarrativeInsight = {
    id: string;
    /** Short signal label, e.g. "Conversion". */
    eyebrow: string;
    /** One-sentence narrative, plain language. */
    headline: string;
    /** Supporting metric value. */
    value?: string;
    /** Delta / movement note. */
    movement?: string;
    tone?: Tone;
    drill?: DrillDestination;
};
