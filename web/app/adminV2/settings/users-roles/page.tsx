import { redirect } from "next/navigation";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { canManageUsersAndRoles } from "@/lib/admin/canManageUsersAndRoles";
import UsersRolesSettingsClient from "./UsersRolesSettingsClient";

export const dynamic = "force-dynamic";

export default async function UsersRolesSettingsPage() {
    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        redirect("/unauthorized");
    }

    const canManageUsersRoles = canManageUsersAndRoles(access);

    return (
        <div className="w-full max-w-6xl space-y-3">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Users &amp; Roles</h1>
                <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                    Org members, role assignment, and CRM data visibility — plus role definitions and permission grants. Server routes require org
                    admin or the <code className="rounded bg-alloy-forge/8 px-1">settings.users_roles</code> permission.
                </p>
            </header>
            <UsersRolesSettingsClient canManageUsersRoles={canManageUsersRoles} />
        </div>
    );
}
