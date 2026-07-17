/**
 * Conformance tests for the Operational Calculations Registry V1.
 *
 * Proves the First Implementation Mission's definition of done (governing doc
 * 04 Part 10):
 *   - the four keys are registered
 *   - the family emits the V1 core over the existing resolvers
 *   - the four resolution states are representable and correctly derived
 *   - a beyond-range tier returns `incomplete` — not a coerced number silently
 *     trusted
 *   - values are family-typed (non-scalar), never a forced scalar
 *   - ZERO verdicts are emitted
 *   - the wrap is byte-identical to the underlying resolver (no behavior change)
 */

import { describe, expect, it } from "vitest";
import type {
    ChildcareCapacityRuleRow,
    ChildcareRatioRuleRow,
    ChildcareRatioRuleTierRow,
} from "@/lib/childcareOperational/config/configRuleTypes";
import { resolveOperationalCapacity } from "@/lib/childcareOperational/capacity/resolveOperationalCapacity";
import {
    CAPACITY_REMAINING,
    CAPACITY_ROOM_BINDING,
    RESOURCE_RATIO,
    RESOURCE_REQUIRED_STAFF,
    defineOperationalCalculation,
    findOperationalCalculationDefinition,
    getOperationalCalculationDefinition,
    isKnownCalculationKey,
    listOperationalCalculationDefinitions,
    listOperationalCalculationDefinitionsByConsumer,
    listOperationalCalculationDefinitionsByFamily,
    resolveCalculation,
    type CapacityCalculationRequest,
    type CapacityValue,
    type HandlerComputation,
    type OperationalCalculationDefinition,
    type RequirementValue,
    type ResourceRequirementRequest,
} from "@/lib/operationalCalculations";

const SITE = "site-1";
const ROOM = "room-1";
const AT = "2026-06-01";
const CLOCK_ISO = "2026-06-01T12:00:00.000Z";
const clock = () => new Date(CLOCK_ISO);

// ---- fixture builders (mirroring the existing capacity resolver tests) ----

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

