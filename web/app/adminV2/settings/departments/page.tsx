import DepartmentsClient from "@/app/legacy-admin/system/departments/DepartmentsClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsDepartmentsPage() {
    return (
        <div className="w-full min-w-0">
            <DepartmentsClient adminV2Chrome />
        </div>
    );
}
