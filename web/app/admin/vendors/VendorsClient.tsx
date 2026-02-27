"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DataTable from "@/components/admin/DataTable";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { formatDateTime } from "@/lib/adminFormatters";

interface Vendor {
    id: string;
    created_at: string;
    submitted_at: string | null;
    name: string | null;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    vendor_status_id: string | null;
    status_key?: string | null;
    service_area_zip_codes: string[] | null;
    days_available: string[] | null;
    _vendor_status_key: string;
    _vendor_status_label: string;
}

type StatusOption = { status_key: string; status_label: string | null };

interface VendorsClientProps {
    initialData: Vendor[];
    error?: string;
}

function formatVendorDate(row: Vendor): string {
    const d = row.submitted_at ?? row.created_at;
    return d ? formatDateTime(d) : "-";
}

function formatServiceArea(zips: string[] | null): string {
    if (!zips || zips.length === 0) return "-";
    const count = zips.length;
    const first = zips.slice(0, 3).join(", ");
    return count <= 3 ? first : `${count} zips: ${first}…`;
}

function formatDaysAvailable(days: string[] | null): string {
    if (!days || days.length === 0) return "-";
    return days.join(", ");
}

export default function VendorsClient({
    initialData,
    error,
}: VendorsClientProps) {
    const { openDrawer } = useAdminDrawer();
    const { labels } = useEntityLabels();
    const searchParams = useSearchParams();
    const router = useRouter();
    const statusKeyParam = searchParams.get("status_key") ?? "";
    const title = labels?.vendors?.plural ?? "Vendors";

    const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
    useEffect(() => {
        fetch("/api/admin/status-definitions?entity_type=vendors")
            .then((r) => r.ok ? r.json() : { statuses: [] })
            .then((j: { statuses?: StatusOption[] }) => setStatusOptions((j.statuses ?? []).filter((s) => s.status_key)));
    }, []);

    const columns = [
        { key: "submitted_at", label: "Submitted", sortable: true, render: (_: unknown, row: Vendor) => formatVendorDate(row) },
        { key: "name", label: "Name", sortable: true },
        { key: "company_name", label: "Company", sortable: true, render: (_: unknown, row: Vendor) => row.company_name ?? "—" },
        { key: "email", label: "Email", sortable: true },
        { key: "phone", label: "Phone", sortable: true },
        { key: "_vendor_status_label", label: "Status", sortable: true, render: (_: unknown, row: Vendor) => row._vendor_status_label || row.vendor_status_id || "—" },
        { key: "service_area_zip_codes", label: "Service area", sortable: false, render: (v: string[] | null) => formatServiceArea(v) },
        { key: "days_available", label: "Days available", sortable: false, render: (v: string[] | null) => formatDaysAvailable(v) },
    ];

    const filters = [
        {
            key: "_vendor_status_key",
            label: "Status",
            type: "select" as const,
            options: [
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
                { value: "suspended", label: "Suspended" },
            ],
        },
    ];

    return (
        <div>
            <AdminPageHeader title={title} subtitle="Vendor status and assignments." />

            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                    Error: {error}
                </div>
            )}

            <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="text-sm text-[#45506c]">Status:</label>
                <select
                    value={statusKeyParam}
                    onChange={(e) => {
                        const v = e.target.value;
                        const next = new URLSearchParams(searchParams.toString());
                        if (v) next.set("status_key", v); else next.delete("status_key");
                        router.push(`/admin/vendors?${next.toString()}`);
                    }}
                    className="rounded-md border border-[#e6e8ec] px-3 py-1.5 text-sm"
                >
                    <option value="">All</option>
                    {statusOptions.map((s) => (
                        <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>
                    ))}
                </select>
            </div>

            <DataTable
                data={initialData}
                columns={columns}
                filters={filters}
                onRowClick={(row) => openDrawer({ type: "vendors", id: row.id })}
            />
        </div>
    );
}
