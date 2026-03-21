"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import DataTable from "@/components/admin/DataTable";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { formatDateTime, formatDate } from "@/lib/adminFormatters";

interface SubscriptionRow {
    id: string;
    created_at: string;
    customer_id: string;
    status: string;
    status_key?: string | null;
    _status_display?: string | null;
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
    const router = useRouter();
    const { openDrawer } = useAdminDrawer();
    const { labels } = useEntityLabels();
    const title = labels?.subscriptions?.plural ?? "Subscriptions";

    useEffect(() => {
        const onSaved = (ev: Event) => {
            const d = (ev as CustomEvent<{ type?: string }>).detail;
            if (d?.type === "subscriptions") router.refresh();
        };
        window.addEventListener("admin-entity-saved", onSaved);
        return () => window.removeEventListener("admin-entity-saved", onSaved);
    }, [router]);

    const columns = [
        {
            key: "_status_display",
            label: "Status",
            sortable: true,
            render: (_: unknown, row: SubscriptionRow) => {
                const sk = row.status_key ?? null;
                const label = row._status_display ?? sk ?? "—";
                return <StatusBadge label={label} variant={getStatusVariant(sk)} />;
            },
        },
        { key: "created_at", label: "Created", sortable: true, render: (_: unknown, row: SubscriptionRow) => formatDateTime(row.created_at) },
        { key: "_customer_name", label: "Customer", sortable: true, render: (_: unknown, row: SubscriptionRow) => row._customer_name ?? "—" },
        { key: "_frequency_label", label: "Frequency", sortable: true },
        { key: "_last_occurrence", label: "Last occurrence", sortable: false, render: (_: unknown, row: SubscriptionRow) => row._last_occurrence ? formatDate(row._last_occurrence) : "—" },
        { key: "_next_preview", label: "Next (preview)", sortable: false, render: (_: unknown, row: SubscriptionRow) => row._next_preview ?? "—" },
    ];

    return (
        <div>
            <h1 className="text-3xl font-bold text-alloy-midnight mb-6">{title}</h1>
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
