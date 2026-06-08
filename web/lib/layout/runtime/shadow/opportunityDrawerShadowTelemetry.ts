/**
 * C1a — opportunity drawer layout runtime shadow telemetry (client-safe).
 *
 * Slim summary derived from RealRecordShadowValidationReport for logging and
 * optional diagnostics. Never includes raw record payloads or operator-forbidden ids.
 */

import type { RealRecordShadowValidationReport } from "./drawerStructureSnapshot";

export type OpportunityDrawerShadowTelemetry = {
    opportunityId: string;
    parityScore: number;
    readinessLevel: string;
    fieldCoveragePercent: number;
    layoutSource?: string;
    layoutKey?: string;
    summary: string;
    missingSections: string[];
    missingFields: string[];
    extraLayoutItems: string[];
    topGaps: Array<{ impact: string; category: string; key: string; detail: string }>;
    composeMs?: number;
    evaluatedAt: string;
};

export function buildOpportunityDrawerShadowTelemetry(
    report: RealRecordShadowValidationReport,
    options: { composeMs?: number } = {},
): OpportunityDrawerShadowTelemetry {
    const missingSections = report.mismatches
        .filter((m) => m.category.includes("section") && m.category.includes("missing_in_layout"))
        .map((m) => m.vmKey ?? m.vmPath ?? m.category)
        .slice(0, 12);

    const missingFields = report.mismatches
        .filter((m) => m.category.includes("field") && m.category.includes("missing_in_layout"))
        .map((m) => m.vmKey ?? m.vmPath ?? m.category)
        .slice(0, 20);

    const extraLayoutItems = [...(report.extra ?? []), ...(report.missingCoverage?.layoutOnly ?? [])].slice(0, 20);

    return {
        opportunityId: report.recordId ?? report.opportunityId ?? "",
        parityScore: report.parityScore,
        readinessLevel: report.readiness.level,
        fieldCoveragePercent: report.coverage.fields.percent,
        layoutSource: report.layoutSource,
        layoutKey: report.layoutKey,
        summary: report.summary,
        missingSections,
        missingFields,
        extraLayoutItems,
        topGaps: report.topGaps.slice(0, 6).map((g) => ({
            impact: g.impact,
            category: g.category,
            key: g.key,
            detail: g.detail,
        })),
        composeMs: options.composeMs,
        evaluatedAt: new Date().toISOString(),
    };
}

/** Console telemetry hook — non-blocking, swallow-safe. */
export function logOpportunityDrawerShadowTelemetry(telemetry: OpportunityDrawerShadowTelemetry): void {
    if (typeof console === "undefined" || typeof console.info !== "function") return;
    console.info("[layout_runtime_shadow:opportunity_drawer]", telemetry);
}
