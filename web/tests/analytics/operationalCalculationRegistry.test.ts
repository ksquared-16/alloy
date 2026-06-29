import { describe, expect, it } from "vitest";

import {
    listOperationalCalculations,
    getOperationalCalculation,
    findOperationalCalculation,
    isKnownCalculationKey,
    listCalculationsByBusinessProcess,
    listCalculationsByConsumer,
} from "@/lib/analytics/calculations/registry";
import { getDrillContract } from "@/lib/analytics/runtime/drillResolver";
import { getMetricDefinition, isKnownOipMetricKey } from "@/lib/metrics/registry";

describe("Operational Calculation Registry integrity", () => {
    const calcs = listOperationalCalculations();

    it("registers at least the known OIP facts", () => {
        expect(calcs.length).toBeGreaterThanOrEqual(13);
    });

    it("every calculation wraps a real OIP metric key (no forks)", () => {
        for (const calc of calcs) {
            expect(isKnownOipMetricKey(calc.key)).toBe(true);
        }
    });

    it("mirrored fields match the wrapped OIP definition (no drift)", () => {
        for (const calc of calcs) {
            const def = getMetricDefinition(calc.key);
            expect(calc.label).toBe(def.label);
            expect(calc.format).toBe(def.format);
            expect(calc.snapshotStrategy).toBe(def.computationKind);
            expect(calc.bounded).toBe(def.snapshotSemantics ?? false);
            expect([...calc.dimensions]).toEqual([...(def.supportsDimensions ?? [])]);
            expect([...calc.requiredInputs]).toEqual([...def.sources]);
        }
    });

    it("declares a non-empty grain set on every calculation", () => {
        for (const calc of calcs) {
            expect(calc.grains.length).toBeGreaterThan(0);
        }
    });

    it("never dead-ends: a calculation has a drill contract OR is exploratoryOnly", () => {
        for (const calc of calcs) {
            const hasDrill = Boolean(calc.drillContractId);
            expect(hasDrill || calc.exploratoryOnly === true).toBe(true);
        }
    });

    it("every drillContractId resolves to a registered drill contract", () => {
        for (const calc of calcs) {
            if (calc.drillContractId) {
                expect(getDrillContract(calc.drillContractId)).not.toBeNull();
            }
        }
    });

    it("archived calculations declare a deprecation path", () => {
        for (const calc of calcs) {
            if (calc.status === "archived") {
                expect(calc.deprecation).toBeDefined();
            }
        }
    });

    it("declares at least one consumer per calculation", () => {
        for (const calc of calcs) {
            expect(calc.consumers.length).toBeGreaterThan(0);
        }
    });

    it("lookup helpers are consistent", () => {
        const first = calcs[0];
        expect(isKnownCalculationKey(first.key)).toBe(true);
        expect(isKnownCalculationKey("not.a.real.key")).toBe(false);
        expect(getOperationalCalculation(first.key)).toEqual(first);
        expect(findOperationalCalculation(first.key)).toEqual(first);
        expect(findOperationalCalculation("not.a.real.key")).toBeNull();
    });

    it("indexes by business process and consumer", () => {
        expect(listCalculationsByBusinessProcess("enrollment").length).toBeGreaterThan(0);
        expect(listCalculationsByConsumer("analytics").length).toBe(calcs.length);
    });
});
