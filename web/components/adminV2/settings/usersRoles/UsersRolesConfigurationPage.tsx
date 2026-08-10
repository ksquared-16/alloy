"use client";

import AccessWorkspaceSurface from "@/components/adminV2/settings/access/AccessWorkspaceSurface";
import type { AccessWorkspaceChapter } from "@/lib/access/accessChapterRoutes";

/**
 * Thin wrapper — `/settings/users-roles?section=…` now renders the Access product workspace
 * (Collection → Selected → Focused Workspace) instead of the legacy technical-tab client.
 * Kept as a named entrypoint so the route file and any deep links into this module stay stable.
 */
/**
 * **W-49: the `canManageUsersRoles` prop is gone, and `chapters` replaces it.**
 *
 * The old prop was a boolean the surface used to decide whether to draw an apology. Authorization
 * is decided at the route boundary now, so the only thing left to pass down is *which chapters
 * this principal may see* — which the page computes from `visibleAccessChapters`, the same
 * declaration it admits on. The client is told the answer; it never re-derives it.
 *
 * What keeps that true is the tier A check in `web/tests/access/surfaceCapabilityDeclaration.test.ts`,
 * which discovers every page rendering this surface and requires each to call the declared
 * capability's gate and to filter from the declaration.
 */
export default function UsersRolesConfigurationPage({
    initialTab = "users",
    chapters,
}: {
    initialTab?: AccessWorkspaceChapter;
    chapters: readonly AccessWorkspaceChapter[];
}) {
    return <AccessWorkspaceSurface chapters={chapters} section={initialTab} />;
}
