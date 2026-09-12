import { describe, expect, it } from "vitest";
import {
    listAvailableMetricPacks,
    listAvailablePackMetricKeys,
    listMetricPacks,
    validateMetricPackRegistry,
} from "@/lib/metrics/packs";
import { listMetricDefinitions } from "@/lib/metrics/registry";

describe("metric packs registry", () => {
    it("validates all pack metric keys against metric registry", () => {
        expect(validateMetricPackRegistry()).toEqual([]);
    });

    it("lists seven available packs with metrics", () => {
        const available = listAvailableMetricPacks();
        expect(available.map((p) => p.key)).toEqual([
            "operational_health",
            "enrollment",
            "communications",
            "forms",
            // Governed reasoning execution. A presentation grouping, not a
            // Business Process — see PACK_TO_BUSINESS_PROCESS.
            "trust",
            // Who is expected, who is here, who is unaccounted for. Activated by
            // Thread 9; a measurement domain with no Business Process owner.
            "attendance",
            // Money. Was the empty `billing` placeholder promising "receivables"; it is now
            // the Financials pack, and every key in it quotes a Financials thread.
            "financials",
        ]);
    });

    it("includes coming-soon packs without metrics", () => {
        const soon = listMetricPacks().filter((p) => p.domainStatus === "coming_soon");
        /*
         * capacity and staffing. `billing` left by becoming `financials`;
         * `attendance` left by being activated in Thread 9.
         *
         * staffing stays empty by DECISION, not by backlog: supervision grouping
         * has no canonical owner, staff supply is never supplied to the ratio
         * model, and a ratio metric would measure an absent denominator.
         */
        expect(soon.length).toBeGreaterThanOrEqual(2);
        expect(soon.every((p) => p.metricKeys.length === 0)).toBe(true);
    });

    it("covers all eleven Phase 1 metrics across available packs", () => {
        const packKeys = new Set(listAvailablePackMetricKeys());
        const registryKeys = listMetricDefinitions().map((d) => d.key);
        for (const key of registryKeys) {
            expect(packKeys.has(key)).toBe(true);
        }
        expect(packKeys.size).toBe(11);
    });

    it("assigns default surface order", () => {
        const packs = listAvailableMetricPacks();
        for (let i = 1; i < packs.length; i++) {
            expect(packs[i]!.defaultSurfaceOrder).toBeGreaterThan(packs[i - 1]!.defaultSurfaceOrder);
        }
    });
});
