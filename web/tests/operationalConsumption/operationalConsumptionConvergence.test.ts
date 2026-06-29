/**
 * Operational Consumption — structural guarantees (Slice 1).
 *
 * Operational Consumption is the runtime interpretation layer between Operational
 * Execution and Commercial / Financial Resolution. It records Consumption Events,
 * resolves draft obligations through the EXISTING Charge Template resolver, and
 * writes ONLY safe draft objects. It posts nothing and writes no
 * ledger/invoice/payment/statement. Posting stays the only authoritative write.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(__dirname, "../..");
const repoRoot = resolve(__dirname, "../../..");
function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}
function readRepo(rel: string): string {
    return readFileSync(resolve(repoRoot, rel), "utf8");
}

describe("Operational Consumption — additive schema", () => {
    const sql = readRepo("supabase/migrations/20260706120000_operational_consumption_foundation.sql");

    it("creates the three consumption tables with RLS + org isolation + updated_at triggers", () => {
        for (const t of ["consumption_event_types", "consumption_events", "resolved_obligations"]) {
            expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
            expect(sql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
        }
        expect(sql).toContain("has_org_role");
        expect(sql).toContain("set_updated_at");
    });

    it("is additive only — alters no frozen money table", () => {
        expect(sql).not.toMatch(/ALTER TABLE public\.(charges|ledger_transactions|gl_journal_lines|invoices|payments|statements)\b/);
        // no parallel money table created (FK references to public.charges are fine)
        expect(sql).not.toMatch(/CREATE TABLE (IF NOT EXISTS )?public\.(charges|invoices|payments|ledger_transactions|gl_journal_lines|statements)\b/i);
    });

    it("links obligations to a DRAFT charge (charges) + the Commercial Model template/service, not money tables", () => {
        expect(sql).toContain("draft_charge_id uuid REFERENCES public.charges (id)");
        expect(sql).toContain("REFERENCES public.financial_charge_templates");
        expect(sql).toContain("REFERENCES public.financial_services");
        expect(sql).not.toMatch(/REFERENCES public\.(ledger_transactions|gl_journal_lines|invoices|payments)/);
    });

    it("seeds enrollment.registration as a global event type mapped to the registration_fee template", () => {
        const seed = readRepo("supabase/migrations/20260706120100_operational_consumption_event_type_seeds.sql");
        expect(seed).toContain("enrollment.registration");
        expect(seed).toContain("registration_fee");
        expect(seed).toContain("WHERE NOT EXISTS"); // idempotent
        expect(seed).toContain("public.consumption_event_types");
    });
});

describe("Operational Consumption — runtime service consumes (does not bypass) the Charge resolver", () => {
    const svc = read("lib/operationalConsumption/consumptionService.ts");

    it("delegates pricing to the existing chargeLifecycleService and writes only its own tables + draft charges", () => {
        expect(svc).toContain("chargeLifecycle/chargeLifecycleService");
        expect(svc).toContain("previewTemplateCharge");
        expect(svc).toContain("writeTemplateDraftCharge");
        // never posts, never writes money tables directly
        expect(svc).not.toMatch(/from\(["'](ledger_transactions|gl_journal_lines|invoices|payments|statements)["']\)/);
        expect(svc).not.toMatch(/status:\s*["']posted["']/);
    });

    it("links obligations only to non-posted (draft) charges", () => {
        // never link a skipped/posted charge: draftChargeId is set only for create/recalculate/unchanged
        expect(svc).toContain("skipped_posted");
        expect(svc).toMatch(/never link a posted charge/i);
    });
});

describe("Operational Consumption — preview API", () => {
    it("is role-gated POST with preview | draft modes", () => {
        const r = read("app/api/admin/financial/consumption/simulate/route.ts");
        expect(r).toMatch(/export async function POST/);
        expect(r).toContain("requireAdminOrOps");
        expect(r).toContain('"preview"');
        expect(r).toContain('"draft"');
    });
});

describe("Operational Consumption — UI surface makes the boundary visible", () => {
    it("the financials page routes a runtime consumption section", () => {
        const hook = read("components/adminV2/settings/financials/useFinancialsConfigurationSettings.ts");
        expect(hook).toContain('"consumption"');
        const page = read("components/adminV2/settings/financials/FinancialsConfigurationPage.tsx");
        expect(page).toContain('section === "consumption"');
        expect(page).toContain("OperationalConsumptionSimulator");
    });

    it("the simulator calls the consumption API and states it posts nothing", () => {
        const sim = read("components/adminV2/settings/financials/OperationalConsumptionSimulator.tsx");
        expect(sim).toContain("/api/admin/financial/consumption/simulate");
        expect(sim).toMatch(/posts nothing|not posted/i);
        expect(sim).toContain("enrollment.registration");
    });
});
