import AttendanceIntegrationsConfigurationPage from "@/components/adminV2/settings/attendance/AttendanceIntegrationsConfigurationPage";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsAttendanceIntegrationsPage() {
    return (
        <div className="w-full min-w-0">
            <AttendanceIntegrationsConfigurationPage />
        </div>
    );
}
