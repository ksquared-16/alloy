import { describe, expect, it } from "vitest";
import {
    CANONICAL_ADMIN_WORKSPACE,
    isCanonicalDrawerHostPath,
    isCanonicalWorkspacePath,
    legacyAdminRedirectTarget,
    normalizeToCanonicalAdminPath,
    normalizeTransitionalAdminPath,
} from "@/lib/admin/canonicalAdminRoutes";

describe("canonicalAdminRoutes", () => {
    it("maps transitional adminV2 paths to canonical /admin", () => {
        expect(normalizeTransitionalAdminPath("/adminV2")).toBe(CANONICAL_ADMIN_WORKSPACE);
        expect(normalizeTransitionalAdminPath("/adminV2/workspace")).toBe(CANONICAL_ADMIN_WORKSPACE);
        expect(normalizeTransitionalAdminPath("/adminV2/settings/lifecycle")).toBe(
            "/admin/settings/lifecycle",
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
        expect(isCanonicalDrawerHostPath("/admin/workspace/dept/d1/work-unit/w1")).toBe(true);
    });
});
