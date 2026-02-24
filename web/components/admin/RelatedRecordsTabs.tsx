"use client";

import { useEffect, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { formatMoneyFromDollars } from "@/lib/adminFormatters";

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
    const [data, setData] = useState<Record<string, unknown[]>>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
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
                { key: "label", label: "Label" },
                { key: "address1", label: "Address1" },
                { key: "city", label: "City" },
                { key: "postal_code", label: "Postal" },
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
        </div>
    );
}
