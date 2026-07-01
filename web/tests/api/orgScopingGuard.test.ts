import { describe, it, expect } from "vitest";

// Plain ESM spike script (no type declarations); imported for its runtime exports.
import { scanOrgScoping, findingForRoute } from "../../../scripts/auditOrgScopingGuard.mjs";

type Finding = {
    file: string;
    route: string;
    usesServiceRole: boolean;
    tenantTables: string[];
    hasOrgScopeSignal: boolean;
    risk: "warn" | "ok";
};

/**
 * The org-scoping guard is a heuristic WARNING spike (see
 * scripts/auditOrgScopingGuard.mjs). Globally it does not fail CI. For the Phase 2
 * migrated subset we DO enforce that no obvious tenant-access risk is flagged.
 */
const MIGRATED_ROUTES = [
    "/api/admin/actions/preflight",
    "/api/admin/actions/inventory",
    "/api/admin/actions/execute",
    "/api/admin/analytics/metrics",
    "/api/admin/entity/[type]/[id]",
];

describe("org-scoping guard spike", () => {
    it("scans the API surface and returns structured findings", () => {
        const findings = scanOrgScoping() as Finding[];
        expect(findings.length).toBeGreaterThan(0);
        for (const f of findings) {
            expect(typeof f.route).toBe("string");
            expect(["warn", "ok"]).toContain(f.risk);
        }
    });

    it("does not flag any route in the Phase 2 migrated subset", () => {
        for (const route of MIGRATED_ROUTES) {
            const finding = findingForRoute(route) as Finding | null;
            expect(finding, `expected to find route ${route}`).not.toBeNull();
            expect(finding!.risk, `${route} flagged as tenant-access risk`).toBe("ok");
        }
    });

    it("reports global warnings as advisory (does not fail)", () => {
        const findings = scanOrgScoping() as Finding[];
        const warnings = findings.filter((f) => f.risk === "warn");
        // Advisory only: surface the count so regressions are visible in test output.
        // eslint-disable-next-line no-console
        console.log(`[org-scoping guard] ${warnings.length}/${findings.length} routes flagged (advisory)`);
        expect(warnings.length).toBeGreaterThanOrEqual(0);
    });
});
