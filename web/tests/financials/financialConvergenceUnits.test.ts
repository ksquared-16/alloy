import { describe, expect, it } from "vitest";
import {
    chargeCategoryLabel,
    listChargeCategories,
    CHARGE_CATEGORY_GL_MAPPING_KEY,
} from "@/lib/financials/chargeCategories";
import {
    resolveChargeCategoryGlChain,
    resolveGlAccountForMappingKey,
} from "@/lib/financials/accounting/resolveGlMapping";
import {
    slugifyServiceKey,
    validateServiceFields,
} from "@/lib/financials/services/financialServicesStore";
import { buildFinancialConfigDemoDataset } from "@/lib/financials/demo/financialConfigDemoDataset";
import type { GlAccountMappingRow, GlAccountRow } from "@/lib/financials/gl/glConfigTypes";

// ---------------------------------------------------------------------------
// Charge categories + GL resolution
// ---------------------------------------------------------------------------

function account(id: string, code: string): GlAccountRow {
    return { id, org_id: "o", code, name: `Acct ${code}`, type: "revenue", currency: "USD", is_active: true, metadata: {}, created_at: "", updated_at: null };
}
function mapping(key: string, accountId: string, active = true): GlAccountMappingRow {
    return { id: `m_${key}`, org_id: "o", key, gl_account_id: accountId, is_active: active, metadata: {}, created_at: "", updated_at: null };
}

describe("chargeCategories", () => {
    it("labels categories and exposes a GL mapping key per category", () => {
        expect(chargeCategoryLabel("tuition")).toBe("Tuition");
        expect(CHARGE_CATEGORY_GL_MAPPING_KEY.tuition).toBe("tuition_revenue");
        const list = listChargeCategories();
        expect(list.find((c) => c.key === "tuition")).toMatchObject({ label: "Tuition", mappingKey: "tuition_revenue" });
    });
});

describe("resolveGlMapping — Charge Category → GL Mapping → GL Account", () => {
    const accounts = [account("a1", "4000"), account("a2", "2000")];
    const mappings = [mapping("tuition_revenue", "a1"), mapping("deposit_liability", "a2")];

    it("resolves a mapped category to its account", () => {
        const chain = resolveChargeCategoryGlChain(mappings, accounts);
        const tuition = chain.find((c) => c.categoryKey === "tuition");
        expect(tuition?.mapped).toBe(true);
        expect(tuition?.account?.code).toBe("4000");
    });

    it("marks an unmapped category", () => {
        const chain = resolveChargeCategoryGlChain([mapping("tuition_revenue", "a1")], accounts);
        const deposit = chain.find((c) => c.categoryKey === "deposit");
        expect(deposit?.mapped).toBe(false);
        expect(deposit?.account).toBeNull();
    });

    it("ignores inactive mappings", () => {
        expect(resolveGlAccountForMappingKey("tuition_revenue", [mapping("tuition_revenue", "a1", false)], accounts)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Financial services store (pure helpers)
// ---------------------------------------------------------------------------

describe("financialServicesStore — pure validation", () => {
    it("slugifies keys and derives the key from the label", () => {
        expect(slugifyServiceKey("Full-Time Care")).toBe("full_time_care");
        const fields = validateServiceFields({ label: "Before Care", serviceType: "recurring" });
        expect(fields).toMatchObject({ service_key: "before_care", service_type: "recurring", label: "Before Care" });
    });

    it("rejects an invalid service type and a blank label", () => {
        expect(() => validateServiceFields({ label: "X", serviceType: "nope" })).toThrow();
        expect(() => validateServiceFields({ label: "  ", serviceType: "recurring" })).toThrow();
    });
});

// ---------------------------------------------------------------------------
// Demo dataset
// ---------------------------------------------------------------------------

describe("financialConfigDemoDataset", () => {
    it("builds services, GL, and multi-version rate plans relative to the pivot year", () => {
        const ds = buildFinancialConfigDemoDataset(2026);
        expect(ds.services.length).toBeGreaterThanOrEqual(5);
        expect(ds.glAccounts.some((a) => a.code === "4000")).toBe(true);
        expect(ds.glMappings.some((m) => m.key === "tuition_revenue")).toBe(true);

        const standard = ds.ratePlans.find((p) => p.planKey === "standard_tuition")!;
        // historical, current, future versions
        expect(standard.versions.map((v) => v.effectiveStart)).toEqual(["2025-01-01", "2026-01-01", "2027-01-01"]);
        // amounts increase over versions (timeline tells a story)
        const fiveDay = standard.versions.map((v) => v.rules.find((r) => r.scheduleBasis === "five_day")!.amountCents);
        expect(fiveDay).toEqual([110000, 120000, 130000]);
    });

    it("is deterministic for a given pivot year (idempotent shape)", () => {
        expect(buildFinancialConfigDemoDataset(2026)).toEqual(buildFinancialConfigDemoDataset(2026));
    });

    it("includes demo charge templates with valid amount/offset shapes", () => {
        const ds = buildFinancialConfigDemoDataset(2026);
        expect(ds.chargeTemplates.length).toBeGreaterThanOrEqual(5);
        const fieldTrip = ds.chargeTemplates.find((t) => t.templateKey === "field_trip")!;
        expect(fieldTrip).toMatchObject({ billableOn: "offset_days", billableOffsetDays: 21, amountStrategy: "fixed" });
        // usage-derived templates carry no fixed amount
        const diapers = ds.chargeTemplates.find((t) => t.templateKey === "diapers")!;
        expect(diapers.amountStrategy).toBe("usage_derived");
    });

    it("includes demo financial policies at multiple scopes", () => {
        const ds = buildFinancialConfigDemoDataset(2026);
        expect(ds.policies.length).toBeGreaterThanOrEqual(5);
        expect(ds.policies.some((p) => p.scopeType === "org" && p.policyType === "proration")).toBe(true);
        expect(ds.policies.some((p) => p.scopeType === "service")).toBe(true);
        expect(ds.policies.some((p) => p.scopeType === "rate_plan")).toBe(true);
    });
});
