import { describe, it, expect } from "vitest";
import {
    formatScope,
    FEE_TYPE_LABELS,
    ADDON_TYPE_LABELS,
    DEPOSIT_TIMING_LABELS,
    type FeeType,
    type AddonType,
    type DepositTiming,
} from "@/lib/commercial/feesAddons";

const LOCATIONS = [
    { id: "loc-1", name: "Main Campus" },
    { id: "loc-2", name: "East Branch" },
];

describe("formatScope", () => {
    it("returns 'All programs' when both null", () => {
        expect(formatScope(null, null, LOCATIONS)).toBe("All programs");
    });

    it("returns programKey only when locationId is null", () => {
        expect(formatScope(null, "infant", LOCATIONS)).toBe("infant");
    });

    it("returns location name only when programKey is null", () => {
        expect(formatScope("loc-1", null, LOCATIONS)).toBe("Main Campus");
    });

    it("returns programKey · location name when both set", () => {
        expect(formatScope("loc-2", "toddler", LOCATIONS)).toBe("toddler · East Branch");
    });

    it("omits unknown locationId from output", () => {
        expect(formatScope("loc-unknown", null, LOCATIONS)).toBe("All programs");
    });

    it("still includes programKey even if locationId is unknown", () => {
        expect(formatScope("loc-unknown", "preschool", LOCATIONS)).toBe("preschool");
    });
});

describe("FEE_TYPE_LABELS completeness", () => {
    const ALL_FEE_TYPES: FeeType[] = ["registration", "application", "materials", "annual", "other"];

    it("has a label for every FeeType", () => {
        for (const t of ALL_FEE_TYPES) {
            expect(FEE_TYPE_LABELS[t], `Missing label for fee_type '${t}'`).toBeTruthy();
        }
    });

    it("has no extra keys beyond the defined FeeType values", () => {
        expect(Object.keys(FEE_TYPE_LABELS).sort()).toEqual([...ALL_FEE_TYPES].sort());
    });
});

describe("ADDON_TYPE_LABELS completeness", () => {
    const ALL_ADDON_TYPES: AddonType[] = ["extended_care", "enrichment", "lunch", "transport", "other"];

    it("has a label for every AddonType", () => {
        for (const t of ALL_ADDON_TYPES) {
            expect(ADDON_TYPE_LABELS[t], `Missing label for addon_type '${t}'`).toBeTruthy();
        }
    });

    it("has no extra keys beyond the defined AddonType values", () => {
        expect(Object.keys(ADDON_TYPE_LABELS).sort()).toEqual([...ALL_ADDON_TYPES].sort());
    });
});

describe("DEPOSIT_TIMING_LABELS completeness", () => {
    const ALL_TIMINGS: DepositTiming[] = ["at_enrollment", "at_acceptance", "at_contract", "other"];

    it("has a label for every DepositTiming", () => {
        for (const t of ALL_TIMINGS) {
            expect(DEPOSIT_TIMING_LABELS[t], `Missing label for due_timing '${t}'`).toBeTruthy();
        }
    });

    it("has no extra keys beyond the defined DepositTiming values", () => {
        expect(Object.keys(DEPOSIT_TIMING_LABELS).sort()).toEqual([...ALL_TIMINGS].sort());
    });
});
