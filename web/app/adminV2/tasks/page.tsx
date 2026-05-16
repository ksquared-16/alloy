export const dynamic = "force-dynamic";

import AdminV2TasksClient from "@/app/adminV2/tasks/AdminV2TasksClient";

export default function AdminV2TasksPage() {
    return (
        <div className="w-full max-w-3xl pb-8">
            <AdminV2TasksClient />
        </div>
    );
}
