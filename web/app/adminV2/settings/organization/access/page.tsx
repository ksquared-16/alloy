import { redirect } from "next/navigation";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { canManageUsersAndRoles } from "@/lib/admin/canManageUsersAndRoles";
import UsersRolesConfigurationPage from "@/components/adminV2/settings/usersRoles/UsersRolesConfigurationPage";
import OrganizationDomainLanding from "@/components/adminV2/settings/organization/OrganizationDomainLanding";
import { buildAccessLandingModel } from "@/lib/configRuntime/accessLandingModel";
import { normalizeAccessWorkspaceChapter } from "@/lib/access/accessChapterRoutes";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{ section?: string | string[] }>;
};

/** Canonical Organization Access — `/organization/access`. */
export default async function OrganizationAccessPage({ searchParams }: PageProps) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        redirect("/unauthorized");
    }

    const resolved = searchParams ? await searchParams : {};
    const raw = Array.isArray(resolved.section) ? resolved.section[0] : resolved.section;
    const section = normalizeAccessWorkspaceChapter(typeof raw === "string" ? raw : "");

    if (!section) {
        return (
            <OrganizationDomainLanding
                model={buildAccessLandingModel()}
                icon="key-round"
                testIdPrefix="access"
            />
        );
    }

    return (
        <UsersRolesConfigurationPage
            canManageUsersRoles={canManageUsersAndRoles(access)}
            initialTab={section}
        />
    );
}
