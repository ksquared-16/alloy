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
    canceled_at?: string | null;
    _job_title?: string | null;
    _customer_name?: string | null;
    _contact_phone?: string | null;
    _contact_email?: string | null;
    _vertical_name?: string | null;
    _assignment_status?: string | null;
    _vendor_name?: string | null;
    _vendor_source?: "schedule" | "job" | null;
    [key: string]: unknown;
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
        { key: "start_at", label: "Start", sortable: true, render: (_: unknown, row: ScheduleRow) => formatDateTime(row.start_at) },
        { key: "end_at", label: "End", sortable: true, render: (_: unknown, row: ScheduleRow) => formatDateTime(row.end_at) },
        { key: "_job_title", label: "Job", sortable: true, render: (_: unknown, row: ScheduleRow) => row._job_title ?? (row.job_id ? `${String(row.job_id).slice(0, 8)}…` : "—") },
        { key: "_customer_name", label: "Customer", sortable: true, render: (_: unknown, row: ScheduleRow) => row._customer_name ?? "—" },
        { key: "_contact_phone", label: "Contact", sortable: false, render: (_: unknown, row: ScheduleRow) => row._contact_phone ?? row._contact_email ?? "—" },
        { key: "_vertical_name", label: "Vertical", sortable: true, render: (_: unknown, row: ScheduleRow) => row._vertical_name ?? "—" },
        { key: "_assignment_status", label: "Assignment", sortable: true, render: (_: unknown, row: ScheduleRow) => row._assignment_status ?? "—" },
        { key: "_vendor_name", label: "Vendor", sortable: true, render: (_: unknown, row: ScheduleRow) => (row._vendor_source === "job" && row._vendor_name ? `Default set (job): ${row._vendor_name}` : row._vendor_name ?? "—") },
        { key: "canceled_at", label: "Canceled", sortable: false, render: (_: unknown, row: ScheduleRow) => row.canceled_at ? "Yes" : "—" },
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
