import { describe, expect, it } from "vitest";
import {
    deriveMetricCategoryFromSource,
    metricCategoryLabel,
    normalizeMetricCategoryKey,
} from "@/lib/metrics/platform/metricCategory";

describe("metricCategory", () => {
    it("derives category from source key prefix", () => {
        expect(deriveMetricCategoryFromSource("enrollment.tour_conversion_rate")).toBe("enrollment");
        expect(deriveMetricCategoryFromSource("ops.needs_attention_count")).toBe("operational_health");
        expect(deriveMetricCategoryFromSource("forms.completion_rate")).toBe("compliance");
        expect(deriveMetricCategoryFromSource("comms.delivery_rate")).toBe("communications");
    });

    it("labels categories for operators", () => {
        expect(metricCategoryLabel("operational_health")).toBe("Operational health");
        expect(metricCategoryLabel("enrollment")).toBe("Enrollment");
    });

    it("normalizes unknown categories to general", () => {
        expect(normalizeMetricCategoryKey("typo_category")).toBe("general");
    });
});
