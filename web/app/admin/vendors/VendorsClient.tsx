"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DataTable from "@/components/admin/DataTable";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { formatDateTime } from "@/lib/adminFormatters";
import { Filter } from "lucide-react";

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

    const [filterOpen, setFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);
    const [filterStatus, setFilterStatus] = useState(statusKeyParam);

    useEffect(() => {
        setFilterStatus(statusKeyParam);
    }, [statusKeyParam]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setFilterOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const applyFilter = () => {
        const next = new URLSearchParams(searchParams.toString());
        if (filterStatus) next.set("status_key", filterStatus);
        else next.delete("status_key");
        router.push(`/admin/vendors?${next.toString()}`);
        setFilterOpen(false);
    };

    const clearFilter = () => {
        setFilterStatus("");
        router.push("/admin/vendors");
        setFilterOpen(false);
    };

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

    const filterTrigger = (
        <div className="relative" ref={filterRef}>
            <button
                type="button"
                onClick={() => setFilterOpen((o) => !o)}
                className={`flex items-center gap-2 rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm font-medium text-alloy-midnight/80 hover:bg-alloy-stone/50 focus:outline-none focus:ring-2 focus:ring-alloy-blue/20 ${filterOpen ? "border-alloy-blue/50 ring-2 ring-alloy-blue/20" : ""}`}
                aria-expanded={filterOpen}
                aria-haspopup="true"
            >
                <Filter className="h-4 w-4 text-alloy-muted" />
                Filter
                {statusKeyParam && <span className="h-1.5 w-1.5 rounded-full bg-alloy-blue" aria-hidden />}
            </button>
            {filterOpen && (
                <div className="absolute left-0 top-full z-20 mt-1.5 w-56 rounded-lg border border-alloy-stone/40 bg-white p-4 shadow-lg">
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Status</label>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            >
                                <option value="">All</option>
                                {statusOptions.map((s) => (
                                    <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={applyFilter} className="rounded-lg bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30">Apply</button>
                            {statusKeyParam && <button type="button" onClick={clearFilter} className="rounded-lg px-3 py-1.5 text-sm font-medium text-alloy-muted hover:text-alloy-midnight hover:underline">Clear</button>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div>
            <AdminListPageHeader title={title} toolbarLeft={filterTrigger} />
            <div className="pt-6">
                {error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                        Error: {error}
                    </div>
                )}
                <DataTable
                    data={initialData}
                    columns={columns}
                    filters={[]}
                    onRowClick={(row) => openDrawer({ type: "vendors", id: row.id })}
                />
            </div>
        </div>
    );
}
