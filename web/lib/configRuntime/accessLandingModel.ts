import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";
import type { OrganizationDomainLandingModel } from "@/lib/configRuntime/organizationDomainLandingModel";

/** Access landing — permission and scope assignment, not inheritance. */
export function buildAccessLandingModel(): OrganizationDomainLandingModel {
    return {
        domainKey: "access",
        title: "Access",
        purpose:
            "Who can operate Alloy — users, roles/permissions, and where they may work. Access is assignment and authorization, not a configuration inheritance domain.",
        ownershipNote: "Do not describe Access as Organization→Location inheritance.",
        summaryCards: [
            {
                id: "permission",
                label: "Permission",
                value: "Roles",
                detail: "What an operator is allowed to do.",
            },
            {
                id: "scope",
                label: "Visibility / scope",
                value: "Location & department",
                detail: "Where an operator’s access applies — assigned on the user, not inherited config.",
            },
            {
                id: "assignment",
                label: "Assignment",
                value: "Users",
                detail: "Bind people to roles and scopes.",
            },
        ],
        tiles: [
            {
                id: "users",
                label: "Users",
                summary: "Access profiles, Location scope, and department assignments on members.",
                capabilities: [
                    "Member directory",
                    "Location scope assignment",
                    "Department assignment on user",
                ],
                kind: "assignment",
                postureLabel: "Assignment",
                href: `${adminSettingsSubpathHref("users-roles")}?section=users`,
            },
            {
                id: "roles",
                label: "Roles & permissions",
                summary: "Role definitions and permission keys.",
                capabilities: ["Role catalog", "Permission keys"],
                kind: "configuration",
                postureLabel: "Permission",
                href: `${adminSettingsSubpathHref("users-roles")}?section=roles`,
            },
            {
                id: "departments",
                label: "Departments",
                summary: "Department catalog used when assigning operator scope.",
                capabilities: ["Department list", "Scope labels for assignment"],
                kind: "assignment",
                postureLabel: "Scope catalog",
                href: adminSettingsSubpathHref("departments"),
            },
        ],
    };
}
