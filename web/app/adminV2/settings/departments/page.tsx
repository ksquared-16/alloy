import DepartmentsClient from "@/app/admin/system/departments/DepartmentsClient";

export const dynamic = "force-dynamic";

export default function AdminV2SettingsDepartmentsPage() {
    return (
        <div className="w-full max-w-6xl">
            <DepartmentsClient adminV2Chrome />
        </div>
    );
}
