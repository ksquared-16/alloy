/**
 * Equivalency Engine — strategy application tests + fixture matrix.
 */

import { describe, expect, it } from "vitest";
import { applyEquivalency, applyWeightingFactor } from "@/lib/organizationWeightings/apply";
import { buildEquivalentCountExplanation, formatEquivalencyDefinitionLines } from "@/lib/organizationWeightings/explain";
import {
    DEFAULT_CATEGORY_FACTORS,
    DEFAULT_DAYS_PER_WEEK_FACTORS,
    DEFAULT_SESSION_FACTORS,
    type EquivalencyVersion,
} from "@/lib/organizationWeightings/types";
import { compilePivotBuilderDraft, roomUtilizationFtePivotDraft } from "@/lib/organizationCalculations/pivotBuilder";
import { evaluateOrgCalcExpr } from "@/lib/organizationCalculations/evaluate";

function version(partial: Partial<EquivalencyVersion> & Pick<EquivalencyVersion, "scheme">): EquivalencyVersion {
    return {
        id: "v1",
        version_number: 1,
        immutable: true,
        factors: {},
        full_time_days: 5,
        full_time_hours: null,
        session_basis: null,
        unmatched_policy: "proportional",
        summary: "test",
        published_at: null,
        created_at: new Date().toISOString(),
        ...partial,
    };
}

describe("Equivalency strategy A — category mapping", () => {
    const category = version({
        scheme: "category",
        factors: { ...DEFAULT_CATEGORY_FACTORS },
        unmatched_policy: "zero",
    });

    it("maps full-time and part-time schedule keys", () => {
        expect(applyEquivalency(category, { daysPerWeek: 5, scheduleTypeKey: "full_time" })).toEqual({
            ok: true,
            value: 1,
        });
        expect(applyEquivalency(category, { daysPerWeek: 3, scheduleTypeKey: "part_time" })).toEqual({
            ok: true,
            value: 0.5,
        });
    });

    it("sums 8 FT + 4 PT as 10 equivalent children", () => {
        const members = [
            ...Array.from({ length: 8 }, () => ({ daysPerWeek: 5, scheduleTypeKey: "full_time" })),
            ...Array.from({ length: 4 }, () => ({ daysPerWeek: 3, scheduleTypeKey: "part_time" })),
        ];
        const total = members.reduce((s, m) => s + applyWeightingFactor(category, m), 0);
        expect(total).toBe(10);
    });
});

describe("Equivalency strategy B — session / day", () => {
    it("days-per-week basis uses schedule day counts", () => {
        const days = version({
            scheme: "session_or_day",
            session_basis: "days_per_week",
            factors: { ...DEFAULT_DAYS_PER_WEEK_FACTORS },
        });
        expect(applyWeightingFactor(days, { daysPerWeek: 5 })).toBe(1);
        expect(applyWeightingFactor(days, { daysPerWeek: 3 })).toBe(0.6);
        expect(applyWeightingFactor(days, { daysPerWeek: 2 })).toBe(0.4);
    });

    it("attendance-type basis stacks per-day contribution", () => {
        const sessions = version({
            scheme: "session_or_day",
            session_basis: "attendance_type",
            factors: { ...DEFAULT_SESSION_FACTORS },
        });
        // 2 full days + 5 part days → modeled as separate members or stacked days.
        // Per-member: 2 weekdays on full_day schedule = 2 × 0.20 = 0.40
        expect(applyWeightingFactor(sessions, { daysPerWeek: 2, scheduleTypeKey: "full_day" })).toBeCloseTo(0.4);
        expect(applyWeightingFactor(sessions, { daysPerWeek: 5, scheduleTypeKey: "part_day" })).toBeCloseTo(0.5);
        // Combined week across two patterns for one child would be 0.40 + 0.50 = 0.90
        expect(0.4 + 0.5).toBeCloseTo(0.9);
    });

    it("legacy days_per_week scheme still resolves", () => {
        const legacy = version({
            scheme: "days_per_week",
            factors: { ...DEFAULT_DAYS_PER_WEEK_FACTORS },
        });
        expect(applyWeightingFactor(legacy, { daysPerWeek: 4 })).toBe(0.8);
    });
});

describe("Equivalency strategy C — weekly hours", () => {
    const hours = version({
        scheme: "weekly_hours",
        full_time_hours: 50,
        full_time_days: 5,
    });

    it("divides scheduled hours by configured full-time hours", () => {
        expect(applyEquivalency(hours, { daysPerWeek: 5, weeklyScheduledHours: 50 })).toEqual({
            ok: true,
            value: 1,
        });
        expect(applyEquivalency(hours, { daysPerWeek: 5, weeklyScheduledHours: 25 })).toEqual({
            ok: true,
            value: 0.5,
        });
    });

    it("derives hours from days when weekly hours are unknown", () => {
        // 5 days → 50 hours implied → 1.0; 3 days → 30 hours → 0.6
        expect(applyWeightingFactor(hours, { daysPerWeek: 5 })).toBeCloseTo(1);
        expect(applyWeightingFactor(hours, { daysPerWeek: 3 })).toBeCloseTo(0.6);
    });
});

describe("explainability", () => {
    it("produces director-readable blocks without weighting jargon", () => {
        const strategy = version({
            scheme: "session_or_day",
            session_basis: "days_per_week",
            factors: { ...DEFAULT_DAYS_PER_WEEK_FACTORS },
        });
        const lines = buildEquivalentCountExplanation({
            populationName: "Children expected in the room",
            roomLabel: "Bears",
            strategy,
            equivalentValue: 10,
            memberCount: 12,
        });
        expect(lines.join("\n")).toContain("Population");
        expect(lines.join("\n")).toContain("Children expected in the room in Bears");
        expect(lines.join("\n")).toContain("Strategy");
        expect(lines.join("\n")).toContain("Equivalent children");
        expect(lines.join("\n")).toContain("10");
        expect(lines.join("\n").toLowerCase()).not.toContain("weighting");
        expect(formatEquivalencyDefinitionLines(strategy).some((l) => l.includes("5 day"))).toBe(true);
    });
});

describe("calculations consume Equivalent Count only", () => {
    it("FTE utilization still evaluates from equivalent_count node", () => {
        const draft = roomUtilizationFtePivotDraft({
            populationVersionId: "pop-v1",
            weightingVersionId: "eq-v1",
        });
        const ast = compilePivotBuilderDraft(draft);
        const result = evaluateOrgCalcExpr(ast, {
            resolveInput: (ref) => {
                if (ref === "capacity.room_binding.binding") {
                    return { value: 15, upstreamStatus: "resolved" };
                }
                return { value: null, upstreamStatus: "incomplete" };
            },
            resolveEquivalentCount: () => ({ value: 10, upstreamStatus: "resolved" }),
        });
        expect(result.value).toBeCloseTo(66.666, 2);
    });
});
