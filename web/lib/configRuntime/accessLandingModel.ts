import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";
import type { OrganizationDomainLandingModel } from "@/lib/configRuntime/organizationDomainLandingModel";

/** Access landing — Users, Roles, Access Scopes, Security. No conceptual KPI cards. */
export function buildAccessLandingModel(): OrganizationDomainLandingModel {
    return {
        domainKey: "access",
        title: "Access",
        purpose: "Choose who can sign in, what they may do, where they may operate, and how accounts are protected.",
        ownershipNote: "Access is assignment and authorization — not configuration inheritance.",
        summaryCards: [],
        tiles: [
            {
                id: "users",
                label: "Users",
                summary: "People who can sign in, their roles, and their data access.",
                capabilities: ["Member directory", "Invite", "Location & department scope"],
                kind: "assignment",
                postureLabel: "Users",
                href: `${adminSettingsSubpathHref("users-roles")}?section=users`,
            },
            {
                id: "roles",
                label: "Roles",
                summary: "Permission sets that define what operators may do.",
                capabilities: ["Role catalog", "Permission grants", "Assigned users"],
                kind: "configuration",
                postureLabel: "Roles",
                href: `${adminSettingsSubpathHref("users-roles")}?section=roles`,
            },
            {
                id: "scopes",
                label: "Access Scopes",
                summary: "Locations and departments used when assigning organizational visibility.",
                capabilities: ["Departments catalog", "Locations (owned by Locations)", "Assignment context"],
                kind: "assignment",
                postureLabel: "Scopes",
                href: `${adminSettingsSubpathHref("users-roles")}?section=scopes`,
            },
            {
                id: "security",
                label: "Security",
                summary: "Authentication methods, account security, and access auditing.",
                capabilities: ["Password reset", "Sign-in policies", "Audit log"],
                kind: "utility",
                postureLabel: "Security",
                href: `${adminSettingsSubpathHref("users-roles")}?section=security`,
            },
        ],
    };
}
