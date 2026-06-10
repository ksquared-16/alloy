import WorkUnitsClient from "@/app/legacy-admin/system/work-units/WorkUnitsClient";
import WorkUnitsLifecycleCrossLink from "@/components/adminV2/settings/WorkUnitsLifecycleCrossLink";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsWorkUnitsPage() {
    return (
        <div className="w-full min-w-0 space-y-4" data-testid="settings-work-units-page">
            <WorkUnitsLifecycleCrossLink />
            <WorkUnitsClient adminV2Chrome />
        </div>
    );
}
