import { describe, it, expect } from "vitest";
import {
    formatScope,
    frequencyLabel,
    normalizeDueTiming,
    buildBehavior,
    feeIsRequired,
    getPackage,
    isPackageProduct,
    describePackage,
    depositBehavior,
    sortProducts,
    sortCategories,
    sortRevenueCategories,
    activeRevenueCategories,
    isRevenueCategoryMapped,
    revenueCategoryLabel,
    formatGlAccount,
    activeCategories,
    categoryLabel,
    FREQUENCY_OPTIONS,
    COMMERCIAL_TYPE_OPTIONS,
    COMMERCIAL_TYPE_LABELS,
    DUE_TIMING_OPTIONS,
    PACKAGE_UNIT_TYPE_OPTIONS,
    type CommercialProduct,
    type CommercialCategory,
    type CommercialRevenueCategory,
    type CommercialType,
} from "@/lib/commercial/commercialProducts";

const LOCATIONS = [
    { id: "loc-1", name: "Main Campus" },
    { id: "loc-2", name: "East Branch" },
];

function makeProduct(overrides: Partial<CommercialProduct> = {}): CommercialProduct {
    return {
        id: "p1", org_id: "org1", location_id: null, program_key: null,
        name: "Registration Fee", description: null,
        commercial_type: "fee", category_id: null,
        amount_cents: 5000, cadence_key: null, revenue_category: null, revenue_category_id: null,
        effective_start: null, effective_end: null,
        behavior: {}, is_active: true, metadata: {},
        source_table: null, source_id: null,
        created_at: "2026-01-01T00:00:00Z", updated_at: null,
        ...overrides,
    };
}

function makeCategory(overrides: Partial<CommercialCategory> = {}): CommercialCategory {
    return {
        id: "c1", org_id: "org1", key: "registration", label: "Registration",
        sort_order: 10, is_active: true, metadata: {},
        created_at: "2026-01-01T00:00:00Z", updated_at: null,
        ...overrides,
    };
}

describe("COMMERCIAL_TYPE_OPTIONS", () => {
    it("has fee, addon, deposit", () => {
        const keys = COMMERCIAL_TYPE_OPTIONS.map(o => o.key) as CommercialType[];
        expect(keys).toEqual(["fee", "addon", "deposit"]);
    });
    it("labels map matches options", () => {
        expect(COMMERCIAL_TYPE_LABELS.fee).toBe("Fee");
        expect(COMMERCIAL_TYPE_LABELS.addon).toBe("Add-on");
        expect(COMMERCIAL_TYPE_LABELS.deposit).toBe("Deposit");
    });
});

describe("frequencyLabel", () => {
    it("returns One-time for null/empty", () => {
        expect(frequencyLabel(null)).toBe("One-time");
        expect(frequencyLabel("")).toBe("One-time");
    });
    it("maps known keys", () => {
        expect(frequencyLabel("monthly")).toBe("Monthly");
        expect(frequencyLabel("per_session")).toBe("Per session");
    });
    it("falls back to raw key", () => {
        expect(frequencyLabel("quarterly")).toBe("quarterly");
    });
    it("FREQUENCY_OPTIONS starts with One-time / empty key", () => {
        expect(FREQUENCY_OPTIONS[0]).toEqual({ key: "", label: "One-time" });
    });
});

describe("normalizeDueTiming", () => {
    it("passes through human labels", () => {
        expect(normalizeDueTiming("At enrollment")).toBe("At enrollment");
    });
    it("normalizes legacy keys", () => {
        expect(normalizeDueTiming("at_enrollment")).toBe("At enrollment");
        expect(normalizeDueTiming("before_first_day")).toBe("Before first day");
        expect(normalizeDueTiming("at_contract")).toBe("At contract signing");
    });
    it("DUE_TIMING_OPTIONS key equals label (human-readable stored value)", () => {
        DUE_TIMING_OPTIONS.forEach(o => expect(o.key).toBe(o.label));
    });
});

