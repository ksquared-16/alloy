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
    normalizeFinancialService,
    parseFinancialServices,
    slugifyServiceKey,
    upsertServiceInList,
    type FinancialService,
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

describe("financialServicesStore — pure helpers", () => {
    it("slugifies keys and derives a key from the label", () => {
        expect(slugifyServiceKey("Full-Time Care")).toBe("full_time_care");
        const svc = normalizeFinancialService({ label: "Before Care", serviceType: "recurring" }, "svc_1");
        expect(svc).toMatchObject({ id: "svc_1", key: "before_care", serviceType: "recurring", isActive: true });
    });

    it("rejects an invalid service type and a blank label", () => {
        expect(() => normalizeFinancialService({ label: "X", serviceType: "nope" }, "id")).toThrow();
        expect(() => normalizeFinancialService({ label: "  ", serviceType: "recurring" }, "id")).toThrow();
    });

    it("upsert rejects a duplicate key on another service", () => {
        const a: FinancialService = { id: "1", key: "meals", label: "Meals", serviceType: "usage", unit: null, isActive: true, sortOrder: 0 };
        const b: FinancialService = { id: "2", key: "meals", label: "Meals 2", serviceType: "usage", unit: null, isActive: true, sortOrder: 1 };
        expect(() => upsertServiceInList([a], b)).toThrow();
        // same id replaces in place
        expect(upsertServiceInList([a], { ...a, label: "Meals X" })).toHaveLength(1);
    });

    it("parses stored services and drops malformed entries", () => {
        const parsed = parseFinancialServices([
            { id: "1", label: "A", serviceType: "recurring" },
            { id: "2", label: "B" }, // missing type → dropped
            "garbage",
        ]);
        expect(parsed).toHaveLength(1);
        expect(parsed[0].key).toBe("a");
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
});
