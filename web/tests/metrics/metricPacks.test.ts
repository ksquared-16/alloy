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

    it("lists five available packs with metrics", () => {
        const available = listAvailableMetricPacks();
        expect(available.map((p) => p.key)).toEqual([
            "operational_health",
            "enrollment",
            "communications",
            "forms",
            // Governed reasoning execution. A presentation grouping, not a
            // Business Process — see PACK_TO_BUSINESS_PROCESS.
            "trust",
        ]);
    });

    it("includes coming-soon packs without metrics", () => {
        const soon = listMetricPacks().filter((p) => p.domainStatus === "coming_soon");
        expect(soon.length).toBeGreaterThanOrEqual(4);
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
