import FinancialsPublicationWorkspace from "@/components/adminV2/settings/financials/FinancialsPublicationWorkspace";
import { normalizeFinancialsWorkspaceChapter } from "@/lib/commercial/commercialChapterRoutes";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{
        chapter?: string | string[];
    }>;
};

/**
 * Canonical Organization Financials — `/organization/financials`.
 *
 * Landing: bare path (no chapter).
 * Section: `?chapter=tuition|catalog|policies|accounting|simulator|funding`
 * (canonical query form — Continuity / history-correct; path `/financials/tuition` not used in Slice 1).
 *
 * Does not default into Tuition.
 */
export default async function OrganizationFinancialsPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const rawChapter = Array.isArray(resolved.chapter) ? resolved.chapter[0] : resolved.chapter;
    const normalized = normalizeFinancialsWorkspaceChapter(rawChapter);
    const initialChapter =
        normalized && normalized !== "programs" ? normalized : null;

    return <FinancialsPublicationWorkspace initialChapter={initialChapter} />;
}
