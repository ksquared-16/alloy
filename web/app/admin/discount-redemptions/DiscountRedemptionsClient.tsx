"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";

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

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/discount-redemptions?limit=200&offset=0");
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
    }, []);

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

    return (
        <>
            <AdminListPageHeader title={title} />
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