describe("buildBehavior", () => {
    it("fee → { required }", () => {
        expect(buildBehavior("fee", { required: true })).toEqual({ required: true });
        expect(buildBehavior("fee", { required: false })).toEqual({ required: false });
    });
    it("addon without package → {}", () => {
        expect(buildBehavior("addon", { isPackage: false })).toEqual({});
    });
    it("addon with package → { package }", () => {
        expect(buildBehavior("addon", { isPackage: true, packageCount: 5, packageUnit: "sessions", packageExpiresDays: 30 }))
            .toEqual({ package: { unit_count: 5, unit_type: "sessions", expires_days: 30 } });
    });
    it("addon package with 0 count → {} (not a package)", () => {
        expect(buildBehavior("addon", { isPackage: true, packageCount: 0 })).toEqual({});
    });
    it("addon package defaults unit to uses, expires null", () => {
        expect(buildBehavior("addon", { isPackage: true, packageCount: 3 }))
            .toEqual({ package: { unit_count: 3, unit_type: "uses", expires_days: null } });
    });
    it("deposit → { refundable, apply_to_balance, due_timing }", () => {
        expect(buildBehavior("deposit", { refundable: true, applyToBalance: false, dueTiming: "At enrollment" }))
            .toEqual({ refundable: true, apply_to_balance: false, due_timing: "At enrollment" });
    });
    it("deposit defaults due_timing when empty", () => {
        const b = buildBehavior("deposit", {}) as { due_timing: string; refundable: boolean };
        expect(b.due_timing).toBe("At enrollment");
        expect(b.refundable).toBe(true);
    });
});

describe("feeIsRequired", () => {
    it("true when fee behavior.required", () => {
        expect(feeIsRequired(makeProduct({ commercial_type: "fee", behavior: { required: true } }))).toBe(true);
    });
    it("false when not required", () => {
        expect(feeIsRequired(makeProduct({ commercial_type: "fee", behavior: { required: false } }))).toBe(false);
    });
    it("false for non-fee even if behavior has required", () => {
        expect(feeIsRequired(makeProduct({ commercial_type: "addon", behavior: { required: true } }))).toBe(false);
    });
});

describe("getPackage / isPackageProduct / describePackage", () => {
    const pkg = makeProduct({ commercial_type: "addon", behavior: { package: { unit_count: 5, unit_type: "sessions", expires_days: 30 } } });
    it("getPackage returns the package for addon", () => {
        expect(getPackage(pkg)).toEqual({ unit_count: 5, unit_type: "sessions", expires_days: 30 });
    });
    it("getPackage returns null for non-addon", () => {
        expect(getPackage(makeProduct({ commercial_type: "fee", behavior: { package: { unit_count: 5, unit_type: "x", expires_days: null } } }))).toBeNull();
    });
    it("getPackage returns null when unit_count is 0", () => {
        expect(getPackage(makeProduct({ commercial_type: "addon", behavior: { package: { unit_count: 0, unit_type: "x", expires_days: null } } }))).toBeNull();
    });
    it("isPackageProduct reflects presence", () => {
        expect(isPackageProduct(pkg)).toBe(true);
        expect(isPackageProduct(makeProduct({ commercial_type: "addon", behavior: {} }))).toBe(false);
    });
    it("describePackage with expiry", () => {
        expect(describePackage(pkg)).toBe("5 sessions · valid 30 days");
    });
    it("describePackage without expiry", () => {
        expect(describePackage(makeProduct({ commercial_type: "addon", behavior: { package: { unit_count: 10, unit_type: "uses", expires_days: null } } }))).toBe("10 uses");
    });
    it("describePackage empty for non-package", () => {
        expect(describePackage(makeProduct({ commercial_type: "addon", behavior: {} }))).toBe("");
    });
});

describe("depositBehavior", () => {
    it("returns normalized behavior for deposit", () => {
        const d = makeProduct({ commercial_type: "deposit", behavior: { refundable: true, apply_to_balance: true, due_timing: "at_enrollment" } });
        expect(depositBehavior(d)).toEqual({ refundable: true, apply_to_balance: true, due_timing: "At enrollment" });
    });
    it("defaults for missing fields", () => {
        const d = makeProduct({ commercial_type: "deposit", behavior: {} });
        expect(depositBehavior(d)).toEqual({ refundable: true, apply_to_balance: false, due_timing: "At enrollment" });
    });
    it("returns null for non-deposit", () => {
        expect(depositBehavior(makeProduct({ commercial_type: "fee" }))).toBeNull();
    });
});

describe("categories helpers", () => {
    const cats = [
        makeCategory({ id: "c2", label: "Enrollment", sort_order: 20 }),
        makeCategory({ id: "c1", label: "Registration", sort_order: 10 }),
        makeCategory({ id: "c3", label: "Archived", sort_order: 5, is_active: false }),
    ];
    it("sortCategories orders by sort_order then label", () => {
        expect(sortCategories(cats).map(c => c.id)).toEqual(["c3", "c1", "c2"]);
    });
    it("activeCategories excludes inactive and sorts", () => {
        expect(activeCategories(cats).map(c => c.id)).toEqual(["c1", "c2"]);
    });
    it("categoryLabel resolves id", () => {
        expect(categoryLabel("c2", cats)).toBe("Enrollment");
        expect(categoryLabel(null, cats)).toBe("");
        expect(categoryLabel("missing", cats)).toBe("");
    });
});

