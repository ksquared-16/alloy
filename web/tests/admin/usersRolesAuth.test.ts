import { describe, expect, it } from "vitest";
import {
    ADMIN_ACCESS_SCOPE_WRITE,
    ADMIN_ROLES_READ,
    ADMIN_ROLES_WRITE,
    ADMIN_USERS_READ,
    ADMIN_USERS_WRITE,
    canManageUsersAndRoles,
} from "@/lib/admin/canManageUsersAndRoles";
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
     * Admission is preserved because every org `admin` HOLDS these grants (`seed_default_rbac`, and
     * `seed_access_administration_split` for organizations that already existed). The admin case is
     * therefore still covered — one line down, by the grants that actually admit it.
     *
     * What this function MEANS changed with the four-authority split, and the distinction is worth
     * stating because the name did not. It is no longer "may manage users and roles" — that question
     * has four answers now, one per authority, and every route asks its own. This is the CHAPTER
     * gate: may this principal open `/organization/access` at all. So it is true for any Access
     * authority, read or write, and confers none of them.
     */
    it("denies an org admin role_key that holds no grant", () => {
        expect(canManageUsersAndRoles(access({ roleKeys: ["admin"], permissionKeys: [] }))).toBe(false);
    });

    it("allows an org admin by the grants every org admin holds", () => {
        expect(
            canManageUsersAndRoles(
                access({ roleKeys: ["admin"], permissionKeys: [ADMIN_USERS_READ, ADMIN_ROLES_WRITE] })
            )
        ).toBe(true);
    });

    it("opens the chapter for EACH Access authority alone — the split, at the page gate", () => {
        // Any one of them is enough to make the workspace worth opening, and none of them is enough
        // to do anything inside it that the holder's own key does not authorize.
        for (const key of [
            ADMIN_USERS_READ,
            ADMIN_USERS_WRITE,
            ADMIN_ROLES_READ,
            ADMIN_ROLES_WRITE,
            ADMIN_ACCESS_SCOPE_WRITE,
        ]) {
            expect(
                canManageUsersAndRoles(access({ roleKeys: ["coordinator"], permissionKeys: [key] })),
                `${key} does not open the Access chapter`
            ).toBe(true);
        }
    });

    it("the retired umbrella opens nothing", () => {
        // `settings.users_roles` is inactive after the split, so no role can hold it. A gate that
        // still answered to it would admit on a grant the database refuses to issue.
        expect(
            canManageUsersAndRoles(
                access({ roleKeys: ["coordinator"], permissionKeys: ["settings.users_roles"] })
            )
        ).toBe(false);
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
