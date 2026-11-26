import IntegrationsClient from "./IntegrationsClient";

export const dynamic = "force-dynamic";

export default function OrganizationIntegrationsPage() {
    return (
        <div className="w-full min-w-0">
            <IntegrationsClient />
        </div>
    );
}
