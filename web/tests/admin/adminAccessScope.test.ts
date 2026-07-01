import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    accessScopeRestrictsData,
    applyRecordScopeConstraintsToQuery,
    narrowJobIdsForScheduleList,
    recordReadableWithoutDeptSiteLinkage,
    scopeDimensionsFromAccess,
} from "@/lib/admin/accessScope";
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";

function corporateAccess(): AdminAccessContextSuccess {
    return {
        ok: true,
        userId: "u1",
        orgId: "org-a",
        roleKeys: ["admin"],
        permissionKeys: [],
        departmentScope: "all",
        allowedDepartmentIds: null,
        siteScope: "all",
        allowedSiteLocationIds: null,
    };
}

function regionalAccess(): AdminAccessContextSuccess {
    return {
        ok: true,
        userId: "u2",
        orgId: "org-a",
        roleKeys: ["regional_lead"],
        permissionKeys: [],
        departmentScope: "restricted",
        allowedDepartmentIds: ["dept-east"],
        siteScope: "restricted",
        allowedSiteLocationIds: ["site-1"],
    };
}

describe("accessScopeRestrictsData", () => {
    it("is false for corporate (all/all)", () => {
        expect(accessScopeRestrictsData(scopeDimensionsFromAccess(corporateAccess()))).toBe(false);
    });

    it("is true when department restricted", () => {
        const dim = scopeDimensionsFromAccess(regionalAccess());
        expect(dim.departmentScope).toBe("restricted");
        expect(accessScopeRestrictsData(dim)).toBe(true);
    });
});

describe("recordReadableWithoutDeptSiteLinkage", () => {
    it("allows only full dept + site visibility", () => {
        expect(recordReadableWithoutDeptSiteLinkage(scopeDimensionsFromAccess(corporateAccess()))).toBe(true);
        expect(recordReadableWithoutDeptSiteLinkage(scopeDimensionsFromAccess(regionalAccess()))).toBe(false);
    });
});

describe("narrowJobIdsForScheduleList", () => {
    it("returns all when caller has full visibility", async () => {
        const dim = scopeDimensionsFromAccess(corporateAccess());
        const out = await narrowJobIdsForScheduleList({} as SupabaseClient, "org-a", dim, null);
        expect(out).toBe("all");
    });

    it("returns singleton array when corporate and job filter provided", async () => {
        const dim = scopeDimensionsFromAccess(corporateAccess());
        const out = await narrowJobIdsForScheduleList({} as SupabaseClient, "org-a", dim, "job-99");
        expect(out).toEqual(["job-99"]);
    });

    it("returns none when restricted scope resolves to impossible constraints", async () => {
        const dim = {
            departmentScope: "restricted" as const,
            allowedDepartmentIds: [] as string[],
            siteScope: "all" as const,
            allowedSiteLocationIds: null as string[] | null,
        };
        const out = await narrowJobIdsForScheduleList({} as SupabaseClient, "org-a", dim, null);
        expect(out).toBe("none");
    });

    it("loads scoped job ids through jobs query when restricted", async () => {
        const dim = {
            departmentScope: "restricted" as const,
            allowedDepartmentIds: ["d1"],
            siteScope: "all" as const,
            allowedSiteLocationIds: null as string[] | null,
        };

        const workUnitsChain = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [{ id: "wu1" }], error: null }),
        };

        const jobsChain = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ id: "job-a" }, { id: "job-b" }], error: null }),
        };

        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "work_units") return workUnitsChain;
                return jobsChain;
            }),
        } as unknown as SupabaseClient;

        const out = await narrowJobIdsForScheduleList(supabase, "org-a", dim, null);
        expect(out).toEqual(["job-a", "job-b"]);
    });
});

describe("resolveRecordScopeConstraints + applyRecordScopeConstraintsToQuery", () => {
    it("applyRecordScopeConstraintsToQuery chains null guards and in-list filters", () => {
        const calls: string[] = [];
        const q = {
            not: vi.fn(function (this: unknown, col: string, op: string, val: unknown) {
                calls.push(`not:${col}:${op}:${String(val)}`);
                return this;
            }),
            in: vi.fn(function (this: unknown, col: string, vals: unknown) {
                calls.push(`in:${col}:${JSON.stringify(vals)}`);
                return this;
            }),
        };

        applyRecordScopeConstraintsToQuery(q, {
            impossible: false,
            workUnitIds: ["wu1"],
            locationIds: ["loc1"],
        });

        expect(q.not).toHaveBeenCalled();
        expect(q.in).toHaveBeenCalled();
        expect(calls.some((c) => c.startsWith("in:work_unit_id"))).toBe(true);
        expect(calls.some((c) => c.startsWith("in:location_id"))).toBe(true);
    });
});

describe("scopeDimensionsFromAccess", () => {
    it("maps bundle success fields", () => {
        const dim = scopeDimensionsFromAccess(corporateAccess());
        expect(dim.departmentScope).toBe("all");
        expect(dim.siteScope).toBe("all");
    });
});
