import { redirect } from "next/navigation";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { canManageUsersAndRoles } from "@/lib/admin/canManageUsersAndRoles";
import UsersRolesConfigurationPage from "@/components/adminV2/settings/usersRoles/UsersRolesConfigurationPage";
import OrganizationDomainLanding from "@/components/adminV2/settings/organization/OrganizationDomainLanding";
import { buildAccessLandingModel } from "@/lib/configRuntime/accessLandingModel";
import { normalizeAccessWorkspaceChapter } from "@/lib/access/accessChapterRoutes";
import { heldAccessCapabilities, visibleAccessChapters } from "@/lib/access/surfaceCapabilities";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{ section?: string | string[] }>;
};

/**
 * **W-49, and the reason this file is gated rather than only `organization/access/page.tsx`.**
 *
 * `IA-8` records that one workspace has **two live rendering routes**, and both render
 * `AccessWorkspaceSurface`. Gating only the canonical one would leave this path as an unguarded
 * bypass — the surface would be "hidden" and reachable by URL, which is precisely the property
 * `07/AE-4` rejects. `W-51` deletes the duplicate; until it does, the two must gate identically.
 * The landing model's tiles still point here, which is why deletion is that workstream's call and
 * not this one's.
 */
export default async function UsersRolesSettingsPage({ searchParams }: PageProps) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        redirect("/unauthorized");
    }

    if (!canManageUsersAndRoles(access)) {
        redirect("/unauthorized");
    }

    const chapters = visibleAccessChapters(heldAccessCapabilities(access));

    const resolved = searchParams ? await searchParams : {};
    const raw = Array.isArray(resolved.section) ? resolved.section[0] : resolved.section;
    const section = normalizeAccessWorkspaceChapter(typeof raw === "string" ? raw : "");

    if (section && !chapters.includes(section)) {
        redirect("/unauthorized");
    }

    if (!section) {
        return (
            <OrganizationDomainLanding
                model={buildAccessLandingModel(chapters)}
                icon="key-round"
                testIdPrefix="access"
            />
        );
    }

    return <UsersRolesConfigurationPage chapters={chapters} initialTab={section} />;
}
