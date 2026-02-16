"use client";

import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { formatDateTime, formatDate } from "@/lib/adminFormatters";

interface SubscriptionRow {
    id: string;
    created_at: string;
    customer_id: string;
    status: string;
    cadence?: string;
    interval?: number;
    start_date: string | null;
    _frequency_label: string;
    _customer_name: string | null;
    _last_occurrence: string | null;
    _next_preview: string | null;
}

interface SubscriptionsClientProps {
    initialData: SubscriptionRow[];
    error?: string;
}

export default function SubscriptionsClient({
    initialData,
    error,
}: SubscriptionsClientProps) {
    const { openDrawer } = useAdminDrawer();

    const columns = [
        { key: "created_at", label: "Created", sortable: true, render: (_: unknown, row: SubscriptionRow) => formatDateTime(row.created_at) },
        { key: "_customer_name", label: "Customer", sortable: true, render: (_: unknown, row: SubscriptionRow) => row._customer_name ?? "—" },
        { key: "_frequency_label", label: "Frequency", sortable: true },
        { key: "status", label: "Status", sortable: true },
        { key: "_last_occurrence", label: "Last occurrence", sortable: false, render: (_: unknown, row: SubscriptionRow) => row._last_occurrence ? formatDate(row._last_occurrence) : "—" },
        { key: "_next_preview", label: "Next (preview)", sortable: false, render: (_: unknown, row: SubscriptionRow) => row._next_preview ?? "—" },
    ];

    return (
        <div>
            <h1 className="text-3xl font-bold text-alloy-midnight mb-6">Subscriptions</h1>
            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                    Error: {error}
                </div>
            )}
            <DataTable
                data={initialData}
                columns={columns}
                onRowClick={(row) => openDrawer({ type: "subscriptions", id: row.id })}
            />
        </div>
    );
}
