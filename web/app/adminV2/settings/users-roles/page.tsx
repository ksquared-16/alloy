import { KeyRound } from "lucide-react";
import { redirect } from "next/navigation";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { canManageUsersAndRoles } from "@/lib/admin/canManageUsersAndRoles";
import UsersRolesConfigurationPage from "@/components/adminV2/settings/usersRoles/UsersRolesConfigurationPage";
import OrganizationDomainLanding from "@/components/adminV2/settings/organization/OrganizationDomainLanding";
import { buildAccessLandingModel } from "@/lib/configRuntime/accessLandingModel";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{ section?: string | string[] }>;
};

export default async function UsersRolesSettingsPage({ searchParams }: PageProps) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        redirect("/unauthorized");
    }

    const resolved = searchParams ? await searchParams : {};
    const raw = Array.isArray(resolved.section) ? resolved.section[0] : resolved.section;
    const section = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    const initialTab = section === "roles" ? "roles" : section === "users" ? "users" : null;

    if (!initialTab) {
        return (
            <OrganizationDomainLanding
                model={buildAccessLandingModel()}
                icon={KeyRound}
                testIdPrefix="access"
            />
        );
    }

    return (
        <UsersRolesConfigurationPage
            canManageUsersRoles={canManageUsersAndRoles(access)}
            initialTab={initialTab}
        />
    );
}
