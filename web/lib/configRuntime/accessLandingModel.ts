import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";
import type { OrganizationDomainLandingModel } from "@/lib/configRuntime/organizationDomainLandingModel";
import type { AccessWorkspaceChapter } from "@/lib/access/accessChapterRoutes";

/**
 * Access landing — Users, Roles, Access Scopes, Security. No conceptual KPI cards.
 *
 * **W-49.** The tiles *are* the navigation into the chapters, so they are the surface `05…§7.7`
 * means by *"navigation filters from the same declaration."* `chapters` is the list the page
 * already admitted on (`visibleAccessChapters`), so a tile can never offer a chapter the route
 * would refuse.
 *
 * The parameter is **required and has no default**. A default of "all four" would be the fail-open
 * `W-47` just removed from scope presentation, one layer up: a caller that forgot to pass the
 * filter would silently get the unfiltered product, and nothing would say so.
 */
export function buildAccessLandingModel(
    chapters: readonly AccessWorkspaceChapter[]
): OrganizationDomainLandingModel {
    const model: OrganizationDomainLandingModel = {
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

    // Tile ids are the chapter keys, which is what makes the filter a join rather than a parallel
    // list to keep in step. A tile whose id is not a chapter would be dropped here — and the tier A
    // check asserts the ids cover the chapter set exactly, so that cannot happen unnoticed.
    return {
        ...model,
        tiles: model.tiles.filter((tile) => chapters.includes(tile.id as AccessWorkspaceChapter)),
    };
}
