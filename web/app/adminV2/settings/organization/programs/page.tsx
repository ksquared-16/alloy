import ProgramsPublicationWorkspace from "@/components/adminV2/settings/programs/ProgramsPublicationWorkspace";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{ programId?: string | string[] }>;
};

/** Canonical Organization Programs surface — served at `/organization/programs`. */
export default async function OrganizationProgramsPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const raw = resolved.programId;
    const initialProgramId = Array.isArray(raw) ? raw[0] ?? null : raw?.trim() || null;
    return <ProgramsPublicationWorkspace initialProgramId={initialProgramId} />;
}
