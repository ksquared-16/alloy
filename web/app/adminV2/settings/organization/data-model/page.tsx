import DataModelWorkspaceSurface from "@/components/adminV2/settings/dataModel/DataModelWorkspaceSurface";
import {
    DATA_MODEL_DEFAULT_SECTION,
    normalizeDataModelWorkspaceSection,
} from "@/lib/dataModel/dataModelChapterRoutes";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{
        section?: string | string[];
        entity?: string | string[];
        tab?: string | string[];
    }>;
};

function firstOf(value: string | string[] | undefined): string | undefined {
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === "string" ? raw.trim() : undefined;
}

/**
 * Canonical Organization Data Model — `/organization/data-model`.
 *
 * Immediate Category → Collection → Selected workspace (no conceptual landing cards).
 * Default category is Entities.
 */
export default async function OrganizationDataModelPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const section =
        normalizeDataModelWorkspaceSection(firstOf(resolved.section)) ?? DATA_MODEL_DEFAULT_SECTION;
    const entity = firstOf(resolved.entity);
    const tab = firstOf(resolved.tab);

    return (
        <DataModelWorkspaceSurface
            section={section}
            initialEntity={entity}
            initialTab={tab}
        />
    );
}