describe("sortRevenueCategories", () => {
    function rc(overrides: Partial<CommercialRevenueCategory>): CommercialRevenueCategory {
        return { id: "r", org_id: "o", label: "X", gl_code: null, mapped_gl_account_id: null, sort_order: 100, is_active: true, metadata: {}, created_at: "", updated_at: null, ...overrides };
    }
    it("orders by sort_order then label", () => {
        const cats = [rc({ id: "b", label: "Beta", sort_order: 20 }), rc({ id: "a", label: "Alpha", sort_order: 10 }), rc({ id: "c", label: "Gamma", sort_order: 10 })];
        expect(sortRevenueCategories(cats).map(c => c.id)).toEqual(["a", "c", "b"]);
    });
    it("does not mutate input", () => {
        const cats = [rc({ label: "Z", sort_order: 2 }), rc({ label: "A", sort_order: 1 })];
        sortRevenueCategories(cats);
        expect(cats[0].label).toBe("Z");
    });
    it("preserves gl_code through sort", () => {
        const cats = [rc({ label: "Program Revenue", gl_code: "4000-100" })];
        expect(sortRevenueCategories(cats)[0].gl_code).toBe("4000-100");
    });
});

describe("revenue category mapping helpers", () => {
    function rc(overrides: Partial<CommercialRevenueCategory>): CommercialRevenueCategory {
        return { id: "r", org_id: "o", label: "Program Revenue", gl_code: null, mapped_gl_account_id: null, sort_order: 100, is_active: true, metadata: {}, created_at: "", updated_at: null, ...overrides };
    }
    it("isRevenueCategoryMapped true only when mapped_gl_account_id set", () => {
        expect(isRevenueCategoryMapped(rc({ mapped_gl_account_id: "gl-1" }))).toBe(true);
        expect(isRevenueCategoryMapped(rc({ mapped_gl_account_id: null }))).toBe(false);
    });
    it("activeRevenueCategories excludes inactive and sorts", () => {
        const cats = [rc({ id: "b", label: "Beta", sort_order: 20 }), rc({ id: "a", label: "Alpha", sort_order: 10 }), rc({ id: "c", label: "Gone", is_active: false, sort_order: 5 })];
        expect(activeRevenueCategories(cats).map(c => c.id)).toEqual(["a", "b"]);
    });
    it("revenueCategoryLabel resolves id", () => {
        const cats = [rc({ id: "x", label: "Enrichment" })];
        expect(revenueCategoryLabel("x", cats)).toBe("Enrichment");
        expect(revenueCategoryLabel(null, cats)).toBe("");
        expect(revenueCategoryLabel("missing", cats)).toBe("");
    });
    it("formatGlAccount renders code · name", () => {
        expect(formatGlAccount({ code: "4000", name: "Tuition Revenue" })).toBe("4000 · Tuition Revenue");
    });
});

describe("sortProducts", () => {
    it("sorts by name", () => {
        const ps = [makeProduct({ id: "b", name: "Zebra" }), makeProduct({ id: "a", name: "Apple" })];
        expect(sortProducts(ps).map(p => p.name)).toEqual(["Apple", "Zebra"]);
    });
    it("does not mutate input", () => {
        const ps = [makeProduct({ name: "Z" }), makeProduct({ name: "A" })];
        sortProducts(ps);
        expect(ps[0].name).toBe("Z");
    });
});

describe("formatScope", () => {
    it("All programs when both null", () => {
        expect(formatScope(null, null, LOCATIONS)).toBe("All programs");
    });
    it("program only", () => {
        expect(formatScope(null, "infant", LOCATIONS)).toBe("infant");
    });
    it("location only", () => {
        expect(formatScope("loc-1", null, LOCATIONS)).toBe("Main Campus");
    });
    it("both", () => {
        expect(formatScope("loc-2", "toddler", LOCATIONS)).toBe("toddler · East Branch");
    });
    it("unknown location dropped", () => {
        expect(formatScope("loc-x", null, LOCATIONS)).toBe("All programs");
    });
    it("resolves program label when programs provided", () => {
        const programs = [{ key: "infant", label: "Infant" }, { key: "toddler", label: "Toddler" }];
        expect(formatScope(null, "infant", LOCATIONS, programs)).toBe("Infant");
        expect(formatScope("loc-1", "toddler", LOCATIONS, programs)).toBe("Toddler · Main Campus");
    });
    it("falls back to raw program key when no match", () => {
        expect(formatScope(null, "preschool", LOCATIONS, [{ key: "infant", label: "Infant" }])).toBe("preschool");
    });
});

describe("PACKAGE_UNIT_TYPE_OPTIONS", () => {
    it("covers uses/sessions/days/hours", () => {
        expect(PACKAGE_UNIT_TYPE_OPTIONS).toEqual(["uses", "sessions", "days", "hours"]);
    });
});
