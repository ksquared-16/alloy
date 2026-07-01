import { describe, expect, it } from "vitest";
import { oipDisplayValueIsPresent, oipMetricDisplayValue } from "@/lib/metrics/oipKpiObjectPresentation";
import { normalizeOipHealthStatus } from "@/lib/metrics/oipStatusPresentation";

// Doctrine: a KPI tile must never render a numeric value AND a "No data" indicator together.
// The card gates `showNoDataHelper` on `!oipDisplayValueIsPresent(displayValue)`.
describe("oipDisplayValueIsPresent (no value + No-data guard)", () => {
    it("treats real values as present", () => {
        expect(oipDisplayValueIsPresent("7")).toBe(true);
        expect(oipDisplayValueIsPresent("1")).toBe(true);
        expect(oipDisplayValueIsPresent("$1,200")).toBe(true);
        expect(oipDisplayValueIsPresent("0")).toBe(true); // a real zero is still data
    });

    it("treats placeholders as absent", () => {
        expect(oipDisplayValueIsPresent("—")).toBe(false);
        expect(oipDisplayValueIsPresent("")).toBe(false);
        expect(oipDisplayValueIsPresent(null)).toBe(false);
        expect(oipDisplayValueIsPresent(undefined)).toBe(false);
        expect(oipDisplayValueIsPresent("No data")).toBe(false);
    });

    it("the card's No-data helper condition is suppressed when a value is present", () => {
        // Mirror the card gate: variant === "health" && unknown && !present.
        const gate = (status: string | null, value: string) =>
            normalizeOipHealthStatus(status) === "unknown" && !oipDisplayValueIsPresent(value);

        // value present (7) → no "No data" helper, even with unknown status (the contradiction case).
        expect(gate("unknown", oipMetricDisplayValue("7"))).toBe(false);
        // genuinely no value → "No data" helper may show.
        expect(gate("unknown", oipMetricDisplayValue(null))).toBe(true);
    });
});
