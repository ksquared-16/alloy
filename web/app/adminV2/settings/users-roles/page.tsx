import { redirect } from "next/navigation";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { canManageUsersAndRoles } from "@/lib/admin/canManageUsersAndRoles";
import ConfigurationPatternPlaceholder from "@/components/adminV2/settings/configurationRuntime/ConfigurationPatternPlaceholder";
import UsersRolesSettingsClient from "./UsersRolesSettingsClient";

export const dynamic = "force-dynamic";

export default async function UsersRolesSettingsPage() {
    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        redirect("/unauthorized");
    }

    const canManageUsersRoles = canManageUsersAndRoles(access);

    return (
        <div className="w-full min-w-0 space-y-3">
            <header>
                <h1 className="config-typo-page-title">Users &amp; Roles</h1>
                <p className="config-typo-sublabel mt-1 max-w-2xl">
                    Org members, role assignment, and permission grants.
                </p>
            </header>
            <ConfigurationPatternPlaceholder surface="user-roles" />
            <UsersRolesSettingsClient canManageUsersRoles={canManageUsersRoles} />
        </div>
    );
}
