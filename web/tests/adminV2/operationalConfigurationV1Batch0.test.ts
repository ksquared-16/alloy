/**
 * Operational Configuration V1 — Batch 0 (Read-Only Exposure) + Batch 1
 * (Financials write + versioning).
 *
 * Structural guarantees: Financials is a first-class configuration domain with
 * generic naming; Financials rate plans/rules are authored via role-gated POST
 * routes with a domain-generic versioning primitive; GL config and the Locations
 * operational rules remain read-only; the existing settings pages and docs
 * remain intact.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    CONFIGURATION_MODE_NAV_GROUPS,
    CONFIGURATION_MODE_NAV_ITEMS,
} from "@/lib/adminV2/configurationModeNav";

const root = resolve(__dirname, "../..");
function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Batch 0 — Financials navigation domain", () => {
    it("adds Financials as a first-class nav item with a generic testId", () => {
        const financials = CONFIGURATION_MODE_NAV_ITEMS.find((i) => i.label === "Financials");
        expect(financials).toBeDefined();
        expect(financials?.href).toBe("/settings/financials");
        expect(financials?.testId).toBe("config-mode-nav-financials");
    });

    it("groups Financials under its own labeled domain (sibling to other domains)", () => {
        const group = CONFIGURATION_MODE_NAV_GROUPS.find((g) => g.label === "Financials");
        expect(group).toBeDefined();
        expect(group?.items.some((i) => i.label === "Financials")).toBe(true);
    });

    it("registers a Banknote icon for the financials nav icon", () => {
        const icons = read("lib/adminV2/configurationModeNavIcons.tsx");
        expect(icons).toContain("financials: Banknote");
    });

    it("uses generic financial naming (no childcare-specific route naming)", () => {
        const nav = read("lib/adminV2/configurationModeNav.ts");
        expect(nav).toContain('settings("financials")');
        expect(nav).not.toMatch(/childcare/i);
    });
});

describe("Batch 0 — Financials configuration surfaces", () => {
    const page = read("components/adminV2/settings/financials/FinancialsConfigurationPage.tsx");

    it("landing page exposes Overview, Rate Plans, Charge Preview, GL Codes, GL Mappings", () => {
        const hook = read("components/adminV2/settings/financials/useFinancialsConfigurationSettings.ts");
        for (const key of ["overview", "rate_plans", "charge_preview", "gl_codes", "gl_mappings"]) {
            expect(hook).toContain(key);
        }
        expect(page).toContain('data-testid="financials-configuration-page"');
    });

    it("rate plans workspace renders nested rate rules (Batch 1 authoring)", () => {
        const workspace = read("components/adminV2/settings/financials/RatePlanAuthoringWorkspace.tsx");
        expect(workspace).toContain("rate_plan_id");
        expect(workspace).toContain("schedule_basis");
        expect(workspace).toContain("EffectiveDatedConfigurationEditor");
    });

    it("charge preview inspector calls the existing read-only preview API and labels itself preview-only", () => {
        const inspector = read("components/adminV2/settings/financials/FinancialChargePreviewInspector.tsx");
        expect(inspector).toContain("/api/admin/financial-charge-preview");
        expect(inspector).toMatch(/No invoice, no AR, no posting/i);
    });

    it("GL Codes / GL Mappings render read-only with future-posting copy", () => {
        const gl = read("components/adminV2/settings/financials/GlConfigReadonlyView.tsx");
        expect(gl).toContain("GlCodesReadonlyView");
        expect(gl).toContain("GlMappingsReadonlyView");
        expect(gl).toMatch(/No posting behavior exists yet/i);
    });
});

describe("Batch 0 — Locations operational rule sections", () => {
    it("Locations page adds an Operational Rules section + panel", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        expect(page).toContain("LocationOperationalRulesPanel");
        expect(page).toContain('section === "operational_rules"');
    });

    it("operational rules panel exposes capacity, ratio, operating windows, schedule rules + resolved preview", () => {
        const panel = read("components/adminV2/settings/locations/LocationOperationalRulesPanel.tsx");
        expect(panel).toContain("Capacity Rules");
        expect(panel).toContain("Ratio Rules");
        expect(panel).toContain("Operating Windows");
        expect(panel).toContain("Schedule Rules");
        expect(panel).toContain("Resolved per location");
        expect(panel).toContain("resolveConfigRule");
    });

    it("quarantines the location create drawer to the Locations section (marked for removal)", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        expect(page).toContain('canMutate && section === "locations"');
        expect(page).toMatch(/marked for removal/i);
    });
});

describe("read-only posture (read loaders + surfaces NOT yet writable)", () => {
    // Financials rate plans/rules (Batch 1) and Locations operational rules
    // (Phase 3) became writable via dedicated authoring hooks. GL config remains
    // read-only, and the read loaders stay GET-only (writes live in the hooks).
    const readonlyFiles = [
        "components/adminV2/settings/financials/GlConfigReadonlyView.tsx",
        "components/adminV2/settings/financials/useFinancialsConfigurationSettings.ts",
        "components/adminV2/settings/locations/useLocationOperationalRules.ts",
    ];

    it("still-read-only surfaces + read loaders issue no write API calls", () => {
        for (const rel of readonlyFiles) {
            const src = read(rel);
            expect(src).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
        }
    });

    it("read-only API routes never call supabase write verbs", () => {
        const service = read("lib/financials/gl/glConfigService.ts");
        expect(service).toContain("gl_accounts");
        expect(service).toContain("gl_account_mappings");
        expect(service).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    });
});

describe("Batch 1 — Financials write + versioning", () => {
    it("rate plan + rate rule routes export POST authoring", () => {
        expect(read("app/api/admin/financial/rate-plans/route.ts")).toMatch(/export async function POST/);
        expect(read("app/api/admin/financial/rate-rules/route.ts")).toMatch(/export async function POST/);
    });

    it("authoring routes are role-gated (requireAdminOrOps)", () => {
        for (const rel of [
            "app/api/admin/financial/rate-plans/route.ts",
            "app/api/admin/financial/rate-rules/route.ts",
        ]) {
            expect(read(rel)).toContain("requireAdminOrOps");
        }
    });

    it("the write hook posts to the rate authoring routes", () => {
        const hook = read("components/adminV2/settings/financials/useRateAuthoring.ts");
        expect(hook).toMatch(/method:\s*["']POST["']/);
        expect(hook).toContain("/api/admin/financial/rate-plans");
        expect(hook).toContain("/api/admin/financial/rate-rules");
    });

    it("authoring service never touches charges/ledger/GL/posting (rate config only)", () => {
        const svc = read("lib/financials/rates/rateAuthoringService.ts");
        expect(svc).not.toMatch(/from\(["'](charges|ledger_transactions|gl_journal_lines|gl_accounts|invoices)["']\)/);
    });

    it("the versioning primitive is domain-generic (no rate/financial concepts baked in)", () => {
        const versioning = read("lib/adminV2/operationalConfig/effectiveDatedVersioning.ts");
        expect(versioning).toContain("VersionStatus");
        expect(versioning).toContain("EffectiveDatedVersionRow");
        // No rate/financial-specific identifiers — it must compose for any config domain.
        expect(versioning).not.toMatch(/rate_plan|amount_cents|currency|billing_basis|schedule_basis/);
    });
});

describe("Phase 3 — Locations operational-rule write + versioning", () => {
    const routes = [
        "app/api/admin/operational-config/capacity-rules/route.ts",
        "app/api/admin/operational-config/ratio-rules/route.ts",
        "app/api/admin/operational-config/operating-windows/route.ts",
        "app/api/admin/operational-config/schedule-rules/route.ts",
    ];

    it("all four rule-type routes export role-gated POST authoring", () => {
        for (const rel of routes) {
            const src = read(rel);
            expect(src).toMatch(/export async function POST/);
            expect(src).toContain("requireAdminOrOps");
        }
    });

    it("the Locations panel hosts inline authoring via the shared editor (no drawers)", () => {
        const panel = read("components/adminV2/settings/locations/LocationOperationalRulesPanel.tsx");
        expect(panel).toContain("ConfigRuleAuthoringGroup");
        expect(panel).toContain("Capacity Rules");
        expect(panel).toContain("Ratio Rules");
        expect(panel).toContain("Operating Windows");
        expect(panel).toContain("Schedule Rules");
        expect(panel).toContain("Resolved per location");
        // Inline authoring only — no edit drawer pattern in the operational rules surface.
        expect(panel).not.toMatch(/openDrawer|useAdminDrawer/);
    });

    it("the authoring group composes the shared EffectiveDatedConfigurationEditor", () => {
        const group = read("components/adminV2/settings/locations/ConfigRuleAuthoringGroup.tsx");
        expect(group).toContain("EffectiveDatedConfigurationEditor");
    });

    it("the write hook posts to the operational-config routes", () => {
        const hook = read("components/adminV2/settings/locations/useLocationRuleAuthoring.ts");
        expect(hook).toMatch(/method:\s*["']POST["']/);
        expect(hook).toContain("/api/admin/operational-config");
    });

    it("the authoring service writes only config-rule tables (no charges/ledger/GL/attendance)", () => {
        const svc = read("lib/childcareOperational/config/configRuleAuthoringService.ts");
        expect(svc).not.toMatch(/from\(["'](charges|ledger_transactions|gl_journal_lines|gl_accounts|child_attendance_events|invoices)["']\)/);
    });
});

describe("Batch 0 — existing surfaces remain intact", () => {
    it("existing settings pages still resolve", () => {
        expect(() => read("app/adminV2/settings/locations/page.tsx")).not.toThrow();
        expect(() => read("app/adminV2/settings/financials/page.tsx")).not.toThrow();
        expect(read("app/adminV2/settings/financials/page.tsx")).toContain("FinancialsConfigurationPage");
    });

    it("documents Batch 0 in the operational configuration sprint doc", () => {
        const doc = readFileSync(resolve(root, "../docs/sprints/06_2026/operational_configuration_v1.md"), "utf8");
        expect(doc).toMatch(/Batch 0/);
        expect(doc).toMatch(/read-only/i);
    });
});
