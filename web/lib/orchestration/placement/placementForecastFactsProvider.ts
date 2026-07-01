/**
 * Card 6 — resolve optional forecast metadata into evaluator facts + UI hints.
 * Provider hook for future capacity / graduation pipelines (no engine in Phase 2).
 */

import {
    PLACEMENT_FORECAST_FACT_ACCEPTED_NOT_STARTED,
    PLACEMENT_FORECAST_FACT_CONFIDENCE,
    PLACEMENT_FORECAST_FACT_EARLIEST_START_DATE,
    PLACEMENT_FORECAST_FACT_ESTIMATED_WAIT_WINDOW_DAYS,
    PLACEMENT_FORECAST_FACT_EXPECTED_OPENINGS_COUNT,
    PLACEMENT_FORECAST_FACT_EXPECTED_TRANSITION_COUNT,
    PLACEMENT_FORECAST_FACT_KEYS,
    PLACEMENT_FORECAST_FACT_PROJECTED_CAPACITY_PRESSURE,
    PLACEMENT_FORECAST_FACT_PROJECTED_OPENING_WINDOW,
    PLACEMENT_FORECAST_FACT_SIBLING_ALIGNMENT_WINDOW,
    PLACEMENT_FORECAST_FACT_SOURCE,
    PLACEMENT_FORECAST_FACT_TEMPORARY_HOLD_UNTIL,
    type PlacementCandidateForecastV1,
    type PlacementForecastFactsProviderInput,
} from "@/lib/orchestration/placement/placementForecastFactContract";
import type { FactBag, FactValue } from "@/lib/orchestration/placement/placementPriorityTypes";

const METADATA_KEY = "placement_forecast_v1";

function factUnknown(source: string): FactValue {
    return { presence: "unknown", source };
}

function factPresent(value: string | number | boolean, source: string): FactValue {
    return { presence: "present", value, source };
}

function factOptionalString(raw: unknown, source: string): FactValue {
    if (raw == null) return factUnknown(source);
    const t = String(raw).trim();
    if (!t) return factUnknown(source);
    return factPresent(t, source);
}

function factOptionalNumber(raw: unknown, source: string): FactValue {
    if (raw == null || raw === "") return factUnknown(source);
    const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
    if (!Number.isFinite(n)) return factUnknown(source);
    return factPresent(n, source);
}

function factOptionalBoolean(raw: unknown, source: string): FactValue {
    if (raw === true || raw === false) return factPresent(raw, source);
    return factUnknown(source);
}

function readForecastBlob(metadata: Record<string, unknown> | null | undefined): unknown {
    if (!metadata || typeof metadata !== "object") return null;
    return metadata[METADATA_KEY] ?? null;
}

/** Parse forecast JSON from candidate metadata (candidate wins over opportunity). */
export function resolvePlacementCandidateForecast(
    input: PlacementForecastFactsProviderInput
): PlacementCandidateForecastV1 | null {
    const raw =
        readForecastBlob(input.candidateMetadata ?? null) ??
        readForecastBlob(input.opportunityMetadata ?? null);
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    return raw as PlacementCandidateForecastV1;
}

/** Default fact bag entries for forecast keys — all unknown until provider supplies data. */
export function buildDefaultPlacementForecastFacts(source = "placement_forecast.none"): FactBag {
    const out: FactBag = {};
    for (const key of PLACEMENT_FORECAST_FACT_KEYS) {
        out[key] = factUnknown(source);
    }
    return out;
}

