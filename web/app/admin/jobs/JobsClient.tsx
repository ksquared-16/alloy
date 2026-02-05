"use client";

import { useState } from "react";
import DataTable from "@/components/admin/DataTable";
import Drawer from "@/components/admin/Drawer";
import RelatedRecordsTabs from "@/components/admin/RelatedRecordsTabs";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";

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
}

interface JobsClientProps {
    initialData: Job[];
    error?: string;
}

export default function JobsClient({
    initialData,
    error,
}: JobsClientProps) {
    const [selectedRow, setSelectedRow] = useState<Job | null>(null);
    const { openDrawer } = useAdminDrawer();

    const columns = [
        { key: "created_at", label: "Created", sortable: true },
        { key: "title", label: "Title", sortable: true },
        {
            key: "is_recurring",
            label: "Recurring",
            sortable: true,
            render: (value: boolean | null) => (value ? "Yes" : "No"),
        },
        { key: "scheduled_at", label: "Scheduled", sortable: true },
        { key: "job_status_id", label: "Status ID", sortable: false },
        {
            key: "gross_price_cents",
            label: "Gross Price",
            sortable: true,
            render: (value: number | null) =>
                value ? `$${(value / 100).toFixed(2)}` : "-",
        },
        {
            key: "contractor_payout_cents",
            label: "Payout",
            sortable: true,
            render: (value: number | null) =>
                value ? `$${(value / 100).toFixed(2)}` : "-",
        },
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
                data={initialData}
                columns={columns}
                filters={filters}
                onRowClick={setSelectedRow}
            />

            <Drawer
                isOpen={!!selectedRow}
                onClose={() => setSelectedRow(null)}
                title={`Job: ${selectedRow?.title || selectedRow?.id}`}
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
                            <strong className="text-alloy-midnight/70">Title:</strong>{" "}
                            {selectedRow.title || "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Recurring:</strong>{" "}
                            {selectedRow.is_recurring ? "Yes" : "No"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Scheduled:</strong>{" "}
                            {selectedRow.scheduled_at
                                ? new Date(selectedRow.scheduled_at).toLocaleString()
                                : "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Status ID:</strong>{" "}
                            {selectedRow.job_status_id || "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Gross Price:</strong>{" "}
                            {selectedRow.gross_price_cents
                                ? `$${(selectedRow.gross_price_cents / 100).toFixed(2)}`
                                : "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Payout:</strong>{" "}
                            {selectedRow.contractor_payout_cents
                                ? `$${(selectedRow.contractor_payout_cents / 100).toFixed(2)}`
                                : "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Offer Code:</strong>{" "}
                            {selectedRow.offer_code || "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">Opportunity:</strong>{" "}
                            {selectedRow.opportunity_id ? (
                                <button type="button" onClick={() => openDrawer({ type: "opportunities", id: selectedRow.opportunity_id! })} className="text-alloy-blue hover:underline">
                                    {selectedRow.opportunity_id.slice(0, 8)}…
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
                            <strong className="text-alloy-midnight/70">Customer:</strong>{" "}
                            {selectedRow.customer_id ? (
                                <button type="button" onClick={() => openDrawer({ type: "customers", id: selectedRow.customer_id! })} className="text-alloy-blue hover:underline">
                                    {selectedRow.customer_id.slice(0, 8)}…
                                </button>
                            ) : "-"}
                        </div>
                        <div>
                            <strong className="text-alloy-midnight/70">External ID:</strong>{" "}
                            {selectedRow.external_id || "-"}
                        </div>
                        <RelatedRecordsTabs entityType="job" entityId={selectedRow.id} />
                    </div>
                )}
            </Drawer>
        </div>
    );
}

