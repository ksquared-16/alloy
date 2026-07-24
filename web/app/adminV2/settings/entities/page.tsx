import { redirect } from "next/navigation";
import {
    DATA_MODEL_DEFAULT_SECTION,
    dataModelSectionHref,
    normalizeDataModelWorkspaceSection,
} from "@/lib/dataModel/dataModelChapterRoutes";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{ section?: string | string[]; entity?: string | string[]; tab?: string | string[] }>;
};

/**
 * Compatibility: `/settings/entities` → `/organization/data-model`.
 * `?section=entities` (legacy) and bare path both land in the Data Model shell.
 */
export default async function AdminV2SettingsEntitiesPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const raw = Array.isArray(resolved.section) ? resolved.section[0] : resolved.section;
    const section =
        normalizeDataModelWorkspaceSection(typeof raw === "string" ? raw : "") ??
        DATA_MODEL_DEFAULT_SECTION;
    const entity = Array.isArray(resolved.entity) ? resolved.entity[0] : resolved.entity;
    const tab = Array.isArray(resolved.tab) ? resolved.tab[0] : resolved.tab;
    redirect(
        dataModelSectionHref(section, {
            entity: typeof entity === "string" ? entity : null,
            tab: typeof tab === "string" ? tab : null,
        }),
    );
}
