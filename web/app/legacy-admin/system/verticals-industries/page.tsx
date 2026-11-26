import VerticalsIndustriesClient from "./VerticalsIndustriesClient";
import SettingsDiagnosticSurfaceBanner from "@/components/adminV2/settings/configurationRuntime/SettingsDiagnosticSurfaceBanner";

export const dynamic = "force-dynamic";

/** Diagnostic industry catalog — no primary Platform Configuration equivalent yet. */
export default function VerticalsIndustriesPage() {
    return (
        <div className="space-y-4" data-testid="legacy-verticals-industries-page">
            <SettingsDiagnosticSurfaceBanner
                note="Legacy industry and vertical catalog tooling. Entity labels and field defaults are configured under Platform Configuration."
                destinationHref="/settings/entities"
                destinationLabel="Entities"
            />
            <VerticalsIndustriesClient />
        </div>
    );
}