/** Merge resolved forecast into an evaluator fact bag (informational; not used in default profiles). */
export function mergePlacementForecastIntoFactBag(
    facts: FactBag,
    forecast: PlacementCandidateForecastV1 | null
): FactBag {
    const base = { ...facts, ...buildDefaultPlacementForecastFacts() };
    if (!forecast) return base;

    const source = `placement_candidates.metadata.${METADATA_KEY}`;
    return {
        ...base,
        [PLACEMENT_FORECAST_FACT_EXPECTED_OPENINGS_COUNT]: factOptionalNumber(
            forecast.expected_openings_count,
            source
        ),
        [PLACEMENT_FORECAST_FACT_EXPECTED_TRANSITION_COUNT]: factOptionalNumber(
            forecast.expected_transition_count,
            source
        ),
        [PLACEMENT_FORECAST_FACT_PROJECTED_OPENING_WINDOW]: factOptionalString(
            forecast.projected_opening_window,
            source
        ),
        [PLACEMENT_FORECAST_FACT_PROJECTED_CAPACITY_PRESSURE]: factOptionalString(
            forecast.projected_capacity_pressure,
            source
        ),
        [PLACEMENT_FORECAST_FACT_SIBLING_ALIGNMENT_WINDOW]: factOptionalString(
            forecast.sibling_alignment_window,
            source
        ),
        [PLACEMENT_FORECAST_FACT_ESTIMATED_WAIT_WINDOW_DAYS]: factOptionalNumber(
            forecast.estimated_wait_window_days,
            source
        ),
        [PLACEMENT_FORECAST_FACT_EARLIEST_START_DATE]: factOptionalString(
            forecast.forecast_earliest_start_date,
            source
        ),
        [PLACEMENT_FORECAST_FACT_CONFIDENCE]: factOptionalString(forecast.forecast_confidence, source),
        [PLACEMENT_FORECAST_FACT_SOURCE]: factOptionalString(forecast.forecast_source, source),
        [PLACEMENT_FORECAST_FACT_ACCEPTED_NOT_STARTED]: factOptionalBoolean(
            forecast.accepted_not_started,
            source
        ),
        [PLACEMENT_FORECAST_FACT_TEMPORARY_HOLD_UNTIL]: factOptionalString(
            forecast.temporary_hold_until,
            source
        ),
    };
}

/**
 * Derive at most one subtle queue hint from forecast metadata.
 * Informational only — does not affect ordering.
 */
export function buildPlacementForecastUiHints(forecast: PlacementCandidateForecastV1 | null): string[] {
    if (!forecast) return [];

    const explicit = forecast.ui_hint?.trim();
    if (explicit) return [explicit];

    if (forecast.projected_capacity_pressure === "high") {
        return ["High demand cohort"];
    }

    const openings =
        typeof forecast.expected_openings_count === "number" && forecast.expected_openings_count > 0;
    if (openings) {
        const windowRaw = [
            forecast.projected_opening_window,
            forecast.forecast_earliest_start_date,
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        if (windowRaw.includes("fall")) {
            return ["Likely fall opening"];
        }
        return ["Expected opening soon"];
    }

    return [];
}

/** Structured preview for row projection / BOS (no ordering fields). */
export function buildPlacementForecastPreview(forecast: PlacementCandidateForecastV1 | null): {
    forecast_hints: string[];
    forecast_facts_present: string[];
} {
    if (!forecast) {
        return { forecast_hints: [], forecast_facts_present: [] };
    }
    const hints = buildPlacementForecastUiHints(forecast);
    const present: string[] = [];
    if (typeof forecast.expected_openings_count === "number") {
        present.push(PLACEMENT_FORECAST_FACT_EXPECTED_OPENINGS_COUNT);
    }
    if (typeof forecast.expected_transition_count === "number") {
        present.push(PLACEMENT_FORECAST_FACT_EXPECTED_TRANSITION_COUNT);
    }
    if (forecast.projected_opening_window?.trim()) {
        present.push(PLACEMENT_FORECAST_FACT_PROJECTED_OPENING_WINDOW);
    }
    if (forecast.projected_capacity_pressure) {
        present.push(PLACEMENT_FORECAST_FACT_PROJECTED_CAPACITY_PRESSURE);
    }
    if (forecast.sibling_alignment_window?.trim()) {
        present.push(PLACEMENT_FORECAST_FACT_SIBLING_ALIGNMENT_WINDOW);
    }
    if (typeof forecast.estimated_wait_window_days === "number") {
        present.push(PLACEMENT_FORECAST_FACT_ESTIMATED_WAIT_WINDOW_DAYS);
    }
    return { forecast_hints: hints, forecast_facts_present: present };
}
