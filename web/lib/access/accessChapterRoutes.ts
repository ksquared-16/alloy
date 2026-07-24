/**
 * Access workspace sections — Users, Roles, Access Scopes, Security.
 *
 * Canonical owner: `/organization/access?section=…`
 * Mirrors the Financials chapter-route pattern (`commercialChapterRoutes.ts`).
 */

import { CANONICAL_ORGANIZATION_ACCESS_HREF } from "@/lib/admin/canonicalAdminRoutes";

export const ACCESS_WORKSPACE_CHAPTERS = ["users", "roles", "scopes", "security"] as const;

export type AccessWorkspaceChapter = (typeof ACCESS_WORKSPACE_CHAPTERS)[number];

export const ACCESS_WORKSPACE_CHAPTER_META: Record<AccessWorkspaceChapter, { label: string; description: string }> = {
    users: {
        label: "Users",
        description: "People who can sign in to Alloy, their assigned role, and their data access.",
    },
    roles: {
        label: "Roles",
        description: "Permission sets that define what operators may do.",
    },
    scopes: {
        label: "Access Scopes",
        description: "Locations and departments used when assigning organizational visibility.",
    },
    security: {
        label: "Security",
        description: "Authentication methods, account security, and access auditing.",
    },
};

/** Canonical base for the Access workspace. */
export const ACCESS_WORKSPACE_BASE_HREF = CANONICAL_ORGANIZATION_ACCESS_HREF;

export function normalizeAccessWorkspaceChapter(value: string | null | undefined): AccessWorkspaceChapter | null {
    const raw = value?.trim().toLowerCase() ?? "";
    return (ACCESS_WORKSPACE_CHAPTERS as readonly string[]).includes(raw) ? (raw as AccessWorkspaceChapter) : null;
}

export function accessWorkspaceChapterHref(
    chapter: AccessWorkspaceChapter | null | undefined,
    options?: { userId?: string | null; roleKey?: string | null },
): string {
    if (!chapter) return ACCESS_WORKSPACE_BASE_HREF;
    const params = new URLSearchParams();
    params.set("section", chapter);
    if (options?.userId?.trim()) params.set("userId", options.userId.trim());
    if (options?.roleKey?.trim()) params.set("roleKey", options.roleKey.trim());
    return `${ACCESS_WORKSPACE_BASE_HREF}?${params.toString()}`;
}
