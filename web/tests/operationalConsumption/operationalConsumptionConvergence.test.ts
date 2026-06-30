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
    const sql = readRepo("supabase/migrations/20260706120050_operational_consumption_foundation.sql");

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

describe("Operational Consumption Slice 2 — Agreement + Schedule consumption", () => {
    const sql = readRepo("supabase/migrations/20260707120000_operational_consumption_schedule_slice2.sql");

    it("the Slice 2 migration is additive (ALTER ADD COLUMN, seed event types) and writes no money table", () => {
        expect(sql).toContain("ALTER TABLE public.resolved_obligations");
        expect(sql).toContain("ADD COLUMN IF NOT EXISTS obligation_kind");
        for (const k of ["schedule.recurring_tuition", "schedule.proration", "schedule.drop_in", "schedule.extra_day"]) {
            expect(sql).toContain(k);
        }
        expect(sql).toContain("WHERE NOT EXISTS"); // idempotent seed
        // additive only: no parallel money table, no posting
        expect(sql).not.toMatch(/CREATE TABLE (IF NOT EXISTS )?public\.(charges|invoices|payments|ledger_transactions|gl_journal_lines|statements)\b/i);
        expect(sql).not.toMatch(/status:\s*['"]posted['"]/);
    });

    it("the interpretation engine is pure and encodes 'not every mutation is commercial'", () => {
        const eng = read("lib/operationalConsumption/scheduleInterpretation.ts");
        expect(eng).toContain("interpretSchedule");
        expect(eng).toContain("weekdaysToScheduleBasis");
        // no IO in the pure engine
        expect(eng).not.toMatch(/supabase|from\(["']/);
        for (const kind of ["holiday_override", "exception", "no_op"]) expect(eng).toContain(kind);
    });

    it("the service consumes Rate Resolution + the Charge resolver (does not reimplement pricing) and never posts", () => {
        const svc = read("lib/operationalConsumption/consumptionService.ts");
        expect(svc).toContain("resolveRate");
        expect(svc).toContain("resolveFinancialPolicy");
        expect(svc).toContain("writeTemplateDraftCharge"); // existing lifecycle service
        expect(svc).not.toMatch(/from\(["'](ledger_transactions|gl_journal_lines|invoices|payments|statements)["']\)/);
        expect(svc).not.toMatch(/status:\s*["']posted["']/);
    });

    it("the demo dataset adds a rate-derived tuition template + drop-in rate rule", () => {
        const demo = read("lib/financials/demo/financialConfigDemoDataset.ts");
        expect(demo).toMatch(/templateKey:\s*"tuition"/);
        expect(demo).toContain('amountStrategy: "rate_derived"');
        expect(demo).toContain('scheduleBasis: "drop_in"');
    });

    it("the simulator exposes schedule scenarios + the explanation chain", () => {
        const sim = read("components/adminV2/settings/financials/OperationalConsumptionSimulator.tsx");
        expect(sim).toContain("schedule_change_kind");
        expect(sim).toContain("Commercial objects used");
        expect(sim).toContain("Policies applied");
        expect(sim).toContain("Resolved obligations");
    });
});

describe("Operational Consumption Slice 3 — Consumption Pipeline + Attendance", () => {
    it("the Slice 3 migration is additive and seeds the attendance.* event catalog", () => {
        const sql = readRepo("supabase/migrations/20260708120000_operational_consumption_attendance_slice3.sql");
        for (const k of ["attendance.late_pickup", "attendance.drop_in", "attendance.extra_day", "attendance.hourly_care", "attendance.no_show", "attendance.vacation_credit"]) {
            expect(sql).toContain(k);
        }
        expect(sql).toContain("WHERE NOT EXISTS"); // idempotent seed
        expect(sql).not.toMatch(/CREATE TABLE (IF NOT EXISTS )?public\.(charges|invoices|payments|ledger_transactions|gl_journal_lines|statements)\b/i);
        expect(sql).not.toMatch(/status:\s*['"]posted['"]/);
    });

    it("the attendance interpretation engine is pure and encodes 'not every fact is commercial'", () => {
        const eng = read("lib/operationalConsumption/attendanceInterpretation.ts");
        expect(eng).toContain("interpretAttendance");
        expect(eng).not.toMatch(/supabase|from\(["']/); // no IO
        for (const f of ["room_transfer", "excused_absence", "vacation_credit", "late_pickup"]) expect(eng).toContain(f);
    });

    it("the pipeline shares ONE directive resolver across domains and consumes the existing resolvers", () => {
        const svc = read("lib/operationalConsumption/consumptionService.ts");
        expect(svc).toContain("buildCandidate"); // Consumption Candidate
        expect(svc).toContain("resolveDirective"); // shared pipeline core
        expect(svc).toContain("interpretAttendance");
        expect(svc).toContain("previewAttendanceConsumption");
        expect(svc).not.toMatch(/from\(["'](ledger_transactions|gl_journal_lines|invoices|payments|statements)["']\)/);
        expect(svc).not.toMatch(/status:\s*["']posted["']/);
    });

    it("the demo dataset adds an hourly rate rule + hourly_care template", () => {
        const demo = read("lib/financials/demo/financialConfigDemoDataset.ts");
        expect(demo).toMatch(/templateKey:\s*"hourly_care"/);
        expect(demo).toContain('scheduleBasis: "hourly"');
    });

    it("the simulator exposes attendance scenarios + the candidate/discard reasoning", () => {
        const sim = read("components/adminV2/settings/financials/OperationalConsumptionSimulator.tsx");
        expect(sim).toContain("attendance_fact_type");
        expect(sim).toContain("Consumption candidate");
        expect(sim).toContain("Candidate discarded");
        expect(sim).toContain("check_out");
    });
});
