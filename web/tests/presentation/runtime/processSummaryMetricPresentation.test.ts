import { describe, expect, it } from "vitest";
import {
    formatProcessSummaryMetric,
    formatSupportingMetricInline,
    metricHasDisplayValue,
    PROCESS_SUMMARY_METRIC_EMPTY,
    sameMetricPhrase,
} from "@/lib/presentation/runtime/processSummaryMetricPresentation";

describe("processSummaryMetricPresentation", () => {
    it("metricHasDisplayValue treats em dash and hyphen as empty", () => {
        expect(metricHasDisplayValue(null)).toBe(false);
        expect(metricHasDisplayValue("")).toBe(false);
        expect(metricHasDisplayValue("—")).toBe(false);
        expect(metricHasDisplayValue("-")).toBe(false);
        expect(metricHasDisplayValue("6")).toBe(true);
        expect(metricHasDisplayValue("31%")).toBe(true);
    });

    it("formatProcessSummaryMetric uses configured title and never joins definition label when empty", () => {
        const formatted = formatProcessSummaryMetric({
            configuredTitle: "Tour Conversion",
            definitionLabel: "Tour conversion rate",
            value: null,
        });
        expect(formatted).toEqual({ kind: "empty", title: "Tour Conversion" });
        expect(formatSupportingMetricInline(formatted)).toBe(`Tour Conversion\n${PROCESS_SUMMARY_METRIC_EMPTY}`);
    });

    it("formatProcessSummaryMetric returns value kind when a display value exists", () => {
        const formatted = formatProcessSummaryMetric({
            configuredTitle: "Tour volume",
            definitionLabel: "Tours scheduled",
            value: "12",
        });
        expect(formatted).toEqual({ kind: "value", title: "Tour volume", displayValue: "12" });
        expect(formatSupportingMetricInline(formatted)).toBe("Tour volume: 12");
    });

    it("formatProcessSummaryMetric falls back to definition label when no configured title", () => {
        expect(
            formatProcessSummaryMetric({
                configuredTitle: null,
                definitionLabel: "Active leads",
                value: "6",
            }),
        ).toEqual({ kind: "value", title: "Active leads", displayValue: "6" });
    });

    it("sameMetricPhrase compares normalized phrases", () => {
        expect(sameMetricPhrase("Enrollment", " enrollment ")).toBe(true);
        expect(sameMetricPhrase("Tour Conversion", "Tour conversion rate")).toBe(false);
    });
});
