import ProcessesConfigurationPage from "@/components/adminV2/settings/businessProcess/ProcessesConfigurationPage";
import { normalizeBusinessProcessSection } from "@/lib/lifecycle/businessProcessUiLabels";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{ section?: string | string[]; processId?: string | string[] }>;
};

/**
 * Business Processes settings entry point.
 * Always mounts the Collection → Selected Process → Focused Workspace surface
 * (`ProcessesConfigurationPage`) — the org-landing tile page is no longer the default.
 * `?section=` and `?processId=` support deep links into a specific process/tab.
 */
export default async function AdminV2SettingsProcessesPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const rawSection = Array.isArray(resolved.section) ? resolved.section[0] : resolved.section;
    const rawProcessId = Array.isArray(resolved.processId) ? resolved.processId[0] : resolved.processId;

    const initialSection = normalizeBusinessProcessSection(rawSection);
    const initialProcessId = typeof rawProcessId === "string" && rawProcessId.trim() ? rawProcessId.trim() : undefined;

    return <ProcessesConfigurationPage initialSection={initialSection} initialProcessId={initialProcessId} />;
}
