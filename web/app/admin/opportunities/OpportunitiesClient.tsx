"use client";

import { useMemo } from "react";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAdminVertical } from "@/contexts/AdminVerticalContext";
import { formatDate, formatDateTime, formatMoneyFromDollars } from "@/lib/adminFormatters";

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
    const data = useMemo(() => {
        if (!selectedVerticalId) return initialData;
        return initialData.filter((r) => r.vertical_id === selectedVerticalId);
    }, [initialData, selectedVerticalId]);

    const stageById = useMemo(() => {
        const m: Record<string, string> = {};
        stages.forEach((s) => { m[s.id] = s.name; });
        return m;
    }, [stages]);

    const columns = [
        { key: "created_at", label: "Created", sortable: true, render: (v: string) => formatDateTime(v) },
        { key: "name", label: "Name", sortable: true },
        { key: "status", label: "Status", sortable: true },
        { key: "pipeline_stage_id", label: "Stage", sortable: false, render: (v: string | null) => (v && stageById[v]) || "-" },
        { key: "job_date", label: "Job Date", sortable: true, render: (v: string) => formatDate(v) },
        { key: "job_time_window", label: "Time Window", sortable: false },
        { key: "quote_total", label: "Quote Total", sortable: true, render: (v: number | null) => formatMoneyFromDollars(v) },
        { key: "customer_id", label: "Customer ID", sortable: false },
        { key: "primary_contact_id", label: "Contact ID", sortable: false },
        { key: "external_id", label: "External ID", sortable: false },
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

    return (
        <div>
            <h1 className="text-3xl font-bold text-alloy-midnight mb-6">
                Opportunities
            </h1>

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

