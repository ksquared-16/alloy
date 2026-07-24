import DataModelWorkspaceSurface from "@/components/adminV2/settings/dataModel/DataModelWorkspaceSurface";
import { resolveDataModelEntityRoute } from "@/lib/dataModel/dataModelChapterRoutes";
import { loadDataModelEntitiesWorkspaceVm } from "@/lib/dataModel/loadDataModelEntitiesWorkspaceVm";

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
 */
export default async function OrganizationDataModelPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const route = resolveDataModelEntityRoute({
        section: firstOf(resolved.section),
        entity: firstOf(resolved.entity),
        tab: firstOf(resolved.tab),
        field: firstOf(resolved.field),
    });

    // The Entity workspace is the primary experience, so its VM composes on every
    // request — collection, selected identity, fields, statuses, and option sets
    // all arrive with the initial payload. Operational Calculations is the one
    // deferred compat pane and does not need it.
    const entitiesLoad = route.mode === "entity" ? await loadDataModelEntitiesWorkspaceVm() : undefined;

    return (
        <DataModelWorkspaceSurface
            mode={route.mode}
            initialEntity={route.mode === "entity" ? route.entity : undefined}
            initialTab={route.mode === "entity" ? route.tab : undefined}
            initialField={route.mode === "entity" ? route.field : undefined}
            entitiesLoad={entitiesLoad}
        />
    );
}
