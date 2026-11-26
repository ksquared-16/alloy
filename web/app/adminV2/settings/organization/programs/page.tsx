import { redirect } from "next/navigation";
import ProgramsConfigurationPage from "@/components/adminV2/settings/programs/ProgramsConfigurationPage";
import { organizationFinancialsChapterHref, normalizeFinancialsWorkspaceChapter } from "@/lib/commercial/commercialChapterRoutes";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{
        programId?: string | string[];
        section?: string | string[];
        chapter?: string | string[];
        status?: string | string[];
        sort?: string | string[];
        direction?: string | string[];
    }>;
};

function firstParam(value: string | string[] | undefined): string | null {
    if (Array.isArray(value)) return value[0]?.trim() || null;
    return value?.trim() || null;
}

/**
 * Canonical Organization Programs surface — served at `/organization/programs`.
 * Former Commercial tool chapters redirect to `/organization/financials`.
 * Selection is `?programId=`; filter/sort via `status`, `sort`, `direction`.
 */
export default async function OrganizationProgramsPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const initialProgramId = firstParam(resolved.programId);
    const initialStatus = firstParam(resolved.status);
    const initialSort = firstParam(resolved.sort);
    const initialDirection = firstParam(resolved.direction);
    const rawChapter = Array.isArray(resolved.chapter) ? resolved.chapter[0] : resolved.chapter;
    const normalizedChapter = normalizeFinancialsWorkspaceChapter(rawChapter);
    if (normalizedChapter && normalizedChapter !== "programs") {
        redirect(organizationFinancialsChapterHref(normalizedChapter));
    }
    return (
        <ProgramsConfigurationPage
            initialProgramId={initialProgramId}
            initialStatus={initialStatus}
            initialSort={initialSort}
            initialDirection={initialDirection}
        />
    );
}
