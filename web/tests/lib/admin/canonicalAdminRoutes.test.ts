import { describe, expect, it } from "vitest";
import {
    CANONICAL_ADMIN_CONFIG_LANDING,
    CANONICAL_ADMIN_WORKSPACE,
    CANONICAL_OPERATOR_BASE,
    isCanonicalDrawerHostPath,
    isCanonicalWorkspacePath,
    isOperatorAdminPath,
    legacyAdminRedirectTarget,
    normalizeToCanonicalAdminPath,
    normalizeTransitionalAdminPath,
} from "@/lib/admin/canonicalAdminRoutes";
import { operatorWorkUnitHrefFromKey, parseOperatorWorkUnitPath, normalizeOperatorPathname } from "@/lib/admin/canonicalOperatorRoutes";

describe("canonicalAdminRoutes", () => {
    it("maps transitional adminV2 paths to canonical /settings", () => {
        expect(normalizeTransitionalAdminPath("/adminV2")).toBe(CANONICAL_ADMIN_CONFIG_LANDING);
        expect(normalizeTransitionalAdminPath("/adminV2/settings/lifecycle")).toBe(
            "/settings/lifecycle",
        );
    });

    it("redirects legacy admin financials to legacy-admin", () => {
        expect(legacyAdminRedirectTarget("/admin/financials")).toBe("/legacy-admin/financials");
        expect(legacyAdminRedirectTarget("/admin/opportunities")).toBe("/legacy-admin/opportunities");
    });

    it("does not redirect canonical admin workspace or settings", () => {
        expect(legacyAdminRedirectTarget("/admin/workspace")).toBeNull();
        expect(legacyAdminRedirectTarget("/admin/settings/statuses")).toBeNull();
    });

    it("normalizes browser paths for route matching", () => {
        expect(normalizeToCanonicalAdminPath("/adminV2/workspace/dept/d1")).toBe(
            "/admin/workspace/dept/d1",
        );
        expect(isCanonicalWorkspacePath("/admin/workspace")).toBe(true);
        expect(isCanonicalWorkspacePath("/workspace/work-unit/new-leads")).toBe(true);
        expect(isOperatorAdminPath("/workspace")).toBe(true);
        expect(isCanonicalDrawerHostPath("/workspace/work-unit/new-leads")).toBe(true);
    });

    it("builds operator work unit hrefs without department or uuid segments", () => {
        expect(operatorWorkUnitHrefFromKey("new_leads")).toBe(
            `${CANONICAL_OPERATOR_BASE}/work-unit/new-leads`,
        );
        expect(parseOperatorWorkUnitPath("/workspace/work-unit/new-leads/opp-1")).toEqual({
            workUnitSlug: "new-leads",
            recordId: "opp-1",
        });
    });

    it("normalizes internal rewrite paths to canonical /workspace operator URLs", () => {
        expect(normalizeOperatorPathname("/adminV2/workspace/work-unit/new-leads")).toBe(
            `${CANONICAL_OPERATOR_BASE}/work-unit/new-leads`,
        );
        expect(normalizeOperatorPathname("/admin/workspace/dept/d1")).toBe(
            `${CANONICAL_OPERATOR_BASE}/dept/d1`,
        );
    });
});
