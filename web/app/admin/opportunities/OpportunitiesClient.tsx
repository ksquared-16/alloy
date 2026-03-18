"use client";

import { useMemo, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAdminPreview } from "@/contexts/AdminPreviewContext";
import { useAdminVertical } from "@/contexts/AdminVerticalContext";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";
import { Filter } from "lucide-react";

export interface Opportunity {
    id: string;
    created_at: string | null;
    updated_at?: string | null;
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
    _vertical_name?: string | null;
    pipeline_stage_id?: string | null;
    source?: string | null;
    estimated_price_cents?: number | null;
    monetary_value_cents?: number | null;
    _customer_name?: string | null;
    _contact_name?: string | null;
    _primary_person_name?: string | null;
    _primary_contact_name?: string | null;
    _contact_email?: string | null;
    _contact_phone?: string | null;
    _stage_name?: string | null;
    _pipeline_stage_name?: string | null;
    _status_display?: string | null;
    _quote_total_display?: number | null;
    _updated?: string | null;
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
    const { openPreview, preview } = useAdminPreview();
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

    const columns = useMemo(() => buildEntityTableColumns<Opportunity>("opportunities"), []);

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

    /** Counts per status_key from dynamic status definitions */
    const statusCounts = useMemo(() => {
        const map: Record<string, number> = {};
        for (const opt of statusOptions) {
            map[opt.status_key] = data.filter((r) => (r.status_key ?? "") === opt.status_key).length;
        }
        return statusOptions.map((opt) => ({ ...opt, count: map[opt.status_key] ?? 0 }));
    }, [data, statusOptions]);

    const metricsPills = statusCounts.length > 0 ? (
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-alloy-muted">
            {statusCounts.map(({ status_key, status_label, count }) => (
                <span key={status_key} className="font-medium text-alloy-midnight/80">
                    {status_label ?? status_key} <span className="text-alloy-muted">{count}</span>
                </span>
            ))}
        </span>
    ) : null;

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
            <AdminListPageHeader
                title={title}
                metrics={metricsPills}
                toolbarLeft={filterTrigger}
                toolbarRight={
                    <button
                        type="button"
                        onClick={() => openDrawer({ type: "opportunities", id: "new" })}
                        className="rounded-lg bg-alloy-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30"
                    >
                        New {labels?.opportunities?.singular ?? "Opportunity"}
                    </button>
                }
            />
            <div className="pt-4">
                {error && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                        Error: {error}
                    </div>
                )}
                <DataTable
                    data={data}
                    columns={columns}
                    filters={[]}
                    searchable={false}
                    hideToolbar
                    onRowClick={(row, e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      openPreview({ type: "opportunities", id: row.id, anchor: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }, clickPosition: { x: e.clientX, y: e.clientY } });
                    }}
                    highlightedRowId={preview?.type === "opportunities" ? preview.id : null}
                  />
            </div>
        </div>
    );
}

