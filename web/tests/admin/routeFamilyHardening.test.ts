import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    assertGlJournalEntryReadableInAdminScope,
    fetchScopedCustomerIdsForRestrictedAdmin,
    fetchScopedPersonIdsForRestrictedAdmin,
    scopeDimensionsFromAccess,
} from "@/lib/admin/accessScope";
import { collectPaymentIdsLinkedViaAllocationsToScopedJobs } from "@/lib/admin/adminPaymentListScope";
import { resolveDiscountRedemptionFkPoolsForRestrictedAdmin } from "@/lib/admin/discountRedemptionListScope";
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";

function corporateAccess(): AdminAccessContextSuccess {
    return {
        ok: true,
        userId: "u-corp",
        orgId: "org-a",
        roleKeys: ["admin"],
        permissionKeys: [],
        departmentScope: "all",
        allowedDepartmentIds: null,
        siteScope: "all",
        allowedSiteLocationIds: null,
    };
}

function restrictedAccess(): AdminAccessContextSuccess {
    return {
        ok: true,
        userId: "u-dir",
        orgId: "org-a",
        roleKeys: ["school_director"],
        permissionKeys: [],
        departmentScope: "restricted",
        allowedDepartmentIds: ["dept-a"],
        siteScope: "restricted",
        allowedSiteLocationIds: ["site-a"],
    };
}

describe("Route family hardening helpers", () => {
    it("assertGlJournalEntryReadableInAdminScope skips checks for unrestricted users", async () => {
        const dim = scopeDimensionsFromAccess(corporateAccess());
        await expect(
            assertGlJournalEntryReadableInAdminScope({} as SupabaseClient, "org-a", dim, { source_type: "unknown" }, [])
        ).resolves.toBe(true);
    });

    it("assertGlJournalEntryReadableInAdminScope denies unresolved restricted reads", async () => {
        const dim = scopeDimensionsFromAccess(restrictedAccess());
        await expect(
            assertGlJournalEntryReadableInAdminScope({} as SupabaseClient, "org-a", dim, { source_type: "manual", source_id: null }, [])
        ).resolves.toBe(false);
    });

    it("resolveDiscountRedemptionFkPoolsForRestrictedAdmin returns null when unrestricted", async () => {
        const dim = scopeDimensionsFromAccess(corporateAccess());
        await expect(resolveDiscountRedemptionFkPoolsForRestrictedAdmin({} as SupabaseClient, "org-a", dim)).resolves.toBeNull();
    });

    it("collectPaymentIdsLinkedViaAllocationsToScopedJobs returns [] without job ids", async () => {
        await expect(collectPaymentIdsLinkedViaAllocationsToScopedJobs({} as SupabaseClient, "org-a", [])).resolves.toEqual([]);
    });

    it("fetchScopedCustomerIdsForRestrictedAdmin returns null when unrestricted", async () => {
        const dim = scopeDimensionsFromAccess(corporateAccess());
        await expect(fetchScopedCustomerIdsForRestrictedAdmin({} as SupabaseClient, "org-a", dim)).resolves.toBeNull();
    });

    it("fetchScopedPersonIdsForRestrictedAdmin returns null when unrestricted", async () => {
        const dim = scopeDimensionsFromAccess(corporateAccess());
        await expect(fetchScopedPersonIdsForRestrictedAdmin({} as SupabaseClient, "org-a", dim)).resolves.toBeNull();
    });
});
