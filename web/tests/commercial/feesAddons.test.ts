import { describe, it, expect } from "vitest";
import {
    formatScope,
    frequencyLabel,
    isPackageAddon,
    describePackage,
    normalizeDueTiming,
    FREQUENCY_OPTIONS,
    COMMERCIAL_TYPE_OPTIONS,
    DUE_TIMING_OPTIONS,
    FEE_TYPE_SUGGESTIONS,
    ADDON_TYPE_SUGGESTIONS,
    DEPOSIT_TIMING_SUGGESTIONS,
    PACKAGE_UNIT_TYPE_OPTIONS,
    type CommercialAddon,
    type CommercialType,
} from "@/lib/commercial/feesAddons";

const LOCATIONS = [
    { id: "loc-1", name: "Main Campus" },
    { id: "loc-2", name: "East Branch" },
];

function makeAddon(overrides: Partial<CommercialAddon> = {}): CommercialAddon {
    return {
        id: "a1", org_id: "org1", location_id: null, program_key: null,
        name: "Extended Care", description: null, addon_type: "Extended care",
        amount_cents: 25000, cadence_key: "monthly",
        effective_start: null, effective_end: null, revenue_category: null,
        package_unit_count: null, package_unit_type: null, package_expires_days: null,
        is_active: true, metadata: {}, created_at: "2026-01-01T00:00:00Z", updated_at: null,
        ...overrides,
    };
}

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

describe("frequencyLabel", () => {
    it("returns 'One-time' for null", () => {
        expect(frequencyLabel(null)).toBe("One-time");
    });
    it("returns 'One-time' for empty string", () => {
        expect(frequencyLabel("")).toBe("One-time");
    });
    it("returns human label for known cadence", () => {
        expect(frequencyLabel("monthly")).toBe("Monthly");
        expect(frequencyLabel("weekly")).toBe("Weekly");
        expect(frequencyLabel("annual")).toBe("Annual");
        expect(frequencyLabel("per_session")).toBe("Per session");
        expect(frequencyLabel("per_use")).toBe("Per use");
    });
    it("falls back to the raw key for unknown cadence", () => {
        expect(frequencyLabel("quarterly")).toBe("quarterly");
    });
});

describe("FREQUENCY_OPTIONS", () => {
    it("has One-time as the first option with empty key", () => {
        expect(FREQUENCY_OPTIONS[0].key).toBe("");
        expect(FREQUENCY_OPTIONS[0].label).toBe("One-time");
    });
    it("includes monthly, weekly, annual, per_session, per_use", () => {
        const keys = FREQUENCY_OPTIONS.map(o => o.key);
        expect(keys).toContain("monthly");
        expect(keys).toContain("weekly");
        expect(keys).toContain("annual");
        expect(keys).toContain("per_session");
        expect(keys).toContain("per_use");
    });
});

describe("isPackageAddon", () => {
    it("returns false when package_unit_count is null", () => {
        expect(isPackageAddon(makeAddon())).toBe(false);
    });
    it("returns true when package_unit_count > 0", () => {
        expect(isPackageAddon(makeAddon({ package_unit_count: 5 }))).toBe(true);
    });
    it("returns false when package_unit_count is 0", () => {
        expect(isPackageAddon(makeAddon({ package_unit_count: 0 }))).toBe(false);
    });
});

describe("describePackage", () => {
    it("returns empty string for non-package addon", () => {
        expect(describePackage(makeAddon())).toBe("");
    });
    it("describes count + unit", () => {
        const a = makeAddon({ package_unit_count: 5, package_unit_type: "sessions", package_expires_days: null });
        expect(describePackage(a)).toBe("5 sessions");
    });
    it("includes expiry when set", () => {
        const a = makeAddon({ package_unit_count: 10, package_unit_type: "uses", package_expires_days: 30 });
        expect(describePackage(a)).toBe("10 uses · valid 30 days");
    });
    it("defaults unit type to 'uses' when null", () => {
        const a = makeAddon({ package_unit_count: 3, package_unit_type: null });
        expect(describePackage(a)).toBe("3 uses");
    });
});

describe("normalizeDueTiming", () => {
    it("passes through human labels unchanged", () => {
        expect(normalizeDueTiming("At enrollment")).toBe("At enrollment");
        expect(normalizeDueTiming("Before first day")).toBe("Before first day");
    });
    it("normalizes legacy internal keys", () => {
        expect(normalizeDueTiming("at_enrollment")).toBe("At enrollment");
        expect(normalizeDueTiming("before_first_day")).toBe("Before first day");
        expect(normalizeDueTiming("upon_acceptance")).toBe("Upon acceptance");
    });
    it("passes through unknown values unchanged", () => {
        expect(normalizeDueTiming("custom timing")).toBe("custom timing");
    });
});

describe("COMMERCIAL_TYPE_OPTIONS", () => {
    it("has fee, addon, deposit keys", () => {
        const keys = COMMERCIAL_TYPE_OPTIONS.map(o => o.key) as CommercialType[];
        expect(keys).toContain("fee");
        expect(keys).toContain("addon");
        expect(keys).toContain("deposit");
    });
    it("all options have non-empty label and description", () => {
        COMMERCIAL_TYPE_OPTIONS.forEach(o => {
            expect(o.label.length).toBeGreaterThan(0);
            expect(o.description.length).toBeGreaterThan(0);
        });
    });
});

describe("DUE_TIMING_OPTIONS", () => {
    it("includes At enrollment as first option", () => {
        expect(DUE_TIMING_OPTIONS[0].key).toBe("At enrollment");
        expect(DUE_TIMING_OPTIONS[0].label).toBe("At enrollment");
    });
    it("all options have matching key and label (human-readable stored value)", () => {
        DUE_TIMING_OPTIONS.forEach(o => {
            expect(o.key).toBe(o.label);
        });
    });
    it("includes 'Before first day' and 'Upon acceptance'", () => {
        const keys = DUE_TIMING_OPTIONS.map(o => o.key);
        expect(keys).toContain("Before first day");
        expect(keys).toContain("Upon acceptance");
    });
});

describe("suggestion arrays", () => {
    it("FEE_TYPE_SUGGESTIONS is non-empty strings", () => {
        expect(FEE_TYPE_SUGGESTIONS.length).toBeGreaterThan(0);
        FEE_TYPE_SUGGESTIONS.forEach(s => expect(typeof s).toBe("string"));
    });
    it("ADDON_TYPE_SUGGESTIONS is non-empty strings", () => {
        expect(ADDON_TYPE_SUGGESTIONS.length).toBeGreaterThan(0);
    });
    it("DEPOSIT_TIMING_SUGGESTIONS includes at_enrollment variant", () => {
        expect(DEPOSIT_TIMING_SUGGESTIONS.some(s => s.toLowerCase().includes("enrollment"))).toBe(true);
    });
    it("PACKAGE_UNIT_TYPE_OPTIONS covers uses, sessions, days, hours", () => {
        expect(PACKAGE_UNIT_TYPE_OPTIONS).toContain("uses");
        expect(PACKAGE_UNIT_TYPE_OPTIONS).toContain("sessions");
        expect(PACKAGE_UNIT_TYPE_OPTIONS).toContain("days");
        expect(PACKAGE_UNIT_TYPE_OPTIONS).toContain("hours");
    });
});
