import { describe, expect, it } from "vitest";
import {
    COMMERCIAL_POLICY_REGISTRY,
    COMMERCIAL_POLICY_TYPES,
    commercialPolicyValueSummary,
    validateCommercialPolicyValue,
} from "@/lib/commercial/execution/policy/policyTypes";
import { resolveScopeColumns } from "@/app/api/admin/commercial/policies/route";

/**
 * Operator Completion — the Policies UI is generated from this registry, so the
 * registry's validation + summary are the contract the form and API depend on.
 */

describe("commercial policy registry", () => {
    it("has a definition for every policy type", () => {
        for (const t of COMMERCIAL_POLICY_TYPES) {
            expect(COMMERCIAL_POLICY_REGISTRY[t]).toBeTruthy();
            expect(COMMERCIAL_POLICY_REGISTRY[t].label).toBeTruthy();
        }
    });
});

describe("validateCommercialPolicyValue", () => {
    it("validates a percentage discount and drops the hidden amount field", () => {
        const r = validateCommercialPolicyValue("discount", { basis: "percentage", value: 10, applies_to: "tuition", ignored: "x" });
        expect(r).toEqual({ ok: true, value: { basis: "percentage", value: 10, applies_to: "tuition" } });
    });

    it("rejects a percentage over 100", () => {
        const r = validateCommercialPolicyValue("discount", { basis: "percentage", value: 150, applies_to: "all" });
        expect(r.ok).toBe(false);
    });

    it("requires a select value (applies_to)", () => {
        const r = validateCommercialPolicyValue("waiver", {});
        expect(r.ok).toBe(false);
    });

    it("normalizes a yes/no approval field", () => {
        expect(validateCommercialPolicyValue("approval", { required: "yes" })).toEqual({ ok: true, value: { required: true } });
        expect(validateCommercialPolicyValue("approval", { required: false })).toEqual({ ok: true, value: { required: false } });
    });

    it("accepts eligibility with no fields", () => {
        expect(validateCommercialPolicyValue("eligibility", {})).toEqual({ ok: true, value: {} });
    });

    it("validates sibling discount incl. min_siblings", () => {
        const r = validateCommercialPolicyValue("sibling_discount", { basis: "percentage", value: 15, min_siblings: 2, applies_to_rank: "subsequent" });
        expect(r).toEqual({ ok: true, value: { basis: "percentage", value: 15, min_siblings: 2, applies_to_rank: "subsequent" } });
    });
});

describe("commercialPolicyValueSummary", () => {
    it("summarizes a percentage discount", () => {
        expect(commercialPolicyValueSummary("discount", { basis: "percentage", value: 10, applies_to: "tuition" })).toBe("10% off tuition only");
    });
    it("summarizes a fixed-amount waiver / approval", () => {
        expect(commercialPolicyValueSummary("waiver", { applies_to: "fees" })).toBe("Waive fees & add-ons");
        expect(commercialPolicyValueSummary("approval", { required: true })).toBe("Review required");
    });
    it("summarizes a fixed-amount discount in dollars", () => {
        expect(commercialPolicyValueSummary("discount", { basis: "amount", value: 5000, applies_to: "all" })).toBe("$50.00 off everything");
    });
});

describe("resolveScopeColumns", () => {
    it("defaults to org scope", () => {
        expect(resolveScopeColumns({})).toMatchObject({ ok: true, cols: { scope_type: "org", location_id: null, program_key: null } });
    });
    it("requires the matching ref for a scoped policy", () => {
        expect(resolveScopeColumns({ scope_type: "program" }).ok).toBe(false);
        expect(resolveScopeColumns({ scope_type: "program", program_key: "toddler" })).toMatchObject({ ok: true, cols: { program_key: "toddler" } });
    });
    it("rejects an invalid scope type", () => {
        expect(resolveScopeColumns({ scope_type: "galaxy" }).ok).toBe(false);
    });
});
