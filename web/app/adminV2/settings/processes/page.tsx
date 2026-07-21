import { Workflow } from "lucide-react";
import ProcessesConfigurationPage from "@/components/adminV2/settings/businessProcess/ProcessesConfigurationPage";
import OrganizationDomainLanding from "@/components/adminV2/settings/organization/OrganizationDomainLanding";
import { buildBusinessProcessesLandingModel } from "@/lib/configRuntime/businessProcessesLandingModel";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{ section?: string | string[] }>;
};

const PROCESS_SECTIONS = new Set(["stages", "work-views", "actions", "automation", "health"]);

export default async function AdminV2SettingsProcessesPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const raw = Array.isArray(resolved.section) ? resolved.section[0] : resolved.section;
    const section = typeof raw === "string" ? raw.trim().toLowerCase() : "";

    if (PROCESS_SECTIONS.has(section)) {
        return <ProcessesConfigurationPage initialSection={section} />;
    }

    return (
        <OrganizationDomainLanding
            model={buildBusinessProcessesLandingModel()}
            icon={Workflow}
            testIdPrefix="business-processes"
        />
    );
}
