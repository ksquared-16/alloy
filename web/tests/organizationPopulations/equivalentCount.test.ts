import { describe, expect, it } from "vitest";
import { applyWeightingFactor } from "@/lib/organizationWeightings/apply";
import { DEFAULT_DAYS_PER_WEEK_FACTORS } from "@/lib/organizationWeightings/types";
import {
    compilePivotBuilderDraft,
    equivalentChildCountPivotDraft,
    roomUtilizationFtePivotDraft,
} from "@/lib/organizationCalculations/pivotBuilder";
import { evaluateOrgCalcExpr } from "@/lib/organizationCalculations/evaluate";
import { parseAndValidateOrgCalcExpr } from "@/lib/organizationCalculations/ast";
import {
    EQUIVALENT_CHILD_COUNT_QUESTION_KEY,
    ROOM_UTILIZATION_FTE_QUESTION_KEY,
    listOperationalQuestions,
} from "@/lib/operationalQuestions/catalog";
import { collectEquivalentCountBindings } from "@/lib/organizationPopulations/equivalentCount";

describe("weighting factors", () => {
    const fte = {
        id: "v1",
        version_number: 1,
        immutable: true,
        scheme: "days_per_week" as const,
        factors: { ...DEFAULT_DAYS_PER_WEEK_FACTORS },
        full_time_days: 5,
        summary: "fte",
        published_at: null,
        created_at: new Date().toISOString(),
    };

    it("maps 5-day to 1.0 and 3-day to 0.6", () => {
        expect(applyWeightingFactor(fte, { daysPerWeek: 5 })).toBe(1);
        expect(applyWeightingFactor(fte, { daysPerWeek: 3 })).toBe(0.6);
        expect(applyWeightingFactor(fte, { daysPerWeek: 4 })).toBe(0.8);
    });

    it("sums 8 FT + 4 PT as 10 FTE", () => {
        const members = [
            ...Array.from({ length: 8 }, () => ({ daysPerWeek: 5 })),
            ...Array.from({ length: 4 }, () => ({ daysPerWeek: 3 })), // 0.5 would be PT half — use 2.5→ wait
        ];
        // Charter example: 8 FT + 4 PT(0.5) = 10. Our days map uses 3-day=0.6.
        // Explicit 0.5 part-time via unweighted*custom: treat PT as 0.5 days factor override.
        const ptHalf = {
            ...fte,
            factors: { ...DEFAULT_DAYS_PER_WEEK_FACTORS, "3": 0.5, "2": 0.5, "1": 0.5 },
        };
        const total =
            members.slice(0, 8).reduce((s, m) => s + applyWeightingFactor(fte, m), 0)
            + members.slice(8).reduce((s, m) => s + applyWeightingFactor(ptHalf, m), 0);
        // 8*1 + 4*0.5 = 10
        expect(total).toBe(10);
    });
});

describe("equivalent count AST", () => {
    it("compiles FTE utilization and evaluates with injected resolver", () => {
        const draft = roomUtilizationFtePivotDraft({
            populationVersionId: "pop-v1",
            weightingVersionId: "wgt-v1",
        });
        const ast = compilePivotBuilderDraft(draft);
        const parsed = parseAndValidateOrgCalcExpr(ast);
        expect(parsed.ok).toBe(true);
        expect(collectEquivalentCountBindings(ast)).toEqual([
            { populationVersionId: "pop-v1", weightingVersionId: "wgt-v1" },
        ]);

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

    it("compiles standalone equivalent child count", () => {
        const ast = compilePivotBuilderDraft(
            equivalentChildCountPivotDraft({
                populationVersionId: "pop-v1",
                weightingVersionId: "wgt-v1",
            }),
        );
        const result = evaluateOrgCalcExpr(ast, {
            resolveInput: () => ({ value: null, upstreamStatus: "incomplete" }),
            resolveEquivalentCount: () => ({ value: 10, upstreamStatus: "resolved" }),
        });
        expect(result.value).toBe(10);
    });
});

describe("question catalog populations batch", () => {
    it("includes FTE utilization and equivalent child count", () => {
        const keys = listOperationalQuestions().map((q) => q.key);
        expect(keys).toContain(ROOM_UTILIZATION_FTE_QUESTION_KEY);
        expect(keys).toContain(EQUIVALENT_CHILD_COUNT_QUESTION_KEY);
    });
});
