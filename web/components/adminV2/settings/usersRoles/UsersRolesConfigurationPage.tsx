"use client";

import AccessWorkspaceSurface from "@/components/adminV2/settings/access/AccessWorkspaceSurface";
import type { AccessWorkspaceChapter } from "@/lib/access/accessChapterRoutes";

/**
 * Thin wrapper — `/settings/users-roles?section=…` now renders the Access product workspace
 * (Collection → Selected → Focused Workspace) instead of the legacy technical-tab client.
 * Kept as a named entrypoint so the route file and any deep links into this module stay stable.
 */
export default function UsersRolesConfigurationPage({
    canManageUsersRoles,
    initialTab = "users",
}: {
    canManageUsersRoles: boolean;
    initialTab?: AccessWorkspaceChapter;
}) {
    return <AccessWorkspaceSurface canManage={canManageUsersRoles} section={initialTab} />;
}
