import { describe, expect, it } from "vitest";
import {
    listSchedulingCalculations,
    getSchedulingCalculation,
    findSchedulingCalculation,
    isKnownSchedulingCalculationKey,
    listSchedulingCalculationsByConsumer,
} from "@/lib/childcareOperational/calculations/registry";
import type { SchedulingCalculationKey } from "@/lib/childcareOperational/calculations/types";

const ALL = listSchedulingCalculations();

describe("scheduling calculation registry — integrity", () => {
    it("registers a non-empty family, all keyed under 'scheduling'", () => {
        expect(ALL.length).toBeGreaterThanOrEqual(9);
        for (const calc of ALL) {
            expect(calc.family).toBe("scheduling");
            expect(calc.key.startsWith("scheduling.")).toBe(true);
            expect(calc.key).toBe(calc.key); // stable id
            expect(getSchedulingCalculation(calc.key)).toBe(calc);
        }
    });

    it("every descriptor declares non-empty grains, inputs, a version and a testing strategy", () => {
        for (const calc of ALL) {
            expect(calc.grains.length).toBeGreaterThan(0);
            expect(calc.requiredInputs.length).toBeGreaterThan(0);
            expect(calc.version).toBeGreaterThanOrEqual(1);
            expect(calc.testingStrategy.length).toBeGreaterThan(0);
            expect(calc.determinism).toBe("pure_deterministic");
            expect(calc.refreshStrategy).toBe("live");
        }
    });

    it("every dependency names another registered scheduling calculation", () => {
        const keys = new Set(ALL.map((c) => c.key));
        for (const calc of ALL) {
            for (const dep of calc.dependencies) {
                expect(keys.has(dep)).toBe(true);
            }
        }
    });

    it("names a canonical resolver that exists and is a function (wrap-check)", async () => {
        for (const calc of ALL) {
            const modulePath = calc.resolver.module.replace(/^lib\//, "@/lib/").replace(/\.ts$/, "");
            const mod = (await import(modulePath)) as Record<string, unknown>;
            expect(
                typeof mod[calc.resolver.export],
                `${calc.key} -> ${calc.resolver.module}#${calc.resolver.export}`,
            ).toBe("function");
        }
    });

    it("resolves and rejects keys through the guards", () => {
        const known: SchedulingCalculationKey = "scheduling.required_staff";
        expect(isKnownSchedulingCalculationKey(known)).toBe(true);
        expect(isKnownSchedulingCalculationKey("scheduling.nope")).toBe(false);
        expect(findSchedulingCalculation(known)?.key).toBe(known);
        expect(findSchedulingCalculation("scheduling.nope")).toBeNull();
    });

    it("indexes by consumer without inventing consumers", () => {
        const byConsumer = listSchedulingCalculationsByConsumer("actual_compliance_api");
        expect(byConsumer.length).toBeGreaterThan(0);
        for (const calc of byConsumer) {
            expect(calc.consumers).toContain("actual_compliance_api");
        }
    });
});
