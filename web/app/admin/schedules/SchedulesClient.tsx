"use client";

import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { formatDateTime } from "@/lib/adminFormatters";

export interface ScheduleRow {
    id: string;
    job_id: string;
    start_at: string;
    end_at: string;
    timezone: string | null;
}

interface SchedulesClientProps {
    initialData: ScheduleRow[];
    error?: string;
}

export default function SchedulesClient({
    initialData,
    error,
}: SchedulesClientProps) {
    const { openDrawer } = useAdminDrawer();

    const columns = [
        { key: "id", label: "ID", sortable: false, render: (v: string) => (v ? `${v.slice(0, 8)}…` : "-") },
        { key: "job_id", label: "Job ID", sortable: false, render: (v: string) => (v ? `${v.slice(0, 8)}…` : "-") },
        { key: "start_at", label: "Start", sortable: true, render: (v: string) => formatDateTime(v) },
        { key: "end_at", label: "End", sortable: true, render: (v: string) => formatDateTime(v) },
        { key: "timezone", label: "Timezone", sortable: true },
    ];

    return (
        <div>
            <h1 className="text-3xl font-bold text-alloy-midnight mb-6">Schedules</h1>
            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                    Error: {error}
                </div>
            )}
            <DataTable
                data={initialData}
                columns={columns}
                onRowClick={(row) => openDrawer({ type: "schedules", id: row.id })}
            />
        </div>
    );
}
