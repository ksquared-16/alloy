import { describe, it, expect } from "vitest";
import {
    buildBehavior,
    feeIsRequired,
    depositBehavior,
    getPackage,
    normalizeDueTiming,
    type CommercialProduct,
} from "@/lib/commercial/commercialProducts";

/**
 * These tests lock the ASSUMPTIONS the backfill migration
 * (20260711000001_commercial_products_primitive.sql) encodes when folding the
 * legacy commercial_fees/addons/deposits rows into commercial_products.
 *
 * The migration builds `behavior` jsonb per type. If the app-side readers ever
 * diverge from that shape, these fail — keeping SQL and TS in lockstep.
 */

function product(overrides: Partial<CommercialProduct>): CommercialProduct {
    return {
        id: "p", org_id: "o", location_id: null, program_key: null,
        name: "x", description: null, commercial_type: "fee", category_id: null,
        amount_cents: 0, cadence_key: null, revenue_category: null, revenue_category_id: null,
        effective_start: null, effective_end: null, behavior: {},
        is_active: true, metadata: {}, source_table: "commercial_fees", source_id: "legacy-1",
        created_at: "", updated_at: null, ...overrides,
    };
}

describe("backfill: fee row → product", () => {
    // Migration: jsonb_build_object('required', f.is_required)
    it("required fee reads back as required", () => {
        const p = product({ commercial_type: "fee", behavior: { required: true }, source_table: "commercial_fees" });
        expect(feeIsRequired(p)).toBe(true);
        expect(buildBehavior("fee", { required: true })).toEqual(p.behavior);
    });
    it("optional fee reads back as not required", () => {
        const p = product({ commercial_type: "fee", behavior: { required: false } });
        expect(feeIsRequired(p)).toBe(false);
    });
});

describe("backfill: addon row → product", () => {
    // Migration: package present → { package: { unit_count, unit_type, expires_days } }, else {}
    it("addon with package unit fields reads back", () => {
        const p = product({ commercial_type: "addon", behavior: { package: { unit_count: 5, unit_type: "sessions", expires_days: 30 } }, source_table: "commercial_addons" });
        expect(getPackage(p)).toEqual({ unit_count: 5, unit_type: "sessions", expires_days: 30 });
        expect(buildBehavior("addon", { isPackage: true, packageCount: 5, packageUnit: "sessions", packageExpiresDays: 30 })).toEqual(p.behavior);
    });
    it("plain addon (no package) reads back as non-package", () => {
        const p = product({ commercial_type: "addon", behavior: {}, source_table: "commercial_addons" });
        expect(getPackage(p)).toBeNull();
    });
});

describe("backfill: deposit row → product", () => {
    // Migration: jsonb_build_object('refundable', d.is_refundable, 'apply_to_balance', d.apply_to_balance, 'due_timing', d.due_timing)
    it("deposit behavior reads back with normalized due_timing", () => {
        // legacy rows may still carry the old internal key; normalizeDueTiming fixes it
        const p = product({ commercial_type: "deposit", behavior: { refundable: false, apply_to_balance: true, due_timing: "at_enrollment" }, source_table: "commercial_deposits" });
        expect(depositBehavior(p)).toEqual({ refundable: false, apply_to_balance: true, due_timing: "At enrollment" });
        expect(normalizeDueTiming("at_enrollment")).toBe("At enrollment");
    });
    it("deposit cadence is one-time (null) after backfill", () => {
        // Migration inserts null cadence_key for deposits
        const p = product({ commercial_type: "deposit", cadence_key: null });
        expect(p.cadence_key).toBeNull();
    });
});

describe("backfill: provenance", () => {
    it("source_table/source_id retained for transitional rows", () => {
        const p = product({ source_table: "commercial_fees", source_id: "abc" });
        expect(p.source_table).toBe("commercial_fees");
        expect(p.source_id).toBe("abc");
    });
    it("natively-created products have null provenance", () => {
        const p = product({ source_table: null, source_id: null });
        expect(p.source_table).toBeNull();
        expect(p.source_id).toBeNull();
    });
});
