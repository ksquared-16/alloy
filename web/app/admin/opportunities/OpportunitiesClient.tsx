"use client";

import { useState } from "react";
import DataTable from "@/components/admin/DataTable";
import Drawer from "@/components/admin/Drawer";

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

    const columns = [
        { key: "created_at", label: "Created", sortable: true },
        { key: "name", label: "Name", sortable: true },
        { key: "status", label: "Status", sortable: true },
        { key: "job_date", label: "Job Date", sortable: true },
        { key: "job_time_window", label: "Time Window", sortable: false },
        {
            key: "quote_total",
            label: "Quote Total",
            sortable: true,
            render: (value: number | null) =>
                value ? `$${(value / 100).toFixed(2)}` : "-",
        },
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
                data={initialData}
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
                            {new Date(selectedRow.created_at).toLocaleString()}
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
                            {selectedRow.job_date || "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Time Window:</strong>{" "}
                            {selectedRow.job_time_window || "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Quote Total:</strong>{" "}
                            {selectedRow.quote_total
                                ? `$${(selectedRow.quote_total / 100).toFixed(2)}`
                                : "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Customer ID:</strong>{" "}
                            {selectedRow.customer_id || "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Contact ID:</strong>{" "}
                            {selectedRow.primary_contact_id || "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">External ID:</strong>{" "}
                            {selectedRow.external_id || "-"}
                        </div>
                    </div>
                )}
            </Drawer>
        </div>
    );
}

