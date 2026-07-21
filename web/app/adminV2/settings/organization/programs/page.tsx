import { redirect } from "next/navigation";
import ProgramsPublicationWorkspace from "@/components/adminV2/settings/programs/ProgramsPublicationWorkspace";
import { organizationFinancialsChapterHref, normalizeFinancialsWorkspaceChapter } from "@/lib/commercial/commercialChapterRoutes";
import { normalizeProgramConfigurationSection } from "@/lib/programs/programConfigurationSections";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{
        programId?: string | string[];
        section?: string | string[];
        chapter?: string | string[];
    }>;
};

/**
 * Canonical Organization Programs surface — served at `/organization/programs`.
 * Former Commercial tool chapters redirect to `/organization/financials`.
 */
export default async function OrganizationProgramsPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const raw = resolved.programId;
    const initialProgramId = Array.isArray(raw) ? raw[0] ?? null : raw?.trim() || null;
    const rawSection = Array.isArray(resolved.section) ? resolved.section[0] : resolved.section;
    const initialSection = normalizeProgramConfigurationSection(rawSection);
    const rawChapter = Array.isArray(resolved.chapter) ? resolved.chapter[0] : resolved.chapter;
    const normalizedChapter = normalizeFinancialsWorkspaceChapter(rawChapter);
    if (normalizedChapter && normalizedChapter !== "programs") {
        redirect(organizationFinancialsChapterHref(normalizedChapter));
    }
    return (
        <ProgramsPublicationWorkspace
            initialProgramId={initialProgramId}
            initialSection={initialSection}
            initialChapter={null}
        />
    );
}
