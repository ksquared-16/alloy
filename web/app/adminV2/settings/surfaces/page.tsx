import { LayoutTemplate } from "lucide-react";
import SurfacesConfigurationPage from "@/components/adminV2/settings/surfaces/SurfacesConfigurationPage";
import OrganizationDomainLanding from "@/components/adminV2/settings/organization/OrganizationDomainLanding";
import { buildSurfacesLandingModel } from "@/lib/configRuntime/surfacesLandingModel";
import type { SurfaceConfigSectionKey } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{
        section?: string | string[];
        editor?: string | string[];
        layout?: string | string[];
    }>;
};

const SURFACE_SECTIONS = new Set<string>([
    "focus-panels",
    "queue-rows",
    "workspaces",
    "work-units",
    "operational-intelligence",
]);

function asSurfaceSection(value: string): SurfaceConfigSectionKey | null {
    return SURFACE_SECTIONS.has(value) ? (value as SurfaceConfigSectionKey) : null;
}

export default async function AdminV2SettingsSurfacesPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const rawSection = Array.isArray(resolved.section) ? resolved.section[0] : resolved.section;
    const sectionRaw = typeof rawSection === "string" ? rawSection.trim().toLowerCase() : "";
    const section = asSurfaceSection(sectionRaw);
    const hasEditor =
        Boolean(Array.isArray(resolved.editor) ? resolved.editor[0] : resolved.editor)
        || Boolean(Array.isArray(resolved.layout) ? resolved.layout[0] : resolved.layout);

    if (section || hasEditor) {
        return <SurfacesConfigurationPage initialSection={section ?? undefined} />;
    }

    return (
        <OrganizationDomainLanding
            model={buildSurfacesLandingModel()}
            icon={LayoutTemplate}
            testIdPrefix="surfaces"
        />
    );
}
