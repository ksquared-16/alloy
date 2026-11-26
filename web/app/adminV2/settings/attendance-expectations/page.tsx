import AttendanceExpectationsGuidePage from "@/components/adminV2/settings/attendance/AttendanceExpectationsGuidePage";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsAttendanceExpectationsPage() {
    return (
        <div className="w-full min-w-0">
            <AttendanceExpectationsGuidePage />
        </div>
    );
}
