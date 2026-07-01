import { describe, expect, it } from "vitest";

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
    OPTIMIZATION_FILTERS,
    RATIO_RECOMMENDATIONS,
    RESPONSE_TIME_BARS,
    RETENTION_COHORT_ROWS,
    REVENUE_LINE,
    STAFFING_GROUPED,
} from "@/app/dev/analytics-surface-mocks/slice2/fixtures";
import { SLICE2_SURFACES } from "@/app/dev/analytics-surface-mocks/slice2/surfaces";
import { DRILL_META } from "@/app/dev/analytics-surface-mocks/slice2/tokens";
import type { DrillDestination, FilterDimension } from "@/app/dev/analytics-surface-mocks/slice2/types";

function isValidDrill(d: DrillDestination): boolean {
    return Boolean(d && d.kind in DRILL_META && d.label.length > 0 && d.target.length > 0);
}

function filterKinds(dims: FilterDimension[]): Set<string> {
    return new Set(dims.map((d) => d.kind));
}

describe("Analytics Slice 2 — surfaces", () => {
    it("registers the six richer surfaces beyond KPI tiles", () => {
        expect(SLICE2_SURFACES.map((s) => s.id)).toEqual([
            "executive-summary",
            "diagnostic-conversion",
            "command-center",
            "optimization-center",
            "financial-report",
            "chart-gallery",
        ]);
        for (const s of SLICE2_SURFACES) {
            expect(typeof s.Component).toBe("function");
            expect(s.label.length).toBeGreaterThan(0);
        }
    });
});

describe("Analytics Slice 2 — filter context is surface-aware", () => {
    it("executive defaults to organization/location/date", () => {
        const kinds = filterKinds(EXECUTIVE_FILTERS);
        expect(kinds.has("date_range")).toBe(true);
        expect(kinds.has("location")).toBe(true);
    });

    it("enrollment includes program/stage/source", () => {
        const kinds = filterKinds(ENROLLMENT_FILTERS);
        for (const k of ["location", "program", "stage", "source", "date_range"]) {
            expect(kinds.has(k)).toBe(true);
        }
    });

    it("financial includes account/aging bucket", () => {
        const kinds = filterKinds(FINANCIAL_FILTERS);
        expect(kinds.has("account")).toBe(true);
        expect(kinds.has("aging_bucket")).toBe(true);
    });

    it("optimization includes room/staff", () => {
        const kinds = filterKinds(OPTIMIZATION_FILTERS);
        expect(kinds.has("room")).toBe(true);
        expect(kinds.has("staff")).toBe(true);
    });

    it("every filter dimension's value is one of its options", () => {
        for (const dims of [EXECUTIVE_FILTERS, ENROLLMENT_FILTERS, FINANCIAL_FILTERS, OPTIMIZATION_FILTERS]) {
            for (const d of dims) {
                expect(d.options.length).toBeGreaterThan(0);
                expect(d.options).toContain(d.value);
            }
        }
    });
});

describe("Analytics Slice 2 — drill grammar has no dead-ends", () => {
    it("every chart bar resolves to a deterministic drill destination", () => {
        for (const bar of [...RESPONSE_TIME_BARS, ...AR_AGING_BARS]) {
            expect(bar.drill && isValidDrill(bar.drill)).toBe(true);
        }
    });

    it("every line point drills to a period/report", () => {
        for (const series of REVENUE_LINE) {
            for (const p of series.points) {
                expect(p.drill && isValidDrill(p.drill)).toBe(true);
            }
        }
    });

    it("every stacked/grouped segment drills", () => {
        for (const cat of [...CONVERSION_BY_SITE_STACK, ...STAFFING_GROUPED]) {
            for (const seg of cat.segments) {
                expect(seg.drill && isValidDrill(seg.drill)).toBe(true);
            }
        }
    });

    it("every funnel stage and cohort cell drills", () => {
        for (const stage of ENROLLMENT_FUNNEL) {
            expect(stage.drill && isValidDrill(stage.drill)).toBe(true);
        }
        for (const row of RETENTION_COHORT_ROWS) {
            for (const cell of row.cells) {
                expect(cell.drill && isValidDrill(cell.drill)).toBe(true);
            }
        }
    });

    it("affected work, recommendations, and commands all carry valid destinations", () => {
        for (const items of Object.values(FAMILIES_STUCK_BY_SITE)) {
            for (const item of items) expect(isValidDrill(item.drill)).toBe(true);
        }
        for (const item of COMMAND_CENTER_AFFECTED) expect(isValidDrill(item.drill)).toBe(true);
        for (const rec of [...CONVERSION_RECOMMENDATIONS, ...RATIO_RECOMMENDATIONS]) {
            expect(isValidDrill(rec.action)).toBe(true);
        }
        for (const cmd of [...CONVERSION_COMMANDS, ...COMMAND_CENTER_COMMANDS]) {
            expect(isValidDrill(cmd)).toBe(true);
        }
        for (const q of COMMAND_CENTER_QUEUES) expect(q.drill && isValidDrill(q.drill)).toBe(true);
    });

    it("at least one interaction goes chart → affected work (scope matches a site)", () => {
        const lostSegments = CONVERSION_BY_SITE_STACK.flatMap((c) => c.segments).filter((s) => s.key === "lost");
        const sitesWithAffected = lostSegments.filter((s) => s.drill?.scope && FAMILIES_STUCK_BY_SITE[s.drill.scope]);
        expect(sitesWithAffected.length).toBeGreaterThan(0);
    });

    it("at least one interaction goes chart → queue/workflow/optimization", () => {
        const kinds = new Set([
            ...CONVERSION_COMMANDS.map((c) => c.kind),
            ...COMMAND_CENTER_COMMANDS.map((c) => c.kind),
        ]);
        expect(kinds.has("queue") || kinds.has("workflow") || kinds.has("optimization_center")).toBe(true);
    });
});

describe("Analytics Slice 2 — executive narrative is prose, not tiles", () => {
    it("each insight has a sentence-length narrative headline", () => {
        for (const insight of EXECUTIVE_NARRATIVE) {
            expect(insight.headline.length).toBeGreaterThan(40);
            expect(insight.eyebrow.length).toBeGreaterThan(0);
        }
    });
});
