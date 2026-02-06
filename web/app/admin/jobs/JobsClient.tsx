"use client";

import { useMemo } from "react";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAdminVertical } from "@/contexts/AdminVerticalContext";
import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";

interface Job {
    id: string;
    created_at: string;
    title: string | null;
    is_recurring: boolean | null;
    scheduled_at: string | null;
    job_status_id: string | null;
    gross_price_cents: number | null;
    contractor_payout_cents: number | null;
    offer_code: string | null;
    external_id: string | null;
    opportunity_id: string | null;
    primary_contact_id: string | null;
    customer_id: string | null;
    vertical_id: string | null;
}

interface JobsClientProps {
    initialData: Job[];
    error?: string;
}

export default function JobsClient({
    initialData,
    error,
}: JobsClientProps) {
    const { openDrawer } = useAdminDrawer();
    const { selectedVerticalId } = useAdminVertical();
    const data = useMemo(() => {
        if (!selectedVerticalId) return initialData;
        return initialData.filter((r) => r.vertical_id === selectedVerticalId);
    }, [initialData, selectedVerticalId]);

    const columns = [
        { key: "created_at", label: "Created", sortable: true, render: (v: string) => formatDateTime(v) },
        { key: "title", label: "Title", sortable: true },
        { key: "is_recurring", label: "Recurring", sortable: true, render: (value: boolean | null) => (value ? "Yes" : "No") },
        { key: "scheduled_at", label: "Scheduled", sortable: true, render: (v: string) => formatDateTime(v) },
        { key: "job_status_id", label: "Status ID", sortable: false },
        { key: "gross_price_cents", label: "Gross Price", sortable: true, render: (v: number | null) => formatMoneyFromCents(v) },
        { key: "contractor_payout_cents", label: "Payout", sortable: true, render: (v: number | null) => formatMoneyFromCents(v) },
        { key: "offer_code", label: "Offer Code", sortable: false },
        { key: "external_id", label: "External ID", sortable: false },
    ];

    const filters = [
        {
            key: "is_recurring",
            label: "Recurring",
            type: "select" as const,
            options: [
                { value: "true", label: "Yes" },
                { value: "false", label: "No" },
            ],
        },
    ];

    return (
        <div>
            <h1 className="text-3xl font-bold text-alloy-midnight mb-6">Jobs</h1>

            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                    Error: {error}
                </div>
            )}

            <DataTable
                data={data}
                columns={columns}
                filters={filters}
                onRowClick={(row) => openDrawer({ type: "jobs", id: row.id })}
            />
        </div>
    );
}

