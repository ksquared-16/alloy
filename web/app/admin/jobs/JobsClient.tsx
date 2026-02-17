"use client";

import { useMemo } from "react";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAdminVertical } from "@/contexts/AdminVerticalContext";
import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";
import { StatusBadge } from "@/components/admin/StatusBadge";
import AdminPageHeader from "@/components/admin/AdminPageHeader";

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
    _status_label?: string | null;
    _default_vendor_name?: string | null;
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
        { key: "is_recurring", label: "Recurring", sortable: true, render: (_: unknown, row: Job) => (row.is_recurring ? "Yes" : "No") },
        { key: "scheduled_at", label: "Scheduled", sortable: true, render: (v: string | null) => (v ? formatDateTime(v) : "—") },
        { key: "_status_label", label: "Status", sortable: false, render: (_: unknown, row: Job) => <StatusBadge label={row._status_label ?? row.job_status_id} /> },
        { key: "gross_price_cents", label: "Gross Price", sortable: true, render: (v: number | null) => formatMoneyFromCents(v) },
        { key: "contractor_payout_cents", label: "Payout", sortable: true, render: (v: number | null) => formatMoneyFromCents(v) },
        { key: "_default_vendor_name", label: "Default vendor", sortable: false, render: (_: unknown, row: Job) => row._default_vendor_name ?? "—" },
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

    const total = data.length;
    const withDefaultVendor = data.filter((r) => r._default_vendor_name).length;

    return (
        <div>
            <AdminPageHeader title="Jobs" subtitle="Manage jobs and default vendor assignments." />
            <div className="mb-6 flex flex-wrap gap-4">
                <div className="bg-white border border-alloy-stone/30 rounded-lg px-4 py-3 min-w-[120px]">
                    <div className="text-2xl font-semibold text-alloy-midnight">{total}</div>
                    <div className="text-xs text-alloy-midnight/60">Total</div>
                </div>
                <div className="bg-white border border-alloy-stone/30 rounded-lg px-4 py-3 min-w-[120px]">
                    <div className="text-2xl font-semibold text-alloy-midnight">{withDefaultVendor}</div>
                    <div className="text-xs text-alloy-midnight/60">With default vendor</div>
                </div>
            </div>

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

