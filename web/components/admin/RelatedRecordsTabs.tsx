"use client";

import { useCallback, useEffect, useState } from "react";
import Drawer from "@/components/admin/Drawer";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { formatMoneyFromDollars } from "@/lib/adminFormatters";

const LOCATION_TYPES = ["address", "site", "room", "unit", "property", "classroom"] as const;

type EntityKind = "contact" | "customer" | "opportunity" | "job" | "location";

interface TabConfig {
    key: string;
    label: string;
    entityType: AdminDrawerEntityType;
    columns: { key: string; label: string; render?: (val: unknown) => React.ReactNode }[];
    dataKey: string;
}

const EMPTY: Record<string, unknown[]> = { opportunities: [], jobs: [], schedules: [], contacts: [], locations: [] };

export default function RelatedRecordsTabs({
    entityType,
    entityId,
}: {
    entityType: EntityKind;
    entityId: string;
}) {
    const { openDrawer } = useAdminDrawer();
    const { canMutate } = useAdminAuth();
    const [data, setData] = useState<Record<string, unknown[]>>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(() => {
        setLoading(true);
        setError(null);
        fetch(`/api/admin/related/${entityType}/${entityId}`)
            .then((res) => {
                if (!res.ok) throw new Error("Failed to load related");
                return res.json();
            })
            .then((json) => setData({ ...EMPTY, ...json }))
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [entityType, entityId]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    const [addLocationOpen, setAddLocationOpen] = useState(false);
    const [addLocationForm, setAddLocationForm] = useState({
        label: "",
        location_type: "address",
        is_primary: false,
        is_active: true,
        address1: "",
        address2: "",
        city: "",
        state: "",
        postal_code: "",
        country: "",
        access_notes: "",
    });
    const [addLocationSaving, setAddLocationSaving] = useState(false);
    const [addLocationError, setAddLocationError] = useState<string | null>(null);

    const tabs: TabConfig[] = [];

    if (entityType === "contact") {
        tabs.push(
            { key: "opportunities", label: "Opportunities", entityType: "opportunities", dataKey: "opportunities", columns: [
                { key: "created_at", label: "Created", render: (v) => v ? new Date(v as string).toLocaleDateString() : "-" },
                { key: "name", label: "Name" },
                { key: "status", label: "Status" },
                { key: "job_date", label: "Job Date" },
                { key: "quote_total", label: "Quote", render: (v) => formatMoneyFromDollars(v as number) },
            ]},
            { key: "jobs", label: "Jobs", entityType: "jobs", dataKey: "jobs", columns: [
                { key: "created_at", label: "Created", render: (v) => v ? new Date(v as string).toLocaleDateString() : "-" },
                { key: "title", label: "Title" },
                { key: "scheduled_at", label: "Scheduled", render: (v) => v ? new Date(v as string).toLocaleString() : "-" },
            ]},
            { key: "schedules", label: "Schedules", entityType: "schedules", dataKey: "schedules", columns: [
                { key: "start_at", label: "Start", render: (v) => v ? new Date(v as string).toLocaleString() : "-" },
                { key: "end_at", label: "End", render: (v) => v ? new Date(v as string).toLocaleString() : "-" },
                { key: "timezone", label: "Timezone" },
            ]},
        );
    } else if (entityType === "customer") {
        tabs.push(
            { key: "contacts", label: "Contacts", entityType: "contacts", dataKey: "contacts", columns: [
                { key: "created_at", label: "Created", render: (v) => v ? new Date(v as string).toLocaleDateString() : "-" },
                { key: "first_name", label: "First" },
                { key: "last_name", label: "Last" },
                { key: "email", label: "Email" },
            ]},
            { key: "opportunities", label: "Opportunities", entityType: "opportunities", dataKey: "opportunities", columns: [
                { key: "created_at", label: "Created", render: (v) => v ? new Date(v as string).toLocaleDateString() : "-" },
                { key: "name", label: "Name" },
                { key: "status", label: "Status" },
                { key: "quote_total", label: "Quote", render: (v) => formatMoneyFromDollars(v as number) },
            ]},
            { key: "jobs", label: "Jobs", entityType: "jobs", dataKey: "jobs", columns: [
                { key: "created_at", label: "Created", render: (v) => v ? new Date(v as string).toLocaleDateString() : "-" },
                { key: "title", label: "Title" },
                { key: "scheduled_at", label: "Scheduled", render: (v) => v ? new Date(v as string).toLocaleString() : "-" },
            ]},
            { key: "schedules", label: "Schedules", entityType: "schedules", dataKey: "schedules", columns: [
                { key: "start_at", label: "Start", render: (v) => v ? new Date(v as string).toLocaleString() : "-" },
                { key: "end_at", label: "End", render: (v) => v ? new Date(v as string).toLocaleString() : "-" },
            ]},
            { key: "locations", label: "Locations", entityType: "locations", dataKey: "locations", columns: [
                { key: "label", label: "Name" },
                { key: "location_type", label: "Type", render: (v) => (v && typeof v === "string") ? (v as string).charAt(0).toUpperCase() + (v as string).slice(1).toLowerCase() : "—" },
                { key: "address1", label: "Address" },
                { key: "city", label: "City" },
                { key: "postal_code", label: "ZIP" },
                { key: "is_primary", label: "Primary", render: (v) => v ? "Yes" : "No" },
                { key: "is_active", label: "Active", render: (v) => v ? "Yes" : "No" },
            ]},
        );
    } else if (entityType === "opportunity") {
        tabs.push(
            { key: "jobs", label: "Jobs", entityType: "jobs", dataKey: "jobs", columns: [
                { key: "created_at", label: "Created", render: (v) => v ? new Date(v as string).toLocaleDateString() : "-" },
                { key: "title", label: "Title" },
                { key: "scheduled_at", label: "Scheduled", render: (v) => v ? new Date(v as string).toLocaleString() : "-" },
            ]},
            { key: "schedules", label: "Schedules", entityType: "schedules", dataKey: "schedules", columns: [
                { key: "start_at", label: "Start", render: (v) => v ? new Date(v as string).toLocaleString() : "-" },
                { key: "end_at", label: "End", render: (v) => v ? new Date(v as string).toLocaleString() : "-" },
                { key: "timezone", label: "Timezone" },
            ]},
        );
    } else if (entityType === "job") {
        tabs.push(
            { key: "schedules", label: "Schedules", entityType: "schedules", dataKey: "schedules", columns: [
                { key: "start_at", label: "Start", render: (v) => v ? new Date(v as string).toLocaleString() : "-" },
                { key: "end_at", label: "End", render: (v) => v ? new Date(v as string).toLocaleString() : "-" },
                { key: "timezone", label: "Timezone" },
            ]},
        );
    } else if (entityType === "location") {
        tabs.push(
            { key: "jobs", label: "Jobs", entityType: "jobs", dataKey: "jobs", columns: [
                { key: "created_at", label: "Created", render: (v) => v ? new Date(v as string).toLocaleDateString() : "-" },
                { key: "title", label: "Title" },
                { key: "scheduled_at", label: "Scheduled", render: (v) => v ? new Date(v as string).toLocaleString() : "-" },
            ]},
            { key: "schedules", label: "Schedules", entityType: "schedules", dataKey: "schedules", columns: [
                { key: "start_at", label: "Start", render: (v) => v ? new Date(v as string).toLocaleString() : "-" },
                { key: "end_at", label: "End", render: (v) => v ? new Date(v as string).toLocaleString() : "-" },
                { key: "timezone", label: "Timezone" },
            ]},
        );
    }

    const [activeTab, setActiveTab] = useState(tabs[0]?.key ?? "");

    if (tabs.length === 0) return null;

    const active = tabs.find((t) => t.key === activeTab) ?? tabs[0];
    const rows = (data[active.dataKey] ?? []) as Record<string, unknown>[];

    return (
        <div className="mt-6 border-t border-alloy-stone/30 pt-4">
            <h3 className="text-sm font-semibold text-alloy-midnight/80 mb-3">Related</h3>
            {error && <p className="text-red-600 text-sm mb-2">Error: {error}</p>}
            {loading ? (
                <p className="text-alloy-midnight/60 text-sm">Loading related records…</p>
            ) : (
                <>
                    <div className="flex gap-2 border-b border-alloy-stone/30 mb-3">
                        {tabs.map((t) => (
                            <button
                                key={t.key}
                                type="button"
                                onClick={() => setActiveTab(t.key)}
                                className={`px-3 py-1.5 text-sm font-medium rounded-t ${activeTab === t.key ? "bg-alloy-stone text-alloy-midnight" : "text-alloy-midnight/60 hover:bg-alloy-stone/50"}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    {entityType === "customer" && activeTab === "locations" && canMutate && (
                        <div className="mb-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setAddLocationError(null);
                                    setAddLocationForm({
                                        label: "",
                                        location_type: "address",
                                        is_primary: false,
                                        is_active: true,
                                        address1: "",
                                        address2: "",
                                        city: "",
                                        state: "",
                                        postal_code: "",
                                        country: "",
                                        access_notes: "",
                                    });
                                    setAddLocationOpen(true);
                                }}
                                className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90"
                            >
                                Add location
                            </button>
                        </div>
                    )}
                    {rows.length === 0 ? (
                        <p className="text-alloy-midnight/60 text-sm">No {active.label.toLowerCase()} found.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border border-alloy-stone/30 rounded overflow-hidden">
                                <thead>
                                    <tr className="bg-alloy-stone/30">
                                        {active.columns.map((col) => (
                                            <th key={col.key} className="text-left px-3 py-2 font-medium text-alloy-midnight/80">
                                                {col.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, i) => (
                                        <tr
                                            key={(row.id as string) ?? i}
                                            className="border-t border-alloy-stone/20 hover:bg-alloy-blue/5 cursor-pointer"
                                            onClick={() => openDrawer({ type: active.entityType, id: row.id as string })}
                                        >
                                            {active.columns.map((col) => (
                                                <td key={col.key} className="px-3 py-2">
                                                    {col.render ? col.render(row[col.key]) : (row[col.key] as React.ReactNode) ?? "-"}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
            <Drawer
                isOpen={addLocationOpen}
                onClose={() => setAddLocationOpen(false)}
                title="New location"
                zIndexBackdrop={60}
                zIndexPanel={70}
            >
                <div className="space-y-3">
                    {addLocationError && <p className="text-red-600 text-sm">{addLocationError}</p>}
                    <div>
                        <label className="block text-sm text-alloy-midnight/70 mb-0.5">Name</label>
                        <input
                            value={addLocationForm.label}
                            onChange={(e) => setAddLocationForm((f) => ({ ...f, label: e.target.value }))}
                            className="w-full px-2 py-1.5 border rounded text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-alloy-midnight/70 mb-0.5">Type</label>
                        <select
                            value={addLocationForm.location_type}
                            onChange={(e) => setAddLocationForm((f) => ({ ...f, location_type: e.target.value }))}
                            className="w-full px-2 py-1.5 border rounded text-sm"
                        >
                            {LOCATION_TYPES.map((t) => (
                                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={addLocationForm.is_primary}
                            onChange={(e) => setAddLocationForm((f) => ({ ...f, is_primary: e.target.checked }))}
                        />
                        <label className="text-sm text-alloy-midnight/70">Primary</label>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={addLocationForm.is_active}
                            onChange={(e) => setAddLocationForm((f) => ({ ...f, is_active: e.target.checked }))}
                        />
                        <label className="text-sm text-alloy-midnight/70">Active</label>
                    </div>
                    <div>
                        <label className="block text-sm text-alloy-midnight/70 mb-0.5">Address 1</label>
                        <input
                            value={addLocationForm.address1}
                            onChange={(e) => setAddLocationForm((f) => ({ ...f, address1: e.target.value }))}
                            className="w-full px-2 py-1.5 border rounded text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-alloy-midnight/70 mb-0.5">Address 2</label>
                        <input
                            value={addLocationForm.address2}
                            onChange={(e) => setAddLocationForm((f) => ({ ...f, address2: e.target.value }))}
                            className="w-full px-2 py-1.5 border rounded text-sm"
                        />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <input
                            value={addLocationForm.city}
                            onChange={(e) => setAddLocationForm((f) => ({ ...f, city: e.target.value }))}
                            placeholder="City"
                            className="px-2 py-1.5 border rounded text-sm"
                        />
                        <input
                            value={addLocationForm.state}
                            onChange={(e) => setAddLocationForm((f) => ({ ...f, state: e.target.value }))}
                            placeholder="State"
                            className="px-2 py-1.5 border rounded text-sm"
                        />
                        <input
                            value={addLocationForm.postal_code}
                            onChange={(e) => setAddLocationForm((f) => ({ ...f, postal_code: e.target.value }))}
                            placeholder="ZIP"
                            className="px-2 py-1.5 border rounded text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-alloy-midnight/70 mb-0.5">Country</label>
                        <input
                            value={addLocationForm.country}
                            onChange={(e) => setAddLocationForm((f) => ({ ...f, country: e.target.value }))}
                            className="w-full px-2 py-1.5 border rounded text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-alloy-midnight/70 mb-0.5">Access notes</label>
                        <textarea
                            value={addLocationForm.access_notes}
                            onChange={(e) => setAddLocationForm((f) => ({ ...f, access_notes: e.target.value }))}
                            className="w-full px-2 py-1.5 border rounded text-sm"
                            rows={2}
                        />
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            disabled={addLocationSaving}
                            onClick={async () => {
                                setAddLocationSaving(true);
                                setAddLocationError(null);
                                try {
                                    const res = await fetch("/api/admin/locations", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            customer_id: entityId,
                                            label: addLocationForm.label.trim() || null,
                                            location_type: addLocationForm.location_type,
                                            is_primary: addLocationForm.is_primary,
                                            is_active: addLocationForm.is_active,
                                            address1: addLocationForm.address1.trim() || null,
                                            address2: addLocationForm.address2.trim() || null,
                                            city: addLocationForm.city.trim() || null,
                                            state: addLocationForm.state.trim() || null,
                                            postal_code: addLocationForm.postal_code.trim() || null,
                                            country: addLocationForm.country.trim() || null,
                                            access_notes: addLocationForm.access_notes.trim() || null,
                                        }),
                                    });
                                    const json = await res.json().catch(() => ({}));
                                    if (!res.ok) throw new Error((json.error as string) || "Create failed");
                                    const createdId = (json as { id: string }).id;
                                    if (!createdId) throw new Error("No id returned");
                                    setAddLocationOpen(false);
                                    refetch();
                                    openDrawer({ type: "locations", id: createdId });
                                } catch (e: unknown) {
                                    setAddLocationError((e as Error).message);
                                }
                                setAddLocationSaving(false);
                            }}
                            className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md disabled:opacity-50"
                        >
                            {addLocationSaving ? "Saving…" : "Save"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setAddLocationOpen(false)}
                            className="px-3 py-1.5 text-sm border rounded-md"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </Drawer>
        </div>
    );
}
