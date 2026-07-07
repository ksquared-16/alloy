import { redirect } from "next/navigation";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { canManageUsersAndRoles } from "@/lib/admin/canManageUsersAndRoles";
import UsersRolesConfigurationPage from "@/components/adminV2/settings/usersRoles/UsersRolesConfigurationPage";

export const dynamic = "force-dynamic";

export default async function UsersRolesSettingsPage() {
    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        redirect("/unauthorized");
    }

    return <UsersRolesConfigurationPage canManageUsersRoles={canManageUsersAndRoles(access)} />;
}
