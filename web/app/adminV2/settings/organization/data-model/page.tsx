import DataModelWorkspaceSurface from "@/components/adminV2/settings/dataModel/DataModelWorkspaceSurface";
import { resolveDataModelEntityRoute } from "@/lib/dataModel/dataModelChapterRoutes";
import { loadDataModelEntitiesWorkspaceVm } from "@/lib/dataModel/loadDataModelEntitiesWorkspaceVm";
import { redirect } from "next/navigation";
import { CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF } from "@/lib/admin/canonicalAdminRoutes";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{
        section?: string | string[];
        entity?: string | string[];
        tab?: string | string[];
        field?: string | string[];
    }>;
};

function firstOf(value: string | string[] | undefined): string | undefined {
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === "string" ? raw.trim() : undefined;
}

/**
 * Canonical Organization Data Model — `/organization/data-model`.
 *
 * Entity-centric: pick an Entity, then work inside it. Legacy `?section=` links
 * (fields, statuses, option-sets, relationships) map onto the matching Entity tab
 * rather than a separate category page.
 *
 * `?section=calculations` redirects to the first-class Operational Intelligence product
 * so Data Model no longer hosts a second editable mount.
 */
export default async function OrganizationDataModelPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const route = resolveDataModelEntityRoute({
        section: firstOf(resolved.section),
        entity: firstOf(resolved.entity),
        tab: firstOf(resolved.tab),
        field: firstOf(resolved.field),
    });

    if (route.mode === "calculations") {
        redirect(CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF);
    }

    const entitiesLoad = await loadDataModelEntitiesWorkspaceVm();

    return (
        <DataModelWorkspaceSurface
            mode="entity"
            initialEntity={route.entity}
            initialTab={route.tab}
            initialField={route.field}
            entitiesLoad={entitiesLoad}
        />
    );
}
