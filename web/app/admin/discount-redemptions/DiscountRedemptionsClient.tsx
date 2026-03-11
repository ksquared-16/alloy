"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";
import { Filter } from "lucide-react";

export type DiscountRedemptionRow = {
    id: string;
    created_at: string;
    discount_code_id: string;
    customer_id: string;
    contact_id: string | null;
    opportunity_id: string | null;
    job_id: string | null;
    quote_subtotal: number | null;
    discount_amount: number | null;
    quote_total: number | null;
    _code: string | null;
    _customer_name: string | null;
    _contact_name: string | null;
    _opportunity_name: string | null;
    _job_label: string | null;
    _subtotal_display: number | null;
    _discount_display: number | null;
    _total_display: number | null;
};

export default function DiscountRedemptionsClient() {
    const { openDrawer } = useAdminDrawer();
    const { labels } = useEntityLabels();
    const plural = labels?.discount_redemptions?.plural ?? "Discount Redemptions";
    const title = plural;
    const [redemptions, setRedemptions] = useState<DiscountRedemptionRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [limit, setLimit] = useState(100);
    const [filterOpen, setFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/discount-redemptions?limit=${limit}&offset=0`);
            const json = await res.json();
            if (res.ok) {
                setRedemptions(json.redemptions ?? []);
                setTotal(json.total ?? 0);
            } else {
                setError((json as { error?: string }).error ?? "Failed to load");
            }
        } finally {
            setLoading(false);
        }
    }, [limit]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    const columns = useMemo(() => {
        return buildEntityTableColumns<DiscountRedemptionRow>("discount_redemptions", {
            _customer_name: (_value: unknown, row: DiscountRedemptionRow) => {
                const name = row._customer_name ?? "—";
                const id = row.customer_id;
                if (!id) return <span className="text-alloy-midnight/70">{name}</span>;
                return (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            openDrawer({ type: "customers", id });
                        }}
                        className="text-left text-alloy-blue hover:underline"
                    >
                        {name}
                    </button>
                );
            },
            _contact_name: (_value: unknown, row: DiscountRedemptionRow) => {
                const name = row._contact_name ?? "—";
                const id = row.contact_id;
                if (!id) return <span className="text-alloy-midnight/70">{name}</span>;
                return (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            openDrawer({ type: "contacts", id });
                        }}
                        className="text-left text-alloy-blue hover:underline"
                    >
                        {name}
                    </button>
                );
            },
            _opportunity_name: (_value: unknown, row: DiscountRedemptionRow) => {
                const name = row._opportunity_name ?? "—";
                const id = row.opportunity_id;
                if (!id) return <span className="text-alloy-midnight/70">{name}</span>;
                return (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            openDrawer({ type: "opportunities", id });
                        }}
                        className="text-left text-alloy-blue hover:underline"
                    >
                        {name}
                    </button>
                );
            },
            _job_label: (_value: unknown, row: DiscountRedemptionRow) => {
                const name = row._job_label ?? "—";
                const id = row.job_id;
                if (!id) return <span className="text-alloy-midnight/70">{name}</span>;
                return (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            openDrawer({ type: "jobs", id });
                        }}
                        className="text-left text-alloy-blue hover:underline"
                    >
                        {name}
                    </button>
                );
            },
        });
    }, [openDrawer]);

    const hasActiveFilters = limit !== 100;
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
                {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-alloy-blue" aria-hidden />}
            </button>
            {filterOpen && (
                <div className="absolute right-0 top-full z-20 mt-1.5 w-56 rounded-lg border border-alloy-stone/40 bg-white p-4 shadow-lg">
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Show</label>
                            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-full rounded-lg border border-alloy-stone/40 px-3 py-2 text-sm">
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                                <option value={200}>200</option>
                                <option value={500}>500</option>
                            </select>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={() => setFilterOpen(false)} className="rounded-lg bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">Apply</button>
                            {hasActiveFilters && (
                                <button type="button" onClick={() => { setLimit(100); setFilterOpen(false); }} className="rounded-lg px-3 py-1.5 text-sm font-medium text-alloy-muted hover:text-alloy-midnight hover:underline">Clear</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <>
            <AdminListPageHeader title={title} toolbarLeft={filterTrigger} />
            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {error}
                </div>
            )}
            <div className="pt-4">
                <DataTable
                    data={redemptions}
                    columns={columns}
                    filters={[]}
                    searchable={false}
                    hideToolbar
                    loading={loading}
                    onRowClick={(row) => openDrawer({ type: "discount_redemptions", id: row.id })}
                />
                {total > 0 && (
                    <p className="mt-2 px-1 text-xs text-alloy-muted">Showing {redemptions.length} of {total}</p>
                )}
            </div>
        </>
    );
}
