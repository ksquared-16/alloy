import KioskDevicesConfigurationPage from "@/components/adminV2/settings/attendance/KioskDevicesConfigurationPage";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsAttendanceDevicesPage() {
    return (
        <div className="w-full min-w-0">
            <KioskDevicesConfigurationPage />
        </div>
    );
}
