import { describe, expect, it } from "vitest";
import {
    compatibilityPortalRole,
    hasPortalAdminMutateAccess,
    hasPortalRecordManageAccess,
    resolvePortalRecordManageAccess,
} from "@/lib/admin/adminPortalRolePick";
import { displayRoleForAdminPicker } from "@/lib/admin/userRolesMembership";

describe("adminPortalRolePick", () => {
    it("hasPortalAdminMutateAccess matches admin membership", () => {
        expect(hasPortalAdminMutateAccess(["admin"])).toBe(true);
        expect(hasPortalAdminMutateAccess(["ops"])).toBe(false);
        expect(hasPortalAdminMutateAccess(["ops", "admin"])).toBe(true);
        expect(hasPortalAdminMutateAccess([" admin "])).toBe(true);
    });

    it("hasPortalRecordManageAccess allows admin and ops", () => {
        expect(hasPortalRecordManageAccess(["admin"])).toBe(true);
        expect(hasPortalRecordManageAccess(["ops"])).toBe(true);
        expect(hasPortalRecordManageAccess(["school_director"])).toBe(false);
        expect(hasPortalRecordManageAccess(["ops", "school_director"])).toBe(true);
    });

    it("resolvePortalRecordManageAccess falls back to legacy role", () => {
        expect(resolvePortalRecordManageAccess({ roleKeys: [], legacyRole: "ops" })).toBe(true);
        expect(resolvePortalRecordManageAccess({ roleKeys: [], legacyRole: "admin" })).toBe(true);
        expect(resolvePortalRecordManageAccess({ roleKeys: [], legacyRole: "viewer" })).toBe(false);
    });

    it("compatibilityPortalRole stays aligned with hasPortalAdminMutateAccess", () => {
        const keys: string[][] = [["admin"], ["ops"], ["ops", "admin"]];
        for (const k of keys) {
            expect(compatibilityPortalRole(k) === "admin").toBe(hasPortalAdminMutateAccess(k));
        }
    });

    it("ops + school_director: Settings primary picker shows ops and portal mutate stays false without admin key", () => {
        const keys = ["ops", "school_director"];
        expect(displayRoleForAdminPicker(keys)).toBe("ops");
        expect(hasPortalAdminMutateAccess(keys)).toBe(false);
        expect(compatibilityPortalRole(keys)).toBe("ops");
    });
});
