import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertPaymentDrawerReadable, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";

function restrictedDeptSite(): AdminAccessContextSuccess {
    return {
        ok: true,
        userId: "u1",
        orgId: "org-a",
        roleKeys: ["school_director"],
        permissionKeys: [],
        departmentScope: "restricted",
        allowedDepartmentIds: ["dept-a"],
        siteScope: "restricted",
        allowedSiteLocationIds: ["site-a"],
    };
}

describe("Financial / payment routes — scope helpers", () => {
    it("assertPaymentDrawerReadable returns false when payment row is missing", async () => {
        const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        const eqPay = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) });
        const selectPay = vi.fn().mockReturnValue({ eq: eqPay });
        const from = vi.fn().mockReturnValue({ select: selectPay });
        const supabase = { from } as unknown as SupabaseClient;
        const dim = scopeDimensionsFromAccess(restrictedDeptSite());
        await expect(assertPaymentDrawerReadable(supabase, "org-a", dim, "missing-pay")).resolves.toBe(false);
        expect(from).toHaveBeenCalledWith("payments");
    });
});
