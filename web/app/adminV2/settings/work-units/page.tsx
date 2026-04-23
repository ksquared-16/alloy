import WorkUnitsClient from "@/app/admin/system/work-units/WorkUnitsClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsWorkUnitsPage() {
    return (
        <div className="w-full max-w-6xl">
            <WorkUnitsClient adminV2Chrome />
        </div>
    );
}
