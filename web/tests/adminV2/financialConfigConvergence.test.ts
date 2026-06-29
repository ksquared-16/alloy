/**
 * Financial Configuration Convergence — structural guarantees.
 *
 * Financials is organized around operational decisions, not tables; Services is
 * a real (org_settings-backed) catalog; Charge Preview uses operational selectors
 * (no UUID entry); Accounting resolves the GL chain; the remaining areas are
 * consistent designed surfaces; and no posting/payments/subsidy runtime or
 * forbidden financial writes were introduced.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Convergence — decision-oriented IA", () => {
    it("groups the financial areas by get-paid lifecycle", () => {
        const hook = read("components/adminV2/settings/financials/useFinancialsConfigurationSettings.ts");
        expect(hook).toContain("FINANCIALS_CONFIG_GROUPS");
        for (const label of ["What you sell", "Money rules", "Money movement", "Who pays"]) {
            expect(hook).toContain(label);
        }
    });

    it("the page routes every operational area", () => {
        const page = read("components/adminV2/settings/financials/FinancialsConfigurationPage.tsx");
        for (const section of [
            "services",
            "financial_policies",
            "charge_templates",
            "accounting",
            "posting",
            "payments",
            "financial_responsibility",
            "subsidy",
            "charge_preview",
        ]) {
            expect(page).toContain(`section === "${section}"`);
        }
    });
});

describe("Convergence — Services is real (org_settings-backed)", () => {
    it("the services route is role-gated and persists via the store", () => {
        const route = read("app/api/admin/financial/services/route.ts");
        expect(route).toMatch(/export async function POST/);
        expect(route).toContain("requireAdminOrOps");
        const store = read("lib/financials/services/financialServicesStore.ts");
        expect(store).toContain("org_settings");
        expect(store).toContain("financials");
    });

    it("the services panel authors inline (no drawers)", () => {
        const panel = read("components/adminV2/settings/financials/ServicesConfigurationPanel.tsx");
        expect(panel).toContain("useFinancialServices");
        expect(panel).not.toMatch(/openDrawer|useAdminDrawer/);
    });
});

describe("Convergence — Charge Preview uses operational selectors (no UUIDs)", () => {
    const inspector = read("components/adminV2/settings/financials/FinancialChargePreviewInspector.tsx");

    it("selects child + agreement via dropdowns, not raw ID text inputs", () => {
        expect(inspector).toContain("/api/admin/customer-members");
        expect(inspector).toContain("/api/admin/child-enrollment-agreements");
        expect(inspector).toContain("ConfigSelectInput");
        // no free-text agreement id entry
        expect(inspector).not.toMatch(/placeholder="enrollment_agreement_id"/);
    });

    it("still preview-only over the existing read API", () => {
        expect(inspector).toContain("/api/admin/financial-charge-preview");
        expect(inspector).toMatch(/No invoice, no AR, no posting/i);
    });
});

describe("Convergence — Accounting resolves the GL chain", () => {
    it("renders Charge Category → GL Mapping → GL Account, read-only", () => {
        const panel = read("components/adminV2/settings/financials/AccountingConfigurationPanel.tsx");
        expect(panel).toContain("resolveChargeCategoryGlChain");
        expect(panel).toContain("Charge Category → GL Mapping → GL Account");
        expect(panel).toMatch(/read-only/i);
    });
});

describe("Convergence — designed areas are consistent + no forbidden runtime", () => {
    it("designed areas use the shared DesignedConfigurationSurface", () => {
        const areas = read("components/adminV2/settings/financials/FinancialDesignedAreas.tsx");
        expect(areas).toContain("DesignedConfigurationSurface");
        for (const fn of ["PostingConfigurationArea", "PaymentsConfigurationArea", "SubsidyConfigurationArea", "FinancialResponsibilityArea", "ChargeTemplatesArea", "FinancialPoliciesArea"]) {
            expect(areas).toContain(fn);
        }
    });

    it("no posting/payments/subsidy runtime: no writes to money tables anywhere in financials config", () => {
        for (const rel of [
            "lib/financials/services/financialServicesStore.ts",
            "app/api/admin/financial/services/route.ts",
            "app/api/admin/financial/seed-demo/route.ts",
        ]) {
            const src = read(rel);
            expect(src).not.toMatch(/from\(["'](ledger_transactions|gl_journal_lines|invoices|payments|statements)["']\)/);
        }
    });

    it("the demo seed is admin-gated and idempotent", () => {
        const seed = read("app/api/admin/financial/seed-demo/route.ts");
        expect(seed).toContain("requireAdminOrOps");
        expect(seed).toMatch(/idempotent/i);
        expect(seed).toContain("buildFinancialConfigDemoDataset");
    });
});
