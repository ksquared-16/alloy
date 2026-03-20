"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DataTable from "@/components/admin/DataTable";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAdminPreview } from "@/contexts/AdminPreviewContext";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";
import { formatPayoutPercent } from "@/lib/adminFormatters";
import { Filter } from "lucide-react";

export interface Vendor {
    id: string;
    created_at: string | null;
    updated_at: string | null;
    submitted_at: string | null;
    name: string | null;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    vendor_status_id: string | null;
    status_key?: string | null;
    status?: string | null;
    primary_contact_id: string | null;
    primary_person_id: string | null;
    payout_percent: number | null;
    w9_received?: boolean | null;
    ach_verified?: boolean | null;
    service_area_zip_codes: string[] | null;
    days_available: string[] | null;
    _vendor_status_key: string;
    _vendor_status_label: string;
    _status_display: string | null;
    _primary_person_name: string | null;
    _primary_contact_name: string | null;
    _vendor_email: string | null;
    _vendor_phone: string | null;
    _jobs_count: number;
    _updated: string | null;
}

type StatusOption = { status_key: string; status_label: string | null };

interface VendorsClientProps {
    initialData: Vendor[];
    error?: string;
}

export default function VendorsClient({
    initialData,
    error,
}: VendorsClientProps) {
    const { openDrawer } = useAdminDrawer();
    const { openPreview, preview } = useAdminPreview();
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
    const [search, setSearch] = useState("");
    const [searchApplied, setSearchApplied] = useState("");

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
        setSearchApplied(search.trim());
        const next = new URLSearchParams(searchParams.toString());
        if (filterStatus) next.set("status_key", filterStatus);
        else next.delete("status_key");
        router.push(`/admin/vendors?${next.toString()}`);
        setFilterOpen(false);
    };

    const clearFilter = () => {
        setFilterStatus("");
        setSearch("");
        setSearchApplied("");
        router.push("/admin/vendors");
        setFilterOpen(false);
    };

    const filteredData = useMemo(() => {
        let result = initialData;
        if (searchApplied.trim()) {
            const q = searchApplied.toLowerCase();
            result = result.filter(
                (row) =>
                    (row.name ?? "").toLowerCase().includes(q) ||
                    (row.company_name ?? "").toLowerCase().includes(q) ||
                    (row._primary_person_name ?? "").toLowerCase().includes(q) ||
                    (row._vendor_email ?? "").toLowerCase().includes(q) ||
                    (row._vendor_phone ?? "").toLowerCase().includes(q)
            );
        }
        return result;
    }, [initialData, searchApplied]);

    const columns = useMemo(
        () =>
            buildEntityTableColumns<Vendor>("vendors", {
                payout_percent: (_value, row) => formatPayoutPercent(row.payout_percent),
                _jobs_count: (value) => (value != null && value !== "" ? String(value) : "0"),
            }),
        []
    );

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
                {(searchApplied || statusKeyParam) && <span className="h-1.5 w-1.5 rounded-full bg-alloy-blue" aria-hidden />}
            </button>
            {filterOpen && (
                <div className="absolute left-0 top-full z-20 mt-1.5 w-72 rounded-lg border border-alloy-stone/40 bg-white p-4 shadow-lg">
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Search (name, company, person, email, phone)</label>
                            <input
                                type="text"
                                placeholder="Search…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && (setSearchApplied(search.trim()), setFilterOpen(false))}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight placeholder:text-alloy-muted/70 focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            />
                        </div>
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
                            {(searchApplied || statusKeyParam) && (
                                <button type="button" onClick={clearFilter} className="rounded-lg px-3 py-1.5 text-sm font-medium text-alloy-muted hover:text-alloy-midnight hover:underline">Clear</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

  const singular = labels?.vendors?.singular ?? "Vendor";
  return (
    <div>
      <AdminListPageHeader
        title={title}
        toolbarLeft={filterTrigger}
        toolbarRight={
          <button
            type="button"
            onClick={() => openDrawer({ type: "vendors", id: "new" })}
            className="rounded-lg bg-alloy-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30"
          >
            New {singular}
          </button>
        }
      />
            <div className="pt-4">
                {error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                        Error: {error}
                    </div>
                )}
                <DataTable
                    data={filteredData}
                    columns={columns}
                    filters={[]}
                    searchable={false}
                    hideToolbar
                    onRowClick={(row, e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      openPreview({ type: "vendors", id: row.id, anchor: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }, clickPosition: { x: e.clientX, y: e.clientY } });
                    }}
                    highlightedRowId={preview?.type === "vendors" ? preview.id : null}
                  />
            </div>
        </div>
    );
}
