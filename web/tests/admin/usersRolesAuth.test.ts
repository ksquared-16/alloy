import { describe, expect, it } from "vitest";
import { canManageUsersAndRoles, SETTINGS_USERS_ROLES_PERMISSION } from "@/lib/admin/canManageUsersAndRoles";
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";
import { permissionUiArea } from "@/lib/admin/permissionUiArea";

function access(partial: Partial<AdminAccessContextSuccess>): AdminAccessContextSuccess {
    return {
        ok: true,
        userId: "u1",
        orgId: "org-1",
        roleKeys: ["ops"],
        permissionKeys: [],
        departmentScope: "all",
        allowedDepartmentIds: null,
        siteScope: "all",
        allowedSiteLocationIds: null,
        ...partial,
    };
}

describe("canManageUsersAndRoles", () => {
    it("allows org admin role_key", () => {
        expect(canManageUsersAndRoles(access({ roleKeys: ["admin"] }))).toBe(true);
    });

    it("allows settings.users_roles permission grant", () => {
        expect(
            canManageUsersAndRoles(
                access({
                    roleKeys: ["coordinator"],
                    permissionKeys: [SETTINGS_USERS_ROLES_PERMISSION],
                })
            )
        ).toBe(true);
    });

    it("denies ops without admin or settings grant", () => {
        expect(canManageUsersAndRoles(access({ roleKeys: ["ops"], permissionKeys: [] }))).toBe(false);
    });

    it("denies regional_lead without grant", () => {
        expect(canManageUsersAndRoles(access({ roleKeys: ["regional_lead"], permissionKeys: [] }))).toBe(false);
    });
});

describe("permissionUiArea", () => {
    it("maps settings group to Configuration/Admin", () => {
        expect(permissionUiArea("settings")).toBe("Configuration/Admin");
    });

    it("maps crm-ish groups to CRM", () => {
        expect(permissionUiArea("crm")).toBe("CRM");
    });
});
