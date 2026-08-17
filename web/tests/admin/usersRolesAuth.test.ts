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
    /**
     * W-13 / AD-22 — this used to read "allows org admin role_key", asserting
     * `canManageUsersAndRoles({ roleKeys: ["admin"], permissionKeys: [] }) === true`.
     *
     * That is the fifth authority layer (`04-authentication-model.md §3.6`, A2-8): a role literal in
     * application code satisfying a capability gate on its own, stored in no table and scoped to no
     * org. The operator's standing directive is to reduce the hierarchy to four layers, so the
     * expectation is inverted rather than deleted — the case still matters, and what changed is the
     * answer.
     *
     * Admission is preserved because every org `admin` HOLDS this grant (`20260505120100`,
     * `seed_default_rbac`, and the re-assertion in `20260811120000`). The admin case is therefore
     * still covered — one line down, by the grant that actually admits it.
     */
    it("denies an org admin role_key that holds no grant", () => {
        expect(canManageUsersAndRoles(access({ roleKeys: ["admin"], permissionKeys: [] }))).toBe(false);
    });

    it("allows an org admin by the grant every org admin holds", () => {
        expect(
            canManageUsersAndRoles(
                access({ roleKeys: ["admin"], permissionKeys: [SETTINGS_USERS_ROLES_PERMISSION] })
            )
        ).toBe(true);
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
