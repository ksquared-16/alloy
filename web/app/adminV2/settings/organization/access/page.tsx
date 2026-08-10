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
 * Canonical Organization Access — `/organization/access`.
 *
 * **W-49.** This page previously admitted any portal-eligible principal and then rendered a
 * *notice* saying they lacked `settings.users_roles`. `07/AE-4`'s acceptance form is *"hidden
 * surfaces cannot be reached directly by URL"*, and a surface that renders — chapter tabs,
 * landing chooser and all — with an apology inside it is reached. `05…§1` counts 1 of 132 admin
 * pages gated on anything finer than "has a role"; this is one of the 131.
 *
 * The gate is `canManageUsersAndRoles`, which is the predicate the backing routes already call.
 * Evaluating the declared capability a second way here is what `05…§7.7`'s *"true for the same
 * reason"* rules out — and, because `L8` compounds with `L7`, a divergent predicate on *this*
 * surface locks an operator out of the screen they would use to repair it.
 *
 * Behaviour is unchanged for everyone who could previously do anything here: `canManageUsersAndRoles`
 * admits org `admin` by role and everyone else by grant, exactly as before. What changes is the
 * principal who could reach the surface but not use it — they are now refused at the boundary
 * instead of being shown the shell.
 */
export default async function OrganizationAccessPage({ searchParams }: PageProps) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        redirect("/unauthorized");
    }

    // The surface declares `settings.users_roles` (`lib/access/surfaceCapabilities.ts`) and the
    // layout enforces it — before the section is resolved, so no chapter is reachable by URL.
    if (!canManageUsersAndRoles(access)) {
        redirect("/unauthorized");
    }

    const chapters = visibleAccessChapters(heldAccessCapabilities(access));

    const resolved = searchParams ? await searchParams : {};
    const raw = Array.isArray(resolved.section) ? resolved.section[0] : resolved.section;
    const section = normalizeAccessWorkspaceChapter(typeof raw === "string" ? raw : "");

    // `07/AE-4`: a chapter filtered out of navigation must not be reachable by typing its URL.
    // Navigation and admission read the same list, one line apart, so they cannot drift.
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
