import { notFound } from "next/navigation";

import AnalyticsSurfaceMocksGallery from "./AnalyticsSurfaceMocksGallery";

/**
 * Dev-only preview of the Analytics / Operational Intelligence surfaces.
 *
 * Slice 1/1.5 proved the Metric Card Language (KPI · Trend · Comparison · Health ·
 * Breakdown · Scorecard · Chip) and header density. Slice 2 expands the preview
 * beyond KPI tiles into true Analytics surfaces that support the full loop —
 * Measure → Understand → Decide → Act → Measure again:
 *   • Executive Summary (narrative insights, not tiles)
 *   • Diagnostic + Affected Work (interactive chart → affected work drilldown)
 *   • Operational Command Center
 *   • Ratio / Labor Optimization Center
 *   • Financial Report / output surface
 *   • Chart Gallery (line, bar w/ axes, grouped/stacked, funnel, cohort, table,
 *     ranked list) with a surface-aware Analytics Context Filter Bar and
 *     deterministic drill destinations.
 *
 * Static fixtures only — no API, no OIP calculation. Disabled in production (404).
 *
 * @see docs/sprints/06_2026/analytics-operational-intelligence-platform
 */
export default function AnalyticsSurfaceMocksPage() {
    if (process.env.NODE_ENV === "production") {
        notFound();
    }
    return <AnalyticsSurfaceMocksGallery />;
}
