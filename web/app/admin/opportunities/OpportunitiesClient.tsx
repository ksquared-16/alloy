"use client";

import { useMemo, useState } from "react";
import DataTable from "@/components/admin/DataTable";
import Drawer from "@/components/admin/Drawer";
import RelatedRecordsTabs from "@/components/admin/RelatedRecordsTabs";
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
}

interface OpportunitiesClientProps {
    initialData: Opportunity[];
    error?: string;
}

export default function OpportunitiesClient({
    initialData,
    error,
}: OpportunitiesClientProps) {
    const [selectedRow, setSelectedRow] = useState<Opportunity | null>(null);
    const { openDrawer } = useAdminDrawer();
    const { selectedVerticalId } = useAdminVertical();
    const data = useMemo(() => {
        if (!selectedVerticalId) return initialData;
        return initialData.filter((r) => r.vertical_id === selectedVerticalId);
    }, [initialData, selectedVerticalId]);

    const columns = [
        { key: "created_at", label: "Created", sortable: true, render: (v: string) => formatDateTime(v) },
        { key: "name", label: "Name", sortable: true },
        { key: "status", label: "Status", sortable: true },
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
                onRowClick={setSelectedRow}
            />

            <Drawer
                isOpen={!!selectedRow}
                onClose={() => setSelectedRow(null)}
                title={`Opportunity: ${selectedRow?.name || selectedRow?.id}`}
            >
                {selectedRow && (
                    <div className="space-y-4">
                        <div>
                            <strong className="text-alloy-midnight/70">ID:</strong>{" "}
                            {selectedRow.id}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Created:</strong>{" "}
                            {formatDateTime(selectedRow.created_at)}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Name:</strong>{" "}
                            {selectedRow.name || "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Status:</strong>{" "}
                            {selectedRow.status || "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Job Date:</strong>{" "}
                            {formatDate(selectedRow.job_date)}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Time Window:</strong>{" "}
                            {selectedRow.job_time_window || "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Quote Total:</strong>{" "}
                            {formatMoneyFromDollars(selectedRow.quote_total)}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Customer:</strong>{" "}
                            {selectedRow.customer_id ? (
                                <button type="button" onClick={() => openDrawer({ type: "customers", id: selectedRow.customer_id! })} className="text-alloy-blue hover:underline">
                                    {selectedRow.customer_id.slice(0, 8)}…
                                </button>
                            ) : "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Primary Contact:</strong>{" "}
                            {selectedRow.primary_contact_id ? (
                                <button type="button" onClick={() => openDrawer({ type: "contacts", id: selectedRow.primary_contact_id! })} className="text-alloy-blue hover:underline">
                                    {selectedRow.primary_contact_id.slice(0, 8)}…
                                </button>
                            ) : "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">External ID:</strong>{" "}
                            {selectedRow.external_id || "-"}
                        </div>
                        <RelatedRecordsTabs entityType="opportunity" entityId={selectedRow.id} />
                    </div>
                )}
            </Drawer>
        </div>
    );
}

