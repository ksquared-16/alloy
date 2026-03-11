"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";
import type { ServiceOfferingListItem } from "@/app/api/admin/service-offerings/route";

export default function ServiceOfferingsClient() {
    const { openDrawer } = useAdminDrawer();
    const { labels } = useEntityLabels();
    const plural = labels?.service_offerings?.plural ?? "Service Offerings";
    const [items, setItems] = useState<ServiceOfferingListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/service-offerings?limit=200&offset=0");
            const json = await res.json();
            if (res.ok) {
                setItems(json.service_offerings ?? []);
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

    useEffect(() => {
        const onSaved = (e: Event) => {
            const d = (e as CustomEvent<{ type: string; id: string }>)?.detail;
            if (d?.type === "service_offerings") fetchList();
        };
        window.addEventListener("admin-entity-saved", onSaved);
        return () => window.removeEventListener("admin-entity-saved", onSaved);
    }, [fetchList]);

    const columns = useMemo(
        () => buildEntityTableColumns<ServiceOfferingListItem>("service_offerings", {}),
        []
    );

    return (
        <>
            <AdminListPageHeader title={plural} />
            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {error}
                </div>
            )}
            <div className="pt-4">
                <DataTable
                    data={items}
                    columns={columns}
                    filters={[]}
                    searchable={false}
                    hideToolbar
                    loading={loading}
                    onRowClick={(row) => openDrawer({ type: "service_offerings", id: row.id })}
                />
                {total > 0 && (
                    <p className="mt-2 px-1 text-xs text-alloy-muted">
                        Showing {items.length} of {total}
                    </p>
                )}
            </div>
        </>
    );
}
