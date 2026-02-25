"use client";

import { useMemo } from "react";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAdminVertical } from "@/contexts/AdminVerticalContext";
import { formatDate, formatDateTime, formatMoneyFromDollars } from "@/lib/adminFormatters";
import { StatusBadge } from "@/components/admin/StatusBadge";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";

interface Opportunity {
    id: string;
    created_at: string;
    name: string | null;
    status: string | null;
    job_date: string | null;
    job_time_window: string | null;
    quote_total: number | null;
    customer_id: string | null;
    primary_contact_id: string | null;
    external_id: string | null;
    vertical_id: string | null;
    pipeline_stage_id?: string | null;
    _customer_name?: string | null;
    _contact_name?: string | null;
    _contact_email?: string | null;
    _contact_phone?: string | null;
    _stage_name?: string | null;
}

interface Stage {
    id: string;
    name: string;
    pipeline_id: string;
}

interface OpportunitiesClientProps {
    initialData: Opportunity[];
    stages?: Stage[];
    error?: string;
}

export default function OpportunitiesClient({
    initialData,
    stages = [],
    error,
}: OpportunitiesClientProps) {
    const { openDrawer } = useAdminDrawer();
    const { selectedVerticalId } = useAdminVertical();
    const { labels } = useEntityLabels();
    const title = labels?.opportunities?.plural ?? "Opportunities";
    const data = useMemo(() => {
        if (!selectedVerticalId) return initialData;
        return initialData.filter((r) => r.vertical_id === selectedVerticalId);
    }, [initialData, selectedVerticalId]);

    const columns = [
        { key: "created_at", label: "Created", sortable: true, render: (v: string) => formatDateTime(v) },
        { key: "name", label: "Name", sortable: true },
        { key: "status", label: "Status", sortable: true, render: (_: unknown, row: Opportunity) => <StatusBadge label={row.status} variant={row.status === "closed" ? "success" : "default"} /> },
        { key: "_stage_name", label: "Stage", sortable: false, render: (_: unknown, row: Opportunity) => <StatusBadge label={row._stage_name} /> },
        { key: "job_date", label: "Job Date", sortable: true, render: (v: string | null) => (v ? formatDate(v) : "—") },
        { key: "job_time_window", label: "Time Window", sortable: false },
        { key: "quote_total", label: "Quote Total", sortable: true, render: (v: number | null) => formatMoneyFromDollars(v) },
        { key: "_customer_name", label: "Customer", sortable: false, render: (_: unknown, row: Opportunity) => row._customer_name ?? "—" },
        { key: "_contact_name", label: "Contact", sortable: false, render: (_: unknown, row: Opportunity) => row._contact_name ?? row._contact_email ?? row._contact_phone ?? "—" },
    ];

    const filters = [
        {
            key: "status",
            label: "Status",
            type: "select" as const,
            options: [
                { value: "open", label: "Open" },
                { value: "new", label: "New" },
                { value: "lead", label: "Lead" },
                { value: "closed", label: "Closed" },
            ],
        },
    ];

    const total = data.length;
    const booked = data.filter((r) => (r.status ?? "").toLowerCase() === "closed" || (r._stage_name ?? "").toLowerCase().includes("book")).length;
    const notBooked = total - booked;

    return (
        <div>
            <AdminPageHeader title={title} subtitle="Pipeline and booking status." />
            <div className="mb-6 flex flex-wrap gap-4">
                <div className="bg-white border border-alloy-stone/30 rounded-lg px-4 py-3 min-w-[100px]">
                    <div className="text-2xl font-semibold text-alloy-midnight">{total}</div>
                    <div className="text-xs text-alloy-midnight/60">Total</div>
                </div>
                <div className="bg-white border border-alloy-stone/30 rounded-lg px-4 py-3 min-w-[100px]">
                    <div className="text-2xl font-semibold text-alloy-midnight">{booked}</div>
                    <div className="text-xs text-alloy-midnight/60">Booked</div>
                </div>
                <div className="bg-white border border-alloy-stone/30 rounded-lg px-4 py-3 min-w-[100px]">
                    <div className="text-2xl font-semibold text-alloy-midnight">{notBooked}</div>
                    <div className="text-xs text-alloy-midnight/60">Not booked</div>
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
                onRowClick={(row) => openDrawer({ type: "opportunities", id: row.id })}
            />
        </div>
    );
}

