/**
 * WHAT THE FINANCIALS WORKSPACE IS MADE OF — and the four things it is forbidden to become.
 *
 * These are source-level assertions on purpose. The properties they hold are architectural — a
 * second shell, a second KPI primitive, a second financial authority, a false accounting word —
 * and each of them is introduced by writing a file, not by producing a wrong number. A runtime
 * test would only catch them once they had already shipped a figure.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "../../..");

function read(rel: string): string {
    return fs.readFileSync(path.join(root, rel), "utf8");
}

/**
 * The source with its prose removed.
 *
 * Several of these assertions are about what a file PRESENTS, and the doc comments deliberately
 * name the thing they replaced — "`Wallet` read as a personal purse", "there is no Revenue tile".
 * Matching against raw source would make writing down the reason for a decision fail the test
 * that enforces it.
 */
function code(rel: string): string {
    return read(rel)
        .split("\n")
        .filter((line) => {
            const t = line.trim();
            return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
        })
        .join("\n");
}

const SECTION_FILES = [
    "app/adminV2/financials/sections/FinancialsOverview.tsx",
    "app/adminV2/financials/sections/FinancialsAccounts.tsx",
    "app/adminV2/financials/sections/FinancialsCharges.tsx",
    "app/adminV2/financials/sections/FinancialsPayments.tsx",
    "app/adminV2/financials/sections/FinancialsSubsidy.tsx",
    "app/adminV2/financials/sections/FinancialsActivity.tsx",
    "app/adminV2/financials/sections/FinancialsStudio.tsx",
    "app/adminV2/financials/sections/FinancialsBulkCharge.tsx",
];

const NEW_ROUTES = [
    "app/api/admin/financials/position/route.ts",
    "app/api/admin/financials/payment-flow/route.ts",
    "app/api/admin/financials/activity/route.ts",
    "app/api/admin/financials/overview-metrics/route.ts",
];

describe("Financials workspace — shared primitives, never a second family", () => {
    it("composes the canonical WorkspaceShell and declares no shell of its own", () => {
        const shell = read("app/adminV2/financials/FinancialsWorkspaceShell.tsx");
        expect(shell).toContain('from "@/components/workspace/WorkspaceShell"');
        expect(shell).not.toMatch(/function FinancialsShell/);
    });

    it("uses the shared KPI and health primitives, and defines no Financials KPI component", () => {
        const overview = read("app/adminV2/financials/sections/FinancialsOverview.tsx");
        expect(overview).toContain("SurfaceHeaderKpiCard");
        expect(overview).toContain("WorkspaceOverviewActivityBand");
        const strip = read("app/adminV2/financials/FinancialsKpiStrip.tsx");
        expect(strip).toContain("WorkspaceOperationalHealth");
        // A module KPI primitive would be the first pixel of a second design system.
        expect(strip).not.toMatch(/function FinancialsKpiCard/);
    });

    it("carries the platform's own financial mark in the sidebar and the workspace header", () => {
        const sidebar = code("app/adminV2/components/SidebarModalNavItems.tsx");
        const shell = code("app/adminV2/financials/FinancialsWorkspaceShell.tsx");
        for (const source of [sidebar, shell]) {
            expect(source).toContain("Banknote");
            // `Wallet` was the Scheduling rate chip's glyph too — one mark, two subjects.
            expect(source).not.toMatch(/\bWallet\b/);
        }
    });
});

