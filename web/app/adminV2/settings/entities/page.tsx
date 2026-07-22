import EntitiesConfigurationPage from "@/components/adminV2/settings/entities/EntitiesConfigurationPage";
import OrganizationDomainLanding from "@/components/adminV2/settings/organization/OrganizationDomainLanding";
import { buildDataModelLandingModel } from "@/lib/configRuntime/dataModelLandingModel";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams?: Promise<{ section?: string | string[] }>;
};

/** Data Model Organization landing at bare `/settings/entities`; `?section=entities` opens the editor. */
export default async function AdminV2SettingsEntitiesPage({ searchParams }: PageProps) {
    const resolved = searchParams ? await searchParams : {};
    const raw = Array.isArray(resolved.section) ? resolved.section[0] : resolved.section;
    const section = typeof raw === "string" ? raw.trim().toLowerCase() : "";

    if (section === "entities") {
        return <EntitiesConfigurationPage />;
    }

    return (
        <OrganizationDomainLanding
            model={buildDataModelLandingModel()}
            icon="boxes"
            testIdPrefix="data-model"
        />
    );
}
