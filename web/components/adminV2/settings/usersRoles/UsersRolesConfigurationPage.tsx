"use client";

import AccessWorkspaceSurface from "@/components/adminV2/settings/access/AccessWorkspaceSurface";
import type { AccessCommandKey, AccessWorkspaceChapter } from "@/lib/access/accessChapterRoutes";

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
    commands,
}: {
    initialTab?: AccessWorkspaceChapter;
    chapters: readonly AccessWorkspaceChapter[];
    /**
     * W49-F1. Controls inside an admitted chapter whose route enforces something *other* than the
     * chapter's capability. Required, like `chapters`, and for the same reason: a default would let
     * a caller that forgot it fall back to offering every control.
     */
    commands: readonly AccessCommandKey[];
}) {
    return <AccessWorkspaceSurface chapters={chapters} commands={commands} section={initialTab} />;
}
