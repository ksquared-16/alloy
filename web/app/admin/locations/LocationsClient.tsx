"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import DataTable from "@/components/admin/DataTable";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";

export type LocationRow = {
    id: string;
    label: string | null;
    address1: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    customer_id: string | null;
    is_primary: boolean;
    is_active: boolean;
    location_type: string | null;
    updated_at: string | null;
    _customer_name: string | null;
};

export default function LocationsClient() {
    const { openDrawer } = useAdminDrawer();
    const { labels } = useEntityLabels();
    const plural = labels?.locations?.plural ?? "Locations";
    const singular = labels?.locations?.singular ?? "Location";
    const [locations, setLocations] = useState<LocationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [includeInactive, setIncludeInactive] = useState(false);

    const fetchLocations = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (includeInactive) params.set("include_inactive", "true");
        try {
            const res = await fetch(`/api/admin/locations?${params}`);
            const json = await res.json();
            if (res.ok) setLocations(json.locations ?? []);
        } finally {
            setLoading(false);
        }
    }, [includeInactive]);

    useEffect(() => {
        fetchLocations();
    }, [fetchLocations]);

    useEffect(() => {
        const onSaved = (e: Event) => {
            const d = (e as CustomEvent<{ type: string; id: string }>)?.detail;
            if (d?.type === "locations") fetchLocations();
        };
        window.addEventListener("admin-entity-saved", onSaved);
        return () => window.removeEventListener("admin-entity-saved", onSaved);
    }, [fetchLocations]);

    const openCreate = () => openDrawer({ type: "locations", id: "new" });

    const columns = useMemo(() => {
        const base = buildEntityTableColumns<LocationRow>("locations", {
            _customer_name: (_value: unknown, row: LocationRow) => {
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
        });
        return base;
    }, [openDrawer]);

    return (
        <>
            <AdminListPageHeader
                title={plural}
                toolbarRight={
                    <button
                        type="button"
                        onClick={openCreate}
                        className="rounded-lg bg-alloy-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30"
                    >
                        New {singular}
                    </button>
                }
            />
            <div className="pt-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-2">
                        <input
                            type="checkbox"
                            checked={includeInactive}
                            onChange={(e) => setIncludeInactive(e.target.checked)}
                            className="rounded border-admin-border text-alloy-blue focus:ring-alloy-blue/20"
                        />
                        <span className="text-sm text-alloy-midnight/80">Include inactive</span>
                    </label>
                </div>
                <DataTable
                    data={locations}
                    columns={columns}
                    filters={[]}
                    searchable={false}
                    hideToolbar
                    loading={loading}
                    onRowClick={(row) => openDrawer({ type: "locations", id: row.id })}
                />
            </div>
        </>
    );
}