describe("Financials workspace — Work and Studio", () => {
    it("offers six Work sections, each of which has a read seam behind it", () => {
        const sections = read("app/adminV2/financials/financialsSections.ts");
        for (const key of ["overview", "accounts", "charges", "payments", "subsidy", "activity"]) {
            expect(sections).toContain(`"${key}"`);
        }
        expect(sections).toContain('export type FinancialsMode = "work" | "studio"');
    });

    it("Studio launches canonical configuration and persists nothing", () => {
        const studio = read("app/adminV2/financials/sections/FinancialsStudio.tsx");
        // The same model the configuration landing renders — one source of tile copy.
        expect(studio).toContain("buildFinancialsLandingSections");
        expect(studio).toContain("FINANCIALS_LANDING_HREF");
        // No writes, and no second configuration store.
        expect(studio).not.toMatch(/fetch\(/);
        expect(studio).not.toMatch(/method:\s*"(POST|PATCH|PUT|DELETE)"/);
    });
});

describe("Financials workspace — every mutation goes through a registered action", () => {
    it("posts a charge through `charge.post`, never a page-local write", () => {
        const charges = read("app/adminV2/financials/sections/FinancialsCharges.tsx");
        expect(charges).toContain('action_key: "charge.post"');
        expect(charges).toContain("/api/admin/actions/execute");
    });

    it("bulk charging is ONE canonical run, previewed and confirmed — not a client loop", () => {
        const bulk = read("app/adminV2/financials/sections/FinancialsBulkCharge.tsx");
        expect(bulk).toContain("billing.generate_tuition");
        expect(bulk).toContain('mode: "preview"');
        expect(bulk).toContain('callAction("execute"');
        // Duplicating charge creation, in any of its shapes, is the failure this replaces.
        expect(bulk).not.toContain("charge.add");
        expect(bulk).not.toMatch(/for\s*\(.*of\s+rows/);
        // The run has no site parameter, and the surface says so rather than implying scope.
        expect(bulk).toContain('data-financials-bulk-scope="org_wide"');
    });

    it("no section writes to Supabase directly", () => {
        for (const rel of SECTION_FILES) {
            expect(read(rel)).not.toContain("createAdminClient");
            expect(read(rel)).not.toContain("supabase");
        }
    });
});

describe("Financials workspace — the words that would create a semantic the data cannot honour", () => {
    /*
     * There is no receivables accounting behind these figures and no revenue-recognition model in
     * the platform. A label is exactly where a false accounting semantic takes hold, so the words
     * are absent from the surfaces AND from the metric registry that feeds them.
     */
    const FORBIDDEN = [/Accounts Receivable/i, /\bA\/R\b/, /\bRevenue\b/i, /\bP&L\b/, /Profit and Loss/i];

    it("never appears in a Financials workspace surface", () => {
        for (const rel of [...SECTION_FILES, "app/adminV2/financials/FinancialsWorkspaceShell.tsx"]) {
            const rendered = code(rel);
            for (const pattern of FORBIDDEN) {
                expect(rendered, `${rel} must not present "${pattern}"`).not.toMatch(pattern);
            }
        }
    });

    it("the metric pack names what the numbers are, not what they resemble", () => {
        const registry = read("lib/metrics/registry.ts");
        expect(registry).toContain('label: "Outstanding"');
        expect(registry).toContain('label: "Gross charges posted"');
        expect(registry).not.toContain('label: "Accounts Receivable"');
        expect(registry).not.toContain('label: "Revenue"');
    });
});

describe("Financials workspace — the reads are gated and scoped by the server", () => {
    it("every new route is gated by fin.read through the named helper", () => {
        for (const rel of NEW_ROUTES) {
            const source = read(rel);
            expect(source, rel).toContain("loadAdminRouteGate");
            expect(source, rel).toContain("assertFinancialsReadAllowed");
        }
    });

    it("every new route is declared in the route-capability table", () => {
        const declared = JSON.parse(read("scripts/routeCapabilities.declared.json")) as {
            routes: Record<string, Record<string, { status: string; capability?: string; helper?: string }>>;
        };
        for (const rel of NEW_ROUTES) {
            expect(declared.routes[rel]?.GET, rel).toEqual({
                status: "declared",
                capability: "fin.read",
                helper: "assertFinancialsReadAllowed",
            });
        }
    });

    it("takes the operator's rights from the gate and the site only as a narrowing filter", () => {
        for (const rel of ["app/api/admin/financials/position/route.ts", "app/api/admin/financials/payment-flow/route.ts"]) {
            const source = read(rel);
            expect(source, rel).toContain("ctx.siteScope");
            expect(source, rel).toContain("ctx.allowedSiteLocationIds");
        }
    });
});

describe("Financials workspace — history explains, it does not answer", () => {
    it("the Activity surface renders no total, movement or balance", () => {
        const activity = read("app/adminV2/financials/sections/FinancialsActivity.tsx");
        // A column sum here would be a second balance beside Thread 8's.
        expect(activity).not.toContain(".reduce(");
        expect(activity).toContain("Balances are shown on the account, not summed from this list.");
    });

    it("the activity projection returns rows and never a movement total", () => {
        const projection = read("lib/financials/workspace/resolveFinancialActivity.ts");
        expect(projection).toContain("obligationDeltaCents");
        expect(projection).not.toMatch(/obligation_movement_cents/);
    });

    it("nothing in the workspace reads the journal-summing snapshot endpoint", () => {
        for (const rel of [...SECTION_FILES, ...NEW_ROUTES, "app/adminV2/financials/useFinancialsReads.ts"]) {
            expect(read(rel), rel).not.toContain("/api/admin/financials/snapshot");
        }
    });
});
