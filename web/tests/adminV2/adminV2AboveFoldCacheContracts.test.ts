import { describe, expect, it } from "vitest";

import {
    ADMINV2_ABOVE_FOLD_CACHE_LIMITS,
    ADMINV2_ABOVE_FOLD_CACHE_TTL_MS,
    deptAboveFoldCacheKey,
    drawerPrimaryCacheKey,
    workspaceAboveFoldCacheKey,
    workUnitAboveFoldCacheKey,
} from "@/lib/adminV2/adminV2AboveFoldCacheContracts";

describe("adminV2AboveFoldCacheContracts", () => {
    it("exposes TTLs and workspace visible dept cap", () => {
        expect(ADMINV2_ABOVE_FOLD_CACHE_TTL_MS.workspace_above_fold).toBeGreaterThan(0);
        expect(ADMINV2_ABOVE_FOLD_CACHE_LIMITS.workspace_visible_dept_prefetch).toBe(3);
    });

    it("builds stable cache key strings", () => {
        expect(workspaceAboveFoldCacheKey({ orgId: "o1", principalUserId: "u1", accessScopeFingerprint: "fp" })).toContain(
            "workspace_above_fold:o1"
        );
        expect(
            deptAboveFoldCacheKey({
                orgId: "o1",
                departmentId: "d1",
                principalUserId: "u1",
                accessScopeFingerprint: "fp",
            })
        ).toContain("dept_above_fold:o1:d1");
        expect(
            workUnitAboveFoldCacheKey({
                orgId: "o1",
                departmentId: "d1",
                workUnitId: "wu1",
                principalUserId: "u1",
                accessScopeFingerprint: "fp",
            })
        ).toContain("work_unit_above_fold:o1:d1:wu1");
        expect(drawerPrimaryCacheKey("opportunities", "rec-1")).toBe("drawer_primary:opportunities:rec-1");
    });
});
