import ProcessesConfigurationPage from "@/components/adminV2/settings/businessProcess/ProcessesConfigurationPage";
import { normalizeBusinessProcessSection } from "@/lib/lifecycle/businessProcessUiLabels";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{ section?: string | string[]; processId?: string | string[] }>;
};

/** Canonical Organization Business Processes — `/organization/processes`. */
export default async function OrganizationProcessesPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const rawSection = Array.isArray(resolved.section) ? resolved.section[0] : resolved.section;
    const rawProcessId = Array.isArray(resolved.processId) ? resolved.processId[0] : resolved.processId;

    const initialSection = normalizeBusinessProcessSection(rawSection);
    const initialProcessId =
        typeof rawProcessId === "string" && rawProcessId.trim() ? rawProcessId.trim() : undefined;

    return <ProcessesConfigurationPage initialSection={initialSection} initialProcessId={initialProcessId} />;
}
