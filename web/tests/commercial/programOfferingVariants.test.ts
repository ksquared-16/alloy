import { describe, it, expect } from "vitest";
import {
    autoVariantLabel,
    describeVariant,
    isDefaultVariant,
    sortVariants,
    groupVariantsByOffering,
    type ProgramOfferingVariant,
} from "@/lib/programs/programOfferingVariants";

function makeVariant(overrides: Partial<ProgramOfferingVariant> = {}): ProgramOfferingVariant {
    return {
        id: "v1",
        org_id: "org1",
        offering_id: "o1",
        label: null,
        quantity_type: "days",
        quantity_value: 5,
        sort_order: 50,
        is_active: true,
        status: "active",
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
        ...overrides,
    };
}

describe("isDefaultVariant", () => {
    it("true when no quantity", () => {
        expect(isDefaultVariant(makeVariant({ quantity_type: null, quantity_value: null }))).toBe(true);
    });
    it("false when quantity is set", () => {
        expect(isDefaultVariant(makeVariant({ quantity_type: "days", quantity_value: 5 }))).toBe(false);
    });
});

describe("autoVariantLabel", () => {
    it("pluralizes correctly for count > 1", () => {
        expect(autoVariantLabel(5, "days")).toBe("5 days/week");
        expect(autoVariantLabel(3, "hours")).toBe("3 hours/week");
    });
    it("uses singular for count = 1", () => {
        expect(autoVariantLabel(1, "days")).toBe("1 day/week");
        expect(autoVariantLabel(1, "hours")).toBe("1 hour/week");
        expect(autoVariantLabel(1, "months")).toBe("1 month");
    });
});

describe("describeVariant", () => {
    it("prefers custom label", () => {
        const v = makeVariant({ label: "Custom label", quantity_type: "days", quantity_value: 5 });
        expect(describeVariant(v)).toBe("Custom label");
    });
    it("falls back to auto-generated label", () => {
        const v = makeVariant({ label: null, quantity_type: "days", quantity_value: 5 });
        expect(describeVariant(v)).toBe("5 days/week");
    });
    it("returns Default for transparent variant", () => {
        const v = makeVariant({ label: null, quantity_type: null, quantity_value: null });
        expect(describeVariant(v)).toBe("Default");
    });
});

describe("sortVariants", () => {
    it("default variant sorts first", () => {
        const defaultVar = makeVariant({ id: "default", quantity_type: null, quantity_value: null, sort_order: 999 });
        const quantityVar = makeVariant({ id: "qty", quantity_type: "days", quantity_value: 5, sort_order: 10 });
        const sorted = sortVariants([quantityVar, defaultVar]);
        expect(sorted[0].id).toBe("default");
    });

    it("sorts by sort_order, then quantity_value", () => {
        const v2 = makeVariant({ id: "v2", quantity_value: 2, sort_order: 20 });
        const v5 = makeVariant({ id: "v5", quantity_value: 5, sort_order: 50 });
        const v3 = makeVariant({ id: "v3", quantity_value: 3, sort_order: 30 });
        const sorted = sortVariants([v5, v2, v3]);
        expect(sorted.map((v) => v.id)).toEqual(["v2", "v3", "v5"]);
    });
});

describe("groupVariantsByOffering", () => {
    it("groups correctly by offering_id", () => {
        const v1 = makeVariant({ id: "v1", offering_id: "o1" });
        const v2 = makeVariant({ id: "v2", offering_id: "o1" });
        const v3 = makeVariant({ id: "v3", offering_id: "o2" });
        const grouped = groupVariantsByOffering([v1, v2, v3]);
        expect(grouped.get("o1")?.map((v) => v.id)).toEqual(["v1", "v2"]);
        expect(grouped.get("o2")?.map((v) => v.id)).toEqual(["v3"]);
    });

    it("returns empty map for empty input", () => {
        expect(groupVariantsByOffering([])).toEqual(new Map());
    });
});
