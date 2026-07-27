import { describe, expect, it } from "vitest";
import {
    parseAndValidateOrgCalcExpr,
    provingMinPhysicalLicensedAst,
} from "@/lib/organizationCalculations/ast";
import { extractDependencyRefs } from "@/lib/organizationCalculations/dependencies";
import { evaluateOrgCalcExpr } from "@/lib/organizationCalculations/evaluate";
import {
    projectCapacityRoomBindingInputs,
    resolveInputFromCapacityProjection,
} from "@/lib/organizationCalculations/capacityProjection";
import { evaluateOrgCalcAstAgainstCapacityProjection } from "@/lib/organizationCalculations/evaluateForRoom";
import type { CapacityConfig } from "@/lib/childcareOperational/capacity/resolveOperationalCapacity";
import type {
    ChildcareCapacityRuleRow,
    ChildcareRatioRuleRow,
    ChildcareRatioRuleTierRow,
} from "@/lib/childcareOperational/config/configRuleTypes";

const SITE = "site-1";
const ROOM = "room-1";
const AT = "2026-06-01";

function capRule(partial: Partial<ChildcareCapacityRuleRow>): ChildcareCapacityRuleRow {
    return {
        id: partial.id ?? "cap-1",
        org_id: "org-1",
        scope_type: "room",
        site_location_id: null,
        program_category_id: null,
        room_location_id: ROOM,
        age_group_key: null,
        capacity_kind: "physical",
        capacity: 20,
        source_key: "config",
        effective_start: "2026-01-01",
        effective_end: null,
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...partial,
    };
}

function ratioRule(partial: Partial<ChildcareRatioRuleRow> = {}): ChildcareRatioRuleRow {
    return {
        id: partial.id ?? "ratio-1",
        org_id: "org-1",
        scope_type: "room",
        site_location_id: null,
        program_category_id: null,
        room_location_id: ROOM,
        age_group_key: null,
        jurisdiction_key: null,
        source_key: "config",
        effective_start: "2026-01-01",
        effective_end: null,
        metadata: {},
        created_by: null,
        updated_by: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...partial,
    };
}

function tier(ruleId: string, maxChildren: number, requiredStaff: number): ChildcareRatioRuleTierRow {
    return {
        id: `tier-${ruleId}-${maxChildren}`,
        org_id: "org-1",
        ratio_rule_id: ruleId,
        max_children: maxChildren,
        required_staff: requiredStaff,
        sort_order: 0,
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

describe("organizationCalculations AST validation", () => {
    it("accepts the proving min(physical, licensed) AST", () => {
        const parsed = parseAndValidateOrgCalcExpr(provingMinPhysicalLicensedAst());
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(extractDependencyRefs(parsed.expr)).toEqual([
            "capacity.room_binding.licensed",
            "capacity.room_binding.physical",
        ]);
    });

    it("rejects unknown input refs", () => {
        const parsed = parseAndValidateOrgCalcExpr({
            kind: "input",
            ref: "capacity.room_binding.made_up",
        });
        expect(parsed.ok).toBe(false);
        if (parsed.ok) return;
        expect(parsed.issues.some((i) => i.code === "unknown_input_ref")).toBe(true);
    });

    it("rejects unsupported ops and empty min", () => {
        expect(parseAndValidateOrgCalcExpr({ kind: "binary", op: "pow", left: { kind: "const", value: 1 }, right: { kind: "const", value: 2 } }).ok).toBe(
            false,
        );
        expect(parseAndValidateOrgCalcExpr({ kind: "call", fn: "min", args: [] }).ok).toBe(false);
    });
});

describe("organizationCalculations evaluator", () => {
    it("evaluates min of constants", () => {
        const result = evaluateOrgCalcExpr(
            {
                kind: "call",
                fn: "min",
                args: [
                    { kind: "const", value: 20 },
                    { kind: "const", value: 15 },
                ],
            },
            { resolveInput: () => ({ value: null }) },
        );
        expect(result.value).toBe(15);
        expect(result.status).toBe("resolved");
        expect(result.explanation.length).toBeGreaterThan(0);
    });

    it("never coerces missing licensed to 0", () => {
        const result = evaluateOrgCalcExpr(provingMinPhysicalLicensedAst(), {
            resolveInput: (ref) =>
                ref === "capacity.room_binding.physical" ?
                    { value: 20, upstreamStatus: "partial" }
                :   { value: null, upstreamStatus: "incomplete", note: "licensed unknown" },
        });
        expect(result.value).toBe(20); // min of known values only
        expect(result.status).not.toBe("resolved");
        expect(result.warnings.some((w) => w.code === "input_unknown")).toBe(true);
    });

    it("div by zero yields unknown", () => {
        const result = evaluateOrgCalcExpr(
            {
                kind: "binary",
                op: "div",
                left: { kind: "const", value: 10 },
                right: { kind: "const", value: 0 },
            },
            { resolveInput: () => ({ value: null }) },
        );
        expect(result.value).toBeNull();
        expect(result.warnings.some((w) => w.code === "div_by_zero")).toBe(true);
    });
});

describe("organizationCalculations capacity projection parity", () => {
    const config: CapacityConfig = {
        capacityRules: [
            capRule({ id: "phys", capacity_kind: "physical", capacity: 20 }),
            capRule({ id: "lic", capacity_kind: "licensed", capacity: 15 }),
            capRule({ id: "op", capacity_kind: "operational", capacity: 18 }),
        ],
        ratioRules: [ratioRule({ id: "r" })],
        ratioRuleTiers: [tier("r", 12, 1)],
    };

    const params = {
        orgId: "org-1",
        locationId: SITE,
        siteLocationId: SITE,
        roomLocationId: ROOM,
        effectiveAt: AT,
    };

    it("min(physical, licensed) matches hand computation from projections", () => {
        const projection = projectCapacityRoomBindingInputs({
            config,
            params,
            clock: () => new Date(`${AT}T12:00:00.000Z`),
        });
        expect(projection.physical).toBe(20);
        expect(projection.licensed).toBe(15);
        expect(projection.binding).toBe(12); // platform binding includes ratio

        const evalResult = evaluateOrgCalcAstAgainstCapacityProjection(
            provingMinPhysicalLicensedAst(),
            projection,
        );
        expect(evalResult.value).toBe(15);
        expect(evalResult.value).not.toBe(projection.binding);
        expect(JSON.stringify(evalResult)).toBe(
            JSON.stringify(
                evaluateOrgCalcAstAgainstCapacityProjection(
                    provingMinPhysicalLicensedAst(),
                    projection,
                ),
            ),
        );
    });

    it("resolves catalog inputs from capacity.room_binding only", () => {
        const projection = projectCapacityRoomBindingInputs({
            config,
            params,
            clock: () => new Date(`${AT}T12:00:00.000Z`),
        });
        expect(resolveInputFromCapacityProjection(projection, "capacity.room_binding.ratio_limited").value).toBe(
            12,
        );
    });
});
