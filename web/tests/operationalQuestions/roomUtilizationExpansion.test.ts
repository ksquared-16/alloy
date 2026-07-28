import { describe, expect, it } from "vitest";
import {
    compilePivotBuilderDraft,
    roomUtilizationPivotDraft,
} from "@/lib/organizationCalculations/pivotBuilder";
import { roomUtilizationPctAst } from "@/lib/organizationCalculations/productCatalog";
import { evaluateOrgCalcExpr } from "@/lib/organizationCalculations/evaluate";
import type { ApprovedInputRef } from "@/lib/organizationCalculations/catalog";
import { evaluateOiOrgCalcHealth } from "@/lib/metrics/oiOrgCalcMeasurements";
import {
    FUTURE_ROOM_CAPACITY_QUESTION_KEY,
    ROOM_UTILIZATION_QUESTION_KEY,
    getOperationalQuestion,
    listOperationalQuestions,
} from "@/lib/operationalQuestions/catalog";
import { EXPANSION_QUESTION_STATUS } from "@/lib/operationalQuestions/canonicalInputAudit";

describe("pivot builder + room utilization", () => {
    it("compiles room utilization draft to occupancy ÷ capacity × 100", () => {
        const ast = compilePivotBuilderDraft(roomUtilizationPivotDraft());
        const product = roomUtilizationPctAst();
        expect(JSON.stringify(ast)).toContain("occupancy.expected");
        expect(JSON.stringify(ast)).toContain("capacity.room_binding.binding");
        expect(JSON.stringify(ast)).toContain('"op":"div"');
        expect(JSON.stringify(product)).toContain("occupancy.expected");
    });

    it("never divides by zero — returns unavailable", () => {
        const ast = compilePivotBuilderDraft(roomUtilizationPivotDraft());
        const inputs = new Map<ApprovedInputRef, { value: number | null; upstreamStatus: "resolved" | "incomplete" }>([
            ["occupancy.expected", { value: 10, upstreamStatus: "resolved" }],
            ["capacity.room_binding.binding", { value: 0, upstreamStatus: "resolved" }],
        ]);
        const result = evaluateOrgCalcExpr(ast, {
            resolveInput: (ref) => {
                const hit = inputs.get(ref);
                return {
                    value: hit?.value ?? null,
                    upstreamStatus: hit?.upstreamStatus ?? "incomplete",
                };
            },
        });
        expect(result.value).toBeNull();
        expect(result.warnings.some((w) => w.code === "div_by_zero" || /zero/i.test(w.message))).toBe(true);
    });

    it("computes utilization percentage when capacity is present", () => {
        const ast = compilePivotBuilderDraft(roomUtilizationPivotDraft());
        const result = evaluateOrgCalcExpr(ast, {
            resolveInput: (ref) => {
                if (ref === "occupancy.expected") return { value: 16, upstreamStatus: "resolved" };
                if (ref === "capacity.room_binding.binding") return { value: 20, upstreamStatus: "resolved" };
                return { value: null, upstreamStatus: "incomplete" };
            },
        });
        expect(result.value).toBe(80);
        expect(result.status).toBe("resolved");
    });

    it("supports healthy range goals (below / on / above)", () => {
        const target = { kind: "rate_range" as const, min: 75, max: 95 };
        const base = {
            id: "o1",
            measurement_id: "m1",
            room_id: "r1",
            room_label: null,
            effective_at: "2026-08-01",
            evaluated_at: new Date().toISOString(),
            calculation_version_id: "v1",
            version_number: 1,
            explanation_summary: [] as string[],
            unavailable_reason: null as string | null,
            provenance: {
                source_type: "organization_calculation" as const,
                calculation_id: "c1",
                calculation_name: "Util",
            },
        };
        expect(
            evaluateOiOrgCalcHealth(
                { ...base, value: 50, availability: "resolved" },
                target,
            ),
        ).toBe("below_goal");
        expect(
            evaluateOiOrgCalcHealth(
                { ...base, value: 82, availability: "resolved" },
                target,
            ),
        ).toBe("on_goal");
        expect(
            evaluateOiOrgCalcHealth(
                { ...base, value: 100, availability: "resolved" },
                target,
            ),
        ).toBe("above_goal");
    });
});

describe("question catalog expansion", () => {
    it("lists Future Room Capacity and Room Utilization only (no deferred placeholders)", () => {
        const keys = listOperationalQuestions().map((q) => q.key);
        expect(keys).toContain(FUTURE_ROOM_CAPACITY_QUESTION_KEY);
        expect(keys).toContain(ROOM_UTILIZATION_QUESTION_KEY);
        expect(keys).not.toContain("program_utilization");
        expect(keys).not.toContain("ratio_risk");
        expect(EXPANSION_QUESTION_STATUS.program_utilization).toBe("deferred");
        expect(EXPANSION_QUESTION_STATUS.ratio_risk).toBe("deferred");
    });

    it("advertises BOS-ready metadata for room utilization", () => {
        const q = getOperationalQuestion(ROOM_UTILIZATION_QUESTION_KEY);
        expect(q?.bos_capability_key).toBe("operational_question_room_utilization");
        expect(q?.goal_kind).toBe("rate_range");
        expect(q?.unit).toBe("percent");
        expect(q?.required_context).toEqual(["organization", "room", "effective_date"]);
    });
});
