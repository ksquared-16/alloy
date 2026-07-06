import { describe, it, expect } from "vitest";
import {
    isOfferingVisible,
    sortOfferings,
    ATTENDANCE_TYPE_LABELS,
    type ProgramOffering,
} from "@/lib/programs/programOfferings";

function makeOffering(overrides: Partial<ProgramOffering> = {}): ProgramOffering {
    return {
        id: "o1",
        org_id: "org1",
        program_key: "infant",
        label: "Full Time – 5 days",
        attendance_type: "full_time",
        status: "active",
        effective_start: null,
        effective_end: null,
        sort_order: 100,
        is_active: true,
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
        ...overrides,
    };
}

describe("program offering labels", () => {
    it("maps attendance types to operator-facing labels", () => {
        expect(ATTENDANCE_TYPE_LABELS.full_time).toBe("Full Time");
        expect(ATTENDANCE_TYPE_LABELS.drop_in).toBe("Drop-in");
        expect(ATTENDANCE_TYPE_LABELS.hourly).toBe("Hourly");
    });
});

describe("isOfferingVisible", () => {
    it("active and is_active=true => visible", () => {
        expect(isOfferingVisible(makeOffering({ status: "active", is_active: true }))).toBe(true);
    });

    it("coming_soon => visible", () => {
        expect(isOfferingVisible(makeOffering({ status: "coming_soon" }))).toBe(true);
    });

    it("seasonal => visible", () => {
        expect(isOfferingVisible(makeOffering({ status: "seasonal" }))).toBe(true);
    });

    it("draft => not visible", () => {
        expect(isOfferingVisible(makeOffering({ status: "draft" }))).toBe(false);
    });

    it("archived => not visible", () => {
        expect(isOfferingVisible(makeOffering({ status: "archived" }))).toBe(false);
    });

    it("retired => not visible", () => {
        expect(isOfferingVisible(makeOffering({ status: "retired" }))).toBe(false);
    });

    it("is_active=false => not visible regardless of status", () => {
        expect(isOfferingVisible(makeOffering({ status: "active", is_active: false }))).toBe(false);
    });
});

describe("sortOfferings", () => {
    it("sorts by sort_order ascending", () => {
        const a = makeOffering({ id: "a", sort_order: 20, label: "Part Time" });
        const b = makeOffering({ id: "b", sort_order: 10, label: "Full Time" });
        const sorted = sortOfferings([a, b]);
        expect(sorted[0].id).toBe("b");
        expect(sorted[1].id).toBe("a");
    });

    it("breaks ties by label alphabetically", () => {
        const a = makeOffering({ id: "a", sort_order: 10, label: "Part Time" });
        const b = makeOffering({ id: "b", sort_order: 10, label: "Full Time" });
        const sorted = sortOfferings([a, b]);
        expect(sorted[0].label).toBe("Full Time");
    });

    it("does not mutate original array", () => {
        const original = [
            makeOffering({ id: "a", sort_order: 20 }),
            makeOffering({ id: "b", sort_order: 10 }),
        ];
        sortOfferings(original);
        expect(original[0].id).toBe("a");
    });
});

// describeOffering removed — quantity variants now live on program_offering_variants, not offerings.
