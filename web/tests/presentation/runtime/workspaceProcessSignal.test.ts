/**
 * Workspace Process Primary Signal — resolution from the Operational Calculations registry.
 * The card's signal comes from a selected calculation; nothing is hardcoded or health-assumed.
 */

import { describe, expect, it } from "vitest";
import type { MetricResolveApiItem } from "@/app/api/admin/metrics/resolve/route";
import {
    availableSignalsForProcess,
    businessProcessForProcessKey,
    defaultSignalKeyForProcess,
    resolvePrimarySignal,
    signalAnswerText,
    signalStateFromKpiStatus,
    signalsForBusinessProcess,
} from "@/lib/presentation/runtime/workspaceProcessSignal";
import { findOperationalCalculation } from "@/lib/analytics/calculations/registry";

describe("business process mapping + available signals (registry-driven)", () => {
    it("maps process keys to their business process", () => {
        expect(businessProcessForProcessKey("enrollment_pipeline")).toBe("enrollment");
        expect(businessProcessForProcessKey("forms_intake")).toBe("forms");
        expect(businessProcessForProcessKey("labor_scheduling")).toBe("operational_health");
        expect(businessProcessForProcessKey("revenue")).toBe("financial");
        expect(businessProcessForProcessKey("")).toBeNull();
    });

    it("available signals come from the calculations registry (tile-consumable, active)", () => {
        const signals = availableSignalsForProcess("enrollment");
        expect(signals.length).toBeGreaterThan(0);
        // every offered signal is a real, active, tile-consumable calculation
        for (const s of signals) {
            expect(s.status).toBe("active");
            expect(s.consumers).toContain("business_process_tile");
            expect(findOperationalCalculation(s.key)).not.toBeNull();
        }
        // default is the first available (never a hardcoded health metric)
        expect(defaultSignalKeyForProcess("enrollment")).toBe(signals[0]!.key);
        // enrollment's tile signals are enrollment calculations
        expect(signalsForBusinessProcess("enrollment").every((c) => c.businessProcess === "enrollment")).toBe(true);
    });
});

describe("state + answer localization (no classification)", () => {
    it("localizes canonical KPI status to state", () => {
        expect(signalStateFromKpiStatus("healthy")).toBe("healthy");
        expect(signalStateFromKpiStatus("warning")).toBe("caution");
        expect(signalStateFromKpiStatus("critical")).toBe("critical");
        expect(signalStateFromKpiStatus("unknown")).toBe("neutral");
        expect(signalStateFromKpiStatus(undefined)).toBe("neutral");
    });

    it("frames the signal label by state (no trend/health claim)", () => {
        expect(signalAnswerText("Conversion", "healthy")).toBe("Conversion on track");
        expect(signalAnswerText("Conversion", "caution")).toBe("Conversion needs attention");
        expect(signalAnswerText("Conversion", "critical")).toBe("Conversion needs action");
        expect(signalAnswerText("Conversion", "neutral")).toBe("Conversion");
    });
});

describe("resolvePrimarySignal — assembles from calculation + resolved metric", () => {
    const KEY = "enrollment.tour_conversion_rate";
    function item(over: Partial<MetricResolveApiItem>): MetricResolveApiItem {
        return {
            metric_key: KEY,
            label: "Tour conversion",
            format: "rate",
            value: 0.31,
            formatted_value: "31%",
            window: "rolling_7d",
            window_start: "",
            window_end: "",
            computed_at: "",
            resolve_mode: "live",
            sources: [],
            source_metadata: {} as MetricResolveApiItem["source_metadata"],
            ...over,
        } as MetricResolveApiItem;
    }

    it("uses value + state + drill from the calculation/metric; value type is opaque", () => {
        const sig = resolvePrimarySignal(KEY, item({
            kpi: { kpi_key: KEY, label: "x", status: "healthy", target_kind: "rate_min", target_min_rate: 0.8, thresholds: {} },
        }))!;
        expect(sig.key).toBe(KEY);
        expect(sig.value).toBe("31%");
        expect(sig.state).toBe("healthy");
        expect(sig.answer).toContain("on track");
        expect(sig.supportingContext).toContain("Target"); // from the calc's KPI target
        expect(sig.drillHref).not.toBeNull(); // enrollment.tour_conversion_rate has a drill contract
        expect(sig.trend).toBeNull(); // trend not resolved by the metrics layer → never fabricated
    });

    it("unresolved metric → neutral signal that still names the calculation (no fabricated value/state)", () => {
        const sig = resolvePrimarySignal(KEY, undefined)!;
        expect(sig.state).toBe("neutral");
        expect(sig.value).toBeNull();
        expect(sig.label).toBe(findOperationalCalculation(KEY)?.label);
    });
});
