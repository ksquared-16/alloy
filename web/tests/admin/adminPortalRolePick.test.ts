import { describe, expect, it } from "vitest";
import { compatibilityPortalRole, hasPortalAdminMutateAccess } from "@/lib/admin/adminPortalRolePick";

describe("adminPortalRolePick", () => {
    it("hasPortalAdminMutateAccess matches admin membership", () => {
        expect(hasPortalAdminMutateAccess(["admin"])).toBe(true);
        expect(hasPortalAdminMutateAccess(["ops"])).toBe(false);
        expect(hasPortalAdminMutateAccess(["ops", "admin"])).toBe(true);
        expect(hasPortalAdminMutateAccess([" admin "])).toBe(true);
    });

    it("compatibilityPortalRole stays aligned with hasPortalAdminMutateAccess", () => {
        const keys: string[][] = [["admin"], ["ops"], ["ops", "admin"]];
        for (const k of keys) {
            expect(compatibilityPortalRole(k) === "admin").toBe(hasPortalAdminMutateAccess(k));
        }
    });
});
