import { redirect } from "next/navigation";
import ProgramsConfigurationPage from "@/components/adminV2/settings/programs/ProgramsConfigurationPage";
import { organizationFinancialsChapterHref, normalizeFinancialsWorkspaceChapter } from "@/lib/commercial/commercialChapterRoutes";

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
 * Selection is `?programId=` only; legacy `section` is ignored (client normalizes URL).
 */
export default async function OrganizationProgramsPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const raw = resolved.programId;
    const initialProgramId = Array.isArray(raw) ? raw[0] ?? null : raw?.trim() || null;
    const rawChapter = Array.isArray(resolved.chapter) ? resolved.chapter[0] : resolved.chapter;
    const normalizedChapter = normalizeFinancialsWorkspaceChapter(rawChapter);
    if (normalizedChapter && normalizedChapter !== "programs") {
        redirect(organizationFinancialsChapterHref(normalizedChapter));
    }
    return <ProgramsConfigurationPage initialProgramId={initialProgramId} />;
}
