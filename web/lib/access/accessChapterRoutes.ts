/**
 * Access workspace sections — Users, Roles, Security.
 *
 * Canonical owner: `/organization/access?section=…`
 * Mirrors the Financials chapter-route pattern (`commercialChapterRoutes.ts`).
 *
 * **Access Scopes was retired as a chapter.** It held two cards that linked out to Locations and
 * Departments, which own those catalogs — it configured nothing. Meanwhile the question an operator
 * actually arrives with is *"where may this person work?"*, and that is a property of a person, so
 * it now lives on the User. Nothing about scope STORAGE or ENFORCEMENT changed: the same
 * `access-scope` route writes the same rows. What went away is a navigation entry that suggested
 * scope was configured somewhere other than where it is set.
 *
 * The key stays in {@link RETIRED_ACCESS_CHAPTERS} so an old link resolves to the chapter that
 * inherited the concern instead of silently falling through to a default.
 */

import { CANONICAL_ORGANIZATION_ACCESS_HREF } from "@/lib/admin/canonicalAdminRoutes";

export const ACCESS_WORKSPACE_CHAPTERS = ["users", "roles", "security"] as const;

export type AccessWorkspaceChapter = (typeof ACCESS_WORKSPACE_CHAPTERS)[number];

export const ACCESS_WORKSPACE_CHAPTER_META: Record<AccessWorkspaceChapter, { label: string; description: string }> = {
    users: {
        label: "Users",
        description: "People who can sign in to Alloy, their role, and where they may work.",
    },
    roles: {
        label: "Roles",
        description: "Permission sets that define what operators may do.",
    },
    security: {
        label: "Security",
        description: "Authentication methods, account security, and access auditing.",
    },
};

/**
 * **W49-F1.** Controls inside an admitted chapter whose route enforces something *other* than the
 * capability that admitted the chapter — `Send password reset` is gated on the portal `admin` role.
 *
 * The vocabulary lives here, beside the chapter keys, rather than in `lib/access/surfaceCapabilities`
 * where the resolver does: that module reaches `canManageUsersAndRoles` and is server-only, and the
 * three components that carry this list down to the control are all `"use client"`. A `import type`
 * from a server module is erased today and a runtime import the moment someone drops the `type`
 * keyword, which is too quiet a way to break a client bundle.
 */
export type AccessCommandKey = "password-reset";

/** Canonical base for the Access workspace. */
export const ACCESS_WORKSPACE_BASE_HREF = CANONICAL_ORGANIZATION_ACCESS_HREF;

/**
 * Chapters that existed and no longer do, mapped to whichever chapter absorbed the concern.
 *
 * A retired key must land somewhere deliberate. Letting it fall through to the default would put an
 * operator on Users too, but by accident — and the first time the default changed, an old bookmark
 * would quietly start opening an unrelated screen.
 */
export const RETIRED_ACCESS_CHAPTERS: Readonly<Record<string, AccessWorkspaceChapter>> = {
    // Location and department scope are now set on the person they restrict.
    scopes: "users",
};

export function normalizeAccessWorkspaceChapter(value: string | null | undefined): AccessWorkspaceChapter | null {
    const raw = value?.trim().toLowerCase() ?? "";
    if ((ACCESS_WORKSPACE_CHAPTERS as readonly string[]).includes(raw)) return raw as AccessWorkspaceChapter;
    return RETIRED_ACCESS_CHAPTERS[raw] ?? null;
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
