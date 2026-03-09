"use client";

import { useMemo, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAdminVertical } from "@/contexts/AdminVerticalContext";
import { formatDate, formatDateTime, formatMoneyFromDollars } from "@/lib/adminFormatters";
import { StatusBadge } from "@/components/admin/StatusBadge";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { Filter } from "lucide-react";

interface Opportunity {
    id: string;
    created_at: string;
    name: string | null;
    status: string | null;
    status_key?: string | null;
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

type StatusOption = { status_key: string; status_label: string | null };

export default function OpportunitiesClient({
    initialData,
    stages = [],
    error,
}: OpportunitiesClientProps) {
    const { openDrawer } = useAdminDrawer();
    const { selectedVerticalId } = useAdminVertical();
    const { labels } = useEntityLabels();
    const searchParams = useSearchParams();
    const router = useRouter();
    const statusKeyParam = searchParams.get("status_key") ?? "";
    const title = labels?.opportunities?.plural ?? "Opportunities";
    const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
    useEffect(() => {
        fetch("/api/admin/status-definitions?entity_type=opportunities")
            .then((r) => r.ok ? r.json() : { statuses: [] })
            .then((j: { statuses?: StatusOption[] }) => setStatusOptions((j.statuses ?? []).filter((s) => s.status_key)));
    }, []);
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

    const [filterOpen, setFilterOpen] = useState(false);
    const [filterStatus, setFilterStatus] = useState(statusKeyParam);
    const filterRef = useRef<HTMLDivElement>(null);

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
        router.push(`/admin/opportunities?${next.toString()}`);
        setFilterOpen(false);
    };

    const clearFilter = () => {
        setFilterStatus("");
        router.push("/admin/opportunities");
        setFilterOpen(false);
    };

    const total = data.length;
    const booked = data.filter((r) => (r.status ?? "").toLowerCase() === "closed" || (r._stage_name ?? "").toLowerCase().includes("book")).length;
    const notBooked = total - booked;

    return (
        <div>
            <AdminPageHeader title={title} subtitle="Pipeline and booking status." />
            <div className="mb-4 flex flex-wrap items-center gap-3">
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
            </div>
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
                filters={[]}
                onRowClick={(row) => openDrawer({ type: "opportunities", id: row.id })}
            />
        </div>
    );
}

