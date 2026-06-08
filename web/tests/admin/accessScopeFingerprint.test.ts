import { describe, expect, it } from "vitest";
import { buildAccessScopeCacheFingerprint, type AdminAccessScopeDimensions } from "@/lib/admin/accessScope";

describe("buildAccessScopeCacheFingerprint", () => {
    it("produces a stable string for full org access", () => {
        const dim: AdminAccessScopeDimensions = {
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "all",
            allowedSiteLocationIds: null,
        };
        expect(buildAccessScopeCacheFingerprint(dim)).toBe("dept:all;site:all");
    });

    it("sorts allow-lists so order does not create cache splits", () => {
        const a: AdminAccessScopeDimensions = {
            departmentScope: "restricted",
            allowedDepartmentIds: ["d-b", "d-a"],
            siteScope: "restricted",
            allowedSiteLocationIds: ["s2", "s1"],
        };
        const b: AdminAccessScopeDimensions = {
            departmentScope: "restricted",
            allowedDepartmentIds: ["d-a", "d-b"],
            siteScope: "restricted",
            allowedSiteLocationIds: ["s1", "s2"],
        };
        expect(buildAccessScopeCacheFingerprint(a)).toBe(buildAccessScopeCacheFingerprint(b));
        expect(buildAccessScopeCacheFingerprint(a)).toBe("dept:r:d-a|d-b;site:r:s1|s2");
    });

    it("differs when scope narrows so session cache keys do not collide", () => {
        const corp: AdminAccessScopeDimensions = {
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "all",
            allowedSiteLocationIds: null,
        };
        const siteScoped: AdminAccessScopeDimensions = {
            departmentScope: "all",
            allowedDepartmentIds: null,
            siteScope: "restricted",
            allowedSiteLocationIds: ["south-campus"],
        };
        expect(buildAccessScopeCacheFingerprint(corp)).not.toBe(buildAccessScopeCacheFingerprint(siteScoped));
    });
});
