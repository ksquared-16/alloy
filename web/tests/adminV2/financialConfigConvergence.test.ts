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

describe("Commercial Model — Service is a first-class entity (Slice A)", () => {
    it("the financial_services migration + Rate Plan→Service column exist", () => {
        const root2 = resolve(__dirname, "../../..");
        const sql = readFileSync(resolve(root2, "supabase/migrations/20260702120000_financial_services_commercial_model.sql"), "utf8");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.financial_services");
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS service_id");
        expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    });

    it("the services store reads/writes the financial_services table, not org_settings", () => {
        const store = read("lib/financials/services/financialServicesStore.ts");
        expect(store).toContain('"financial_services"');
        // no longer queries the interim org_settings store
        expect(store).not.toMatch(/from\(["']org_settings["']\)/);
    });

    it("the services route is role-gated", () => {
        const route = read("app/api/admin/financial/services/route.ts");
        expect(route).toMatch(/export async function POST/);
        expect(route).toContain("requireAdminOrOps");
    });

    it("the services panel authors inline (create/edit/activate, no drawers)", () => {
        const panel = read("components/adminV2/settings/financials/ServicesConfigurationPanel.tsx");
        expect(panel).toContain("useFinancialServices");
        expect(panel).toContain("updateService");
        expect(panel).not.toMatch(/openDrawer|useAdminDrawer/);
    });

    it("rate plan create form picks a Service (Commercial Model)", () => {
        const form = read("components/adminV2/settings/financials/CreateRatePlanForm.tsx");
        expect(form).toContain("serviceOptions");
        expect(form).toContain("service_id");
    });
});

describe("Commercial Model — Charge Templates (Slice B)", () => {
    it("the financial_charge_templates migration is effective-dated config (no posting/ledger)", () => {
        const root2 = resolve(__dirname, "../../..");
        const sql = readFileSync(resolve(root2, "supabase/migrations/20260703120000_financial_charge_templates.sql"), "utf8");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.financial_charge_templates");
        expect(sql).toContain("effective_start");
        expect(sql).toContain("billable_on_strategy");
        expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
        // configuration only — references no other money table
        expect(sql).not.toMatch(/public\.(ledger_transactions|gl_journal_lines|invoices|payments|charges)/);
    });

    it("the charge-templates route is role-gated POST authoring (create|version|retire|void)", () => {
        const r = read("app/api/admin/financial/charge-templates/route.ts");
        expect(r).toMatch(/export async function POST/);
        expect(r).toContain("requireAdminOrOps");
        for (const a of ['"create"', '"version"', '"retire"', '"void"']) expect(r).toContain(a);
    });

    it("the authoring service supersedes (no in-place value overwrite) and writes only its table", () => {
        const svc = read("lib/financials/chargeTemplates/chargeTemplateAuthoringService.ts");
        expect(svc).toContain("planSupersede");
        expect(svc).toContain("supersedes_id");
        expect(svc).not.toMatch(/from\(["'](charges|ledger_transactions|gl_journal_lines|invoices|payments)["']\)/);
    });

    it("the panel authors inline via the shared editor, states it posts nothing, and shows labels not IDs", () => {
        const panel = read("components/adminV2/settings/financials/ChargeTemplatesConfigurationPanel.tsx");
        expect(panel).toContain("EffectiveDatedConfigurationEditor");
        expect(panel).toContain("does not post money");
        expect(panel).not.toMatch(/openDrawer|useAdminDrawer/);
        const page = read("components/adminV2/settings/financials/FinancialsConfigurationPage.tsx");
        expect(page).toContain("ChargeTemplatesConfigurationPanel");
    });
});

describe("Commercial Model — Financial Policies (Slice C)", () => {
    it("the financial_policies migration is scoped + effective-dated config (no posting/ledger)", () => {
        const root2 = resolve(__dirname, "../../..");
        const sql = readFileSync(resolve(root2, "supabase/migrations/20260704120000_financial_policies.sql"), "utf8");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.financial_policies");
        expect(sql).toContain("financial_policies_scope_shape");
        expect(sql).toContain("effective_start");
        expect(sql).toContain("validate_financial_policy_scope");
        expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
        expect(sql).not.toMatch(/public\.(ledger_transactions|gl_journal_lines|invoices|payments|charges)\b/);
    });

    it("the policies route is role-gated POST authoring (create|version|retire|void)", () => {
        const r = read("app/api/admin/financial/policies/route.ts");
        expect(r).toMatch(/export async function POST/);
        expect(r).toContain("requireAdminOrOps");
        for (const a of ['"create"', '"version"', '"retire"', '"void"']) expect(r).toContain(a);
    });

    it("the policy service supersedes (no in-place overwrite) and writes only its table", () => {
        const svc = read("lib/financials/policies/financialPolicyService.ts");
        expect(svc).toContain("planSupersede");
        expect(svc).toContain("supersedes_id");
        expect(svc).not.toMatch(/from\(["'](charges|ledger_transactions|gl_journal_lines|invoices|payments)["']\)/);
    });

    it("the panel authors inline, resolves most-specific-wins, states it posts nothing, no IDs", () => {
        const panel = read("components/adminV2/settings/financials/FinancialPoliciesConfigurationPanel.tsx");
        expect(panel).toContain("EffectiveDatedConfigurationEditor");
        expect(panel).toContain("resolveFinancialPolicy");
        expect(panel).toContain("does not post money");
        expect(panel).not.toMatch(/openDrawer|useAdminDrawer/);
        const page = read("components/adminV2/settings/financials/FinancialsConfigurationPage.tsx");
        expect(page).toContain("FinancialPoliciesConfigurationPanel");
    });

    it("Charge Categories are presented as code-owned reference with mapping status", () => {
        const accounting = read("components/adminV2/settings/financials/AccountingConfigurationPanel.tsx");
        expect(accounting).toContain("code-owned reference");
        expect(accounting).toMatch(/not tenant-editable/i);
        expect(accounting).toContain("listChargeCategories");
    });
});

describe("Commercial Model — Charge Lifecycle + draft resolution (Slice D)", () => {
    it("the charge-lifecycle migration is additive (no status/trigger/RLS changes, no parallel table)", () => {
        const root2 = resolve(__dirname, "../../..");
        const sql = readFileSync(resolve(root2, "supabase/migrations/20260705120000_charge_lifecycle_template_link.sql"), "utf8");
        expect(sql).toContain("ALTER TABLE public.charges");
        expect(sql).toContain("occurs_on");
        expect(sql).toContain("billable_on");
        expect(sql).toContain("charge_template_id");
        // frozen substrate untouched: no CREATE TABLE charges, no status CHECK edit, no trigger/RLS change
        expect(sql).not.toMatch(/CREATE TABLE[^;]*charges/i);
        expect(sql).not.toMatch(/charges_status_chk|enforce_childcare_charge_immutability|CREATE POLICY/i);
    });

    it("the simulate route is role-gated POST (preview | draft)", () => {
        const r = read("app/api/admin/financial/charge-templates/simulate/route.ts");
        expect(r).toMatch(/export async function POST/);
        expect(r).toContain("requireAdminOrOps");
        expect(r).toContain('"preview"');
        expect(r).toContain('"draft"');
    });

    it("the lifecycle service writes only draft charges, idempotent, never posts/ledger/invoices", () => {
        const svc = read("lib/financials/chargeLifecycle/chargeLifecycleService.ts");
        expect(svc).toContain("resolution_key");
        expect(svc).toContain('status: "draft"');
        expect(svc).toContain("skipped_posted");
        // no posting/ledger/invoice/payment writes
        expect(svc).not.toMatch(/from\(["'](ledger_transactions|gl_journal_lines|invoices|payments|statements)["']\)/);
        expect(svc).not.toMatch(/status:\s*["']posted["']/);
    });

    it("the simulator UI renders and calls the simulate API (no IDs)", () => {
        const sim = read("components/adminV2/settings/financials/ChargeTemplateSimulator.tsx");
        expect(sim).toContain("/api/admin/financial/charge-templates/simulate");
        expect(sim).toMatch(/posts nothing|not posted/i);
        const panel = read("components/adminV2/settings/financials/ChargeTemplatesConfigurationPanel.tsx");
        expect(panel).toContain("ChargeTemplateSimulator");
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
        for (const fn of ["PostingConfigurationArea", "PaymentsConfigurationArea", "SubsidyConfigurationArea", "FinancialResponsibilityArea"]) {
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

describe("Alloy Services V1 — switchboard + question-first authoring", () => {
    it("the switchboard implements the six capabilities with consequence confirmations", () => {
        const cap = read("lib/financials/services/serviceCapabilities.ts");
        for (const c of ["creates_schedule", "tracks_attendance", "consumes_capacity", "supports_waitlist", "uses_rate_plans", "parent_portal_visible"]) {
            expect(cap).toContain(c);
        }
        const board = read("components/adminV2/settings/financials/services/ServiceSwitchboard.tsx");
        expect(board).toContain("HIGH_CONSEQUENCE_OFF");
        expect(board).toMatch(/role="switch"/);
    });

    it("capabilities round-trip through the metadata jsonb (no migration; catalog stays a list)", () => {
        const store = read("lib/financials/services/financialServicesStore.ts");
        expect(store).toContain("buildMetadata");
        expect(store).toContain("normalizeCapabilities");
        expect(store).toContain("default_charge_category");
        // additive — does not introduce effective dating on the service catalog
        expect(store).not.toMatch(/effective_start|planSupersede/);
    });

    it("the panel is a mode-adaptive workspace (Operate / Author), not a Name/Type/Description form", () => {
        const panel = read("components/adminV2/settings/financials/ServicesConfigurationPanel.tsx");
        expect(panel).toContain("ServiceOperateView");
        expect(panel).toContain("ServiceAuthorJourney");
        expect(panel).toContain("switches on"); // operator language, not "type"
    });

    it("authoring is question-first, composing answers into a Service", () => {
        const author = read("components/adminV2/settings/financials/services/ServiceAuthorJourney.tsx");
        expect(author).toContain("How is it billed?");
        expect(author).toContain("What does it switch on?");
        expect(author).toContain("ServiceSwitchboard");
    });

    it("relationship cards are read-through with single authoring homes", () => {
        const cards = read("components/adminV2/settings/financials/services/ServiceRelationshipCards.tsx");
        expect(cards).toContain("Open in Rate Plans");
        expect(cards).toContain("Open in Charges");
        expect(cards).toMatch(/Accounting/);
    });

    it("validation speaks operational consequence", () => {
        const v = read("lib/financials/services/serviceValidation.ts");
        expect(v).toContain("would have no tuition");
        expect(v).toMatch(/attention|advisory/);
    });
});