function ratioRule(partial: Partial<ChildcareRatioRuleRow>): ChildcareRatioRuleRow {
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

function tier(ruleId: string, max_children: number, required_staff: number): ChildcareRatioRuleTierRow {
    return {
        id: `${ruleId}-t${max_children}`,
        org_id: "org-1",
        ratio_rule_id: ruleId,
        max_children,
        required_staff,
        sort_order: max_children,
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

/** Tiered rule: 1 staff ≤ 5, 2 staff ≤ 11 (the canonical stepped example). */
function steppedRatioConfig(): ResourceRequirementRequest["config"] {
    return {
        ratioRules: [ratioRule({ id: "r" })],
        ratioRuleTiers: [tier("r", 5, 1), tier("r", 11, 2)],
    };
}

const capBase: CapacityCalculationRequest["params"] = {
    orgId: "org-1",
    locationId: SITE,
    siteLocationId: SITE,
    roomLocationId: ROOM,
    effectiveAt: AT,
};

// ---------------------------------------------------------------------------

describe("registry — the four keys are registered and resolution fails closed", () => {
    it("registers exactly the four V1 keys", () => {
        const keys = listOperationalCalculationDefinitions()
            .map((d) => d.key)
            .sort();
        expect(keys).toEqual([
            "capacity.remaining",
            "capacity.room_binding",
            "resource.ratio",
            "resource.required_staff",
        ]);
    });

    it("isKnownCalculationKey gates registered vs unregistered keys", () => {
        expect(isKnownCalculationKey("capacity.room_binding")).toBe(true);
        expect(isKnownCalculationKey("capacity.made_up")).toBe(false);
    });

    it("getOperationalCalculationDefinition throws on an unregistered key (fail closed)", () => {
        expect(() => getOperationalCalculationDefinition("capacity.made_up")).toThrow(/not registered/);
        expect(findOperationalCalculationDefinition("capacity.made_up")).toBeNull();
    });

    it("lists by family and consumer", () => {
        expect(listOperationalCalculationDefinitionsByFamily("capacity").map((d) => d.key).sort()).toEqual([
            "capacity.remaining",
            "capacity.room_binding",
        ]);
        expect(listOperationalCalculationDefinitionsByFamily("resource_requirements")).toHaveLength(2);
        expect(listOperationalCalculationDefinitionsByConsumer("scheduling")).toHaveLength(4);
    });

    it("every registered definition carries the V1 governance core", () => {
        for (const def of listOperationalCalculationDefinitions()) {
            expect(def.contractVersion).toBe("1.0");
            expect(def.handler.kind).toBe("pure");
            expect(def.handler.engineVersion).toMatch(/@\d+\.\d+\.\d+$/);
            expect(def.scopes.length).toBeGreaterThan(0);
            expect(def.ruleShapes.length).toBeGreaterThan(0);
            expect(def.status).toBe("active");
        }
    });
});

describe("defineOperationalCalculation — registration validation fails closed", () => {
    const ok: OperationalCalculationDefinition<ResourceRequirementRequest, RequirementValue> = RESOURCE_RATIO;
    const base = {
        family: ok.family,
        purpose: ok.purpose,
        handler: ok.handler,
        scopes: ok.scopes,
        effectiveTime: ok.effectiveTime,
        resultKind: ok.resultKind,
        contractVersion: ok.contractVersion,
        consumers: ok.consumers,
        expectationBindable: ok.expectationBindable,
        logicOwner: ok.logicOwner,
        status: ok.status,
        testingStrategy: ok.testingStrategy,
        ruleShapes: ["tiered_ratio"] as const,
    };

    it("rejects a malformed key", () => {
        expect(() => defineOperationalCalculation({ ...base, key: "NotAKey" })).toThrow(/<family>\.<name>/);
    });
    it("rejects an unsupported rule shape", () => {
        expect(() =>
            defineOperationalCalculation({ ...base, key: "resource.x", ruleShapes: ["free_formula"] as never }),
        ).toThrow(/unsupported rule shape/);
    });
    it("rejects empty scopes", () => {
        expect(() => defineOperationalCalculation({ ...base, key: "resource.x", scopes: [] })).toThrow(
            /at least one scope/,
        );
    });
    it("rejects an archived definition without deprecation metadata", () => {
        expect(() =>
            defineOperationalCalculation({ ...base, key: "resource.x", status: "archived" }),
        ).toThrow(/deprecation metadata/);
    });
});

describe("capacity family — V1 core over resolveOperationalCapacity, byte-identical", () => {
    const config: CapacityCalculationRequest["config"] = {
        capacityRules: [
            capRule({ id: "phys", capacity_kind: "physical", capacity: 20 }),
            capRule({ id: "lic", capacity_kind: "licensed", capacity: 15 }),
            capRule({ id: "op", capacity_kind: "operational", capacity: 18 }),
        ],
        ratioRules: [ratioRule({ id: "r" })],
        ratioRuleTiers: [tier("r", 12, 1)],
    };

    it("resolved: distinct kinds separate, binding = min, limitingFactor named", () => {
        const result = resolveCalculation(CAPACITY_ROOM_BINDING, { config, params: capBase }, { clock });
        const value = result.value as CapacityValue;

        // V1 core envelope.
        expect(result.calculationKey).toBe("capacity.room_binding");
        expect(result.family).toBe("capacity");
        expect(result.status).toBe("resolved");
        expect(result.scope).toEqual({ type: "room", id: ROOM });
        expect(result.effective).toEqual({ asOf: AT });
        expect(result.contractVersion).toBe("1.0");
        expect(result.engineVersion).toMatch(/resolveOperationalCapacity/);
        expect(result.configVersion.effectiveOn).toBe(AT);
        expect(result.evaluatedAt).toBe(CLOCK_ISO);

        // Family-typed (non-scalar) value.
        expect(value.kind).toBe("capacity");
        expect(value.physical).toBe(20);
        expect(value.licensed).toBe(15);
        expect(value.operational).toBe(18);
        expect(value.ratioLimited).toBe(12);
        expect(value.binding).toBe(12);
        expect(value.limitingFactor).toBe("ratio");
        expect(value.staffed).toBeNull(); // G3.

        // Byte-identical to the underlying resolver.
        const direct = resolveOperationalCapacity(config, capBase);
        expect(value.physical).toBe(direct.physicalCapacity);
        expect(value.licensed).toBe(direct.licensedCapacity);
        expect(value.binding).toBe(direct.bindingCapacity);
        expect(value.limitingFactor).toBe(direct.limitingFactor);
        expect(result.appliedRules).toEqual(direct.appliedRules);
        expect(result.warnings).toEqual(direct.warnings);
    });

    it("not_configured: no rule at any scope, binding null (never 0)", () => {
        const result = resolveCalculation(
            CAPACITY_ROOM_BINDING,
            { config: { capacityRules: [], ratioRules: [], ratioRuleTiers: [] }, params: capBase },
            { clock },
        );
        expect(result.status).toBe("not_configured");
        expect((result.value as CapacityValue).binding).toBeNull();
        expect((result.value as CapacityValue).remaining).toBeNull();
    });

    it("incomplete: uncovered mixed-age group; remaining suppressed to null", () => {
        const result = resolveCalculation(
            CAPACITY_REMAINING,
            {
                config: {
                    capacityRules: [capRule({ id: "phys", capacity_kind: "physical", capacity: 20 })],
                    ratioRules: [ratioRule({ id: "infant", age_group_key: "infant" })],
                    ratioRuleTiers: [tier("infant", 8, 1)],
                },
                params: { ...capBase, ageGroupContext: ["infant", "preschool"], occupancyContext: { committed: 4 } },
            },
            { clock },
        );
        expect(result.status).toBe("incomplete");
        expect(result.warnings.some((w) => w.code === "unknown_age_group")).toBe(true);
        expect((result.value as CapacityValue).remaining).toBeNull();
    });

    it("capacity.remaining: remaining = max(0, binding − committed − offered)", () => {
        const result = resolveCalculation(
            CAPACITY_REMAINING,
            {
                config: { capacityRules: [capRule({ id: "phys", capacity_kind: "physical", capacity: 20 })], ratioRules: [], ratioRuleTiers: [] },
                params: { ...capBase, occupancyContext: { committed: 12, offered: 3 } },
            },
            { clock },
        );
        expect(result.status).toBe("resolved");
        expect((result.value as CapacityValue).remaining).toBe(5); // 20 - 12 - 3
    });
});

describe("resource family — required staff / ratio over resolveRatio", () => {
    it("resolved: tiered 1:5 → 2:11 picks the covering tier", () => {
        const request: ResourceRequirementRequest = {
            config: steppedRatioConfig(),
            params: { siteLocationId: SITE, roomLocationId: ROOM, childCount: 9, effectiveAt: AT },
        };
        const result = resolveCalculation(RESOURCE_REQUIRED_STAFF, request, { clock });
        const value = result.value as RequirementValue;

        expect(result.status).toBe("resolved");
        expect(value.kind).toBe("requirement");
        expect(value.requiredStaff).toBe(2); // 9 children → 2 staff (≤11 tier)
        expect(value.ratioConstrainedCapacity).toBe(11);
        expect(value.exceedsDefinedTiers).toBe(false);
        expect(value.appliedTier).toEqual({ ruleId: "r", maxChildren: 11, requiredStaff: 2 });
    });

    it("beyond-range tier ⇒ incomplete, top-tier staffing FLAGGED (never a coerced number silently trusted)", () => {
        const request: ResourceRequirementRequest = {
            config: steppedRatioConfig(),
            params: { siteLocationId: SITE, roomLocationId: ROOM, childCount: 30, effectiveAt: AT },
        };
        const result = resolveCalculation(RESOURCE_REQUIRED_STAFF, request, { clock });
        const value = result.value as RequirementValue;

        // Honesty: the registered result is incomplete, not resolved.
        expect(result.status).toBe("incomplete");
        expect(value.exceedsDefinedTiers).toBe(true);
        // The number is present but FLAGGED (top tier), not silently trusted, and not null/0/coerced.
        expect(value.requiredStaff).toBe(2);
        expect(result.warnings.some((w) => w.code === "child_count_exceeds_ratio_capacity")).toBe(true);
    });

    it("not_configured: no ratio rule at any scope", () => {
        const result = resolveCalculation(
            RESOURCE_RATIO,
            { config: { ratioRules: [], ratioRuleTiers: [] }, params: { roomLocationId: ROOM, effectiveAt: AT } },
            { clock },
        );
        expect(result.status).toBe("not_configured");
        expect((result.value as RequirementValue).ratioConstrainedCapacity).toBeNull();
        expect((result.value as RequirementValue).requiredStaff).toBeNull();
    });
});

describe("the runtime carries every resolution state, including conflicted and partial", () => {
    // The capacity/ratio resolvers deterministically never produce `conflicted`
    // (the precedence ladder always decides) or `partial` (single-entry). A
    // synthetic pure handler proves the Runtime + Result faithfully carry the
    // full status contract for future multi-entry / conflicting families.
    function syntheticDef(status: HandlerComputation<CapacityValue>["status"]) {
        const value: CapacityValue = {
            kind: "capacity",
            physical: null,
            licensed: null,
            operational: null,
            ratioLimited: null,
            staffed: null,
            binding: null,
            limitingFactor: null,
            remaining: null,
        };
        return defineOperationalCalculation<{ effectiveAt: string }, CapacityValue>({
            key: "capacity.synthetic",
            family: "capacity",
            purpose: "test harness for status pass-through",
            handler: {
                kind: "pure",
                ref: "test.synthetic",
                engineVersion: "test@1.0.0",
                evaluate: (req) => ({
                    status,
                    value,
                    scope: { type: "org", id: null },
                    effective: { asOf: req.effectiveAt },
                    appliedRules: [],
                    warnings: [],
                }),
            },
            ruleShapes: ["capacity_kind"],
            scopes: ["org"],
            effectiveTime: "point_in_time",
            resultKind: "capacity",
            contractVersion: "1.0",
            consumers: ["scheduling"],
            expectationBindable: true,
            logicOwner: "test",
            status: "active",
            testingStrategy: "n/a",
        });
    }

    it.each(["resolved", "incomplete", "not_configured", "conflicted", "partial"] as const)(
        "preserves status %s into the Result",
        (status) => {
            const result = resolveCalculation(syntheticDef(status), { effectiveAt: AT }, { clock });
            expect(result.status).toBe(status);
        },
    );

    it("throws when an oip handler is resolved through the V1 runtime", () => {
        const oipDef = {
            ...syntheticDef("resolved"),
            handler: { kind: "oip", metricKey: "enrollment.lead_count", engineVersion: "oip@1" },
        } as unknown as OperationalCalculationDefinition<{ effectiveAt: string }, CapacityValue>;
        expect(() => resolveCalculation(oipDef, { effectiveAt: AT }, { clock })).toThrow(/not resolvable/);
    });
});

describe("determinism + no verdicts", () => {
    const config: CapacityCalculationRequest["config"] = {
        capacityRules: [capRule({ id: "phys", capacity_kind: "physical", capacity: 20 })],
        ratioRules: [],
        ratioRuleTiers: [],
    };

    it("is byte-identical across runs with the same injected clock", () => {
        const a = resolveCalculation(CAPACITY_ROOM_BINDING, { config, params: capBase }, { clock });
        const b = resolveCalculation(CAPACITY_ROOM_BINDING, { config, params: capBase }, { clock });
        expect(a).toEqual(b);
    });

    it("emits no verdict fields — only resolution states", () => {
        const result = resolveCalculation(CAPACITY_ROOM_BINDING, { config, params: capBase }, { clock });
        const verdicts = ["compliant", "breached", "healthy", "critical", "over_capacity", "understaffed", "healthState"];
        const flat = JSON.stringify(result);
        for (const v of verdicts) expect(flat).not.toContain(v);
        expect(["resolved", "incomplete", "not_configured", "conflicted", "partial"]).toContain(result.status);
    });
});
