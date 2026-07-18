import ProgramsPublicationWorkspace from "@/components/adminV2/settings/programs/ProgramsPublicationWorkspace";
import type { ConfigurationDetailSection } from "@/lib/configPublication/runtimeModel";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{
        programId?: string | string[];
        section?: string | string[];
    }>;
};

const DETAIL_SECTIONS = new Set<ConfigurationDetailSection>([
    "overview",
    "draft",
    "assignment",
    "distribution",
    "history",
]);

/** Canonical Organization Programs surface — served at `/organization/programs`. */
export default async function OrganizationProgramsPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const raw = resolved.programId;
    const initialProgramId = Array.isArray(raw) ? raw[0] ?? null : raw?.trim() || null;
    const rawSection = Array.isArray(resolved.section) ? resolved.section[0] : resolved.section;
    const initialSection =
        rawSection && DETAIL_SECTIONS.has(rawSection as ConfigurationDetailSection)
            ? (rawSection as ConfigurationDetailSection)
            : "overview";
    return (
        <ProgramsPublicationWorkspace
            initialProgramId={initialProgramId}
            initialSection={initialSection}
        />
    );
}
