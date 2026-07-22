"use client";

import UsersRolesSettingsClient from "@/app/adminV2/settings/users-roles/UsersRolesSettingsClient";
import SettingsConfigurationSurfaceShell from "@/components/adminV2/settings/configurationRuntime/SettingsConfigurationSurfaceShell";

const USERS_ROLES_SUBTITLE = "Org members, role assignment, and permission grants.";

export default function UsersRolesConfigurationPage({
    canManageUsersRoles,
    initialTab = "users",
}: {
    canManageUsersRoles: boolean;
    initialTab?: "users" | "roles";
}) {
    return (
        <SettingsConfigurationSurfaceShell
            title="Users & Roles"
            subtitle={USERS_ROLES_SUBTITLE}
            testId="settings-users-roles-page"
        >
            <UsersRolesSettingsClient
                canManageUsersRoles={canManageUsersRoles}
                initialTab={initialTab}
            />
        </SettingsConfigurationSurfaceShell>
    );
}
