import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    assertExistingOpportunityMutableInAdminScope,
    assertJobInAccessScope,
    assertScheduleInAccessScope,
    departmentIdAllowed,
    scopeDimensionsFromAccess,
} from "@/lib/admin/accessScope";
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";

/** Corporate visibility — PATCH handlers still call these helpers; DB lookups short-circuit. */
function corporate(): AdminAccessContextSuccess {
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

/** Regional / director-style restricted department list (site unrestricted). */
function restrictedDept(): AdminAccessContextSuccess {
    return {
        ok: true,
        userId: "u2",
        orgId: "org-a",
        roleKeys: ["school_director"],
        permissionKeys: [],
        departmentScope: "restricted",
        allowedDepartmentIds: ["dept-a"],
        siteScope: "all",
        allowedSiteLocationIds: null,
    };
}

describe("Card 6B mutation gates — helper behavior", () => {
    it("departmentIdAllowed denies PATCH/DELETE targets outside allowed departments", () => {
        const dim = scopeDimensionsFromAccess(restrictedDept());
        expect(departmentIdAllowed(dim, "dept-a")).toBe(true);
        expect(departmentIdAllowed(dim, "dept-other")).toBe(false);
        expect(departmentIdAllowed(dim, null)).toBe(false);
    });

    it("direct API bypass: corporate scope skips job mutation checks without querying Supabase", async () => {
        const from = vi.fn();
        const supabase = { from } as unknown as SupabaseClient;
        const dim = scopeDimensionsFromAccess(corporate());
        await assertJobInAccessScope(supabase, "org-a", dim, {
            work_unit_id: "wu-1",
            location_id: "loc-9",
        });
        expect(from).not.toHaveBeenCalled();
    });

    it("direct API bypass: corporate scope skips schedule mutation checks without querying Supabase", async () => {
        const from = vi.fn();
        const supabase = { from } as unknown as SupabaseClient;
        const dim = scopeDimensionsFromAccess(corporate());
        await assertScheduleInAccessScope(supabase, "org-a", dim, {
            job_id: "job-1",
            location_id: "loc-1",
        });
        expect(from).not.toHaveBeenCalled();
    });

    it("Card 6C: assertExistingOpportunityMutableInAdminScope loads opportunity row then short-circuits for corporate scope", async () => {
        const maybeSingle = vi.fn().mockResolvedValue({
            data: { work_unit_id: "wu-1", location_id: "loc-1" },
            error: null,
        });
        const eqOrg = vi.fn().mockReturnValue({ maybeSingle });
        const eqId = vi.fn().mockReturnValue({ eq: eqOrg });
        const select = vi.fn().mockReturnValue({ eq: eqId });
        const from = vi.fn().mockReturnValue({ select });
        const supabase = { from } as unknown as SupabaseClient;
        const dim = scopeDimensionsFromAccess(corporate());
        await expect(assertExistingOpportunityMutableInAdminScope(supabase, "org-a", dim, "opp-1")).resolves.toBe(true);
        expect(from).toHaveBeenCalledWith("opportunities");
        expect(maybeSingle).toHaveBeenCalled();
    });

    it("Card 6C: assertExistingOpportunityMutableInAdminScope returns false when opportunity row is missing", async () => {
        const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        const eqOrg = vi.fn().mockReturnValue({ maybeSingle });
        const eqId = vi.fn().mockReturnValue({ eq: eqOrg });
        const select = vi.fn().mockReturnValue({ eq: eqId });
        const from = vi.fn().mockReturnValue({ select });
        const supabase = { from } as unknown as SupabaseClient;
        const dim = scopeDimensionsFromAccess(corporate());
        await expect(assertExistingOpportunityMutableInAdminScope(supabase, "org-a", dim, "missing")).resolves.toBe(false);
    });
});
