/**
 * Card 6 — optional waitlist forecast facts (informational hooks only).
 * No capacity engine; facts do not affect ordering unless a future profile opts in.
 */

export const PLACEMENT_FORECAST_FACT_EXPECTED_OPENINGS_COUNT = "expected_openings_count" as const;
export const PLACEMENT_FORECAST_FACT_EXPECTED_TRANSITION_COUNT = "expected_transition_count" as const;
export const PLACEMENT_FORECAST_FACT_PROJECTED_OPENING_WINDOW = "projected_opening_window" as const;
export const PLACEMENT_FORECAST_FACT_PROJECTED_CAPACITY_PRESSURE = "projected_capacity_pressure" as const;
export const PLACEMENT_FORECAST_FACT_SIBLING_ALIGNMENT_WINDOW = "sibling_alignment_window" as const;
export const PLACEMENT_FORECAST_FACT_ESTIMATED_WAIT_WINDOW_DAYS = "estimated_wait_window_days" as const;

/** Architecture-reserved keys (metadata / future capacity service). */
export const PLACEMENT_FORECAST_FACT_EARLIEST_START_DATE = "forecast_earliest_start_date" as const;
export const PLACEMENT_FORECAST_FACT_CONFIDENCE = "forecast_confidence" as const;
export const PLACEMENT_FORECAST_FACT_SOURCE = "forecast_source" as const;
export const PLACEMENT_FORECAST_FACT_ACCEPTED_NOT_STARTED = "accepted_not_started" as const;
export const PLACEMENT_FORECAST_FACT_TEMPORARY_HOLD_UNTIL = "temporary_hold_until" as const;

export const PLACEMENT_FORECAST_FACT_KEYS = [
    PLACEMENT_FORECAST_FACT_EXPECTED_OPENINGS_COUNT,
    PLACEMENT_FORECAST_FACT_EXPECTED_TRANSITION_COUNT,
    PLACEMENT_FORECAST_FACT_PROJECTED_OPENING_WINDOW,
    PLACEMENT_FORECAST_FACT_PROJECTED_CAPACITY_PRESSURE,
    PLACEMENT_FORECAST_FACT_SIBLING_ALIGNMENT_WINDOW,
    PLACEMENT_FORECAST_FACT_ESTIMATED_WAIT_WINDOW_DAYS,
    PLACEMENT_FORECAST_FACT_EARLIEST_START_DATE,
    PLACEMENT_FORECAST_FACT_CONFIDENCE,
    PLACEMENT_FORECAST_FACT_SOURCE,
    PLACEMENT_FORECAST_FACT_ACCEPTED_NOT_STARTED,
    PLACEMENT_FORECAST_FACT_TEMPORARY_HOLD_UNTIL,
] as const;

export type PlacementForecastConfidence = "high" | "medium" | "low" | "unknown";

export type PlacementCapacityPressure = "low" | "moderate" | "high";

/** JSON stored on placement_candidates.metadata.placement_forecast_v1 (hooks only — no DDL). */
export type PlacementCandidateForecastV1 = {
    schema_version?: 1;
    expected_openings_count?: number | null;
    expected_transition_count?: number | null;
    projected_opening_window?: string | null;
    projected_capacity_pressure?: PlacementCapacityPressure | null;
    sibling_alignment_window?: string | null;
    estimated_wait_window_days?: number | null;
    forecast_earliest_start_date?: string | null;
    forecast_confidence?: PlacementForecastConfidence | null;
    forecast_source?: string | null;
    accepted_not_started?: boolean | null;
    temporary_hold_until?: string | null;
    /** Optional operator-facing hint override (otherwise derived). */
    ui_hint?: string | null;
};

export type PlacementForecastFactsProviderInput = {
    candidateMetadata?: Record<string, unknown> | null;
    opportunityMetadata?: Record<string, unknown> | null;
};
