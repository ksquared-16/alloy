import DbRelationshipsClient from "./DbRelationshipsClient";
import SettingsDiagnosticSurfaceBanner from "@/components/adminV2/settings/configurationRuntime/SettingsDiagnosticSurfaceBanner";

export const dynamic = "force-dynamic";

/** Diagnostic live-row inspector — retained until Relationships viewer ships. */
export default function AdminSystemDbRelationshipsPage() {
    return (
        <div className="space-y-4" data-testid="legacy-db-relationships-page">
            <SettingsDiagnosticSurfaceBanner
                note="Engineering diagnostic for live customer_persons and person_relationships rows. Operator vocabulary is configured under Relationships."
                destinationHref="/settings/relationships"
                destinationLabel="Relationships"
            />
            <DbRelationshipsClient />
        </div>
    );
}
