/**
 * Card 6 — test/demo fixtures for placement_forecast_v1 metadata hooks.
 */

import type { PlacementCandidateForecastV1 } from "@/lib/orchestration/placement/placementForecastFactContract";

export const PLACEMENT_FORECAST_FIXTURE_OPENING_SOON: PlacementCandidateForecastV1 = {
    schema_version: 1,
    expected_openings_count: 1,
    projected_opening_window: "2026-09",
    forecast_confidence: "medium",
    forecast_source: "manual",
};

export const PLACEMENT_FORECAST_FIXTURE_HIGH_DEMAND: PlacementCandidateForecastV1 = {
    schema_version: 1,
    projected_capacity_pressure: "high",
    expected_transition_count: 3,
    forecast_source: "manual",
};

export const PLACEMENT_FORECAST_FIXTURE_FALL_OPENING: PlacementCandidateForecastV1 = {
    schema_version: 1,
    expected_openings_count: 2,
    projected_opening_window: "fall_2026",
    forecast_earliest_start_date: "2026-09-01",
    forecast_confidence: "high",
    forecast_source: "age_transition",
};

export function placementForecastMetadataFixture(
    forecast: PlacementCandidateForecastV1
): Record<string, unknown> {
    return { placement_forecast_v1: forecast };
}
