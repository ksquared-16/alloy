import WorkUnitsClient from "@/app/legacy-admin/system/work-units/WorkUnitsClient";
import SettingsDiagnosticSurfaceBanner from "@/components/adminV2/settings/configurationRuntime/SettingsDiagnosticSurfaceBanner";
import WorkUnitsLifecycleCrossLink from "@/components/adminV2/settings/WorkUnitsLifecycleCrossLink";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsWorkUnitsPage() {
    return (
        <div className="w-full min-w-0 space-y-4" data-testid="settings-work-units-page">
            <SettingsDiagnosticSurfaceBanner
                note="Advanced queue lane configuration for operators and engineers. Process stages and work views are configured under Processes."
                destinationHref="/settings/processes"
                destinationLabel="Processes"
            />
            <WorkUnitsLifecycleCrossLink />
            <WorkUnitsClient adminV2Chrome />
        </div>
    );
}
