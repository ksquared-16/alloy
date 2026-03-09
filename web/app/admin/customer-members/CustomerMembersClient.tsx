"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import DataTable from "@/components/admin/DataTable";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { formatDateTime } from "@/lib/adminFormatters";
import { Filter } from "lucide-react";

type Member = {
    id: string;
    customer_id: string;
    display_name: string | null;
    relationship: string | null;
    first_name: string | null;
    last_name: string | null;
    dob: string | null;
    is_active: boolean;
    status_key?: string | null;
    created_at: string;
};

type StatusOption = { status_key: string; status_label: string | null };

export default function CustomerMembersClient() {
    const { labels } = useEntityLabels();
    const plural = labels.customer_members?.plural ?? "Members";
    const singular = labels.customer_members?.singular ?? "Member";
    const { openDrawer } = useAdminDrawer();
    const { canMutate } = useAdminAuth();

    const searchParams = useSearchParams();
    const customerIdFromUrl = searchParams.get("customer_id")?.trim() || undefined;
    const hasOpenedNewRef = useRef(false);

    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [relationshipOptions, setRelationshipOptions] = useState<{ key: string; label: string }[]>([]);
    const [statusKeyFilter, setStatusKeyFilter] = useState("");
    const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
    const [filterOpen, setFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setFilterOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        fetch("/api/admin/customer-member-relationship-types")
            .then((r) => (r.ok ? r.json() : { options: [] }))
            .then((json: { options?: { key: string; label: string }[] }) => setRelationshipOptions(json.options ?? []))
            .catch(() => setRelationshipOptions([]));
    }, []);
    useEffect(() => {
        fetch("/api/admin/status-definitions?entity_type=customer_members")
            .then((r) => r.ok ? r.json() : { statuses: [] })
            .then((j: { statuses?: StatusOption[] }) => setStatusOptions((j.statuses ?? []).filter((s) => s.status_key)));
    }, []);

    const fetchMembers = useCallback(async (customerId?: string) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (customerId) params.set("customer_id", customerId);
            if (statusKeyFilter) params.set("status_key", statusKeyFilter);
            const url = `/api/admin/customer-members?${params.toString()}`;
            const res = await fetch(url);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load");
            setMembers((json as { members?: Member[] }).members ?? []);
        } catch (e) {
            setError((e as Error).message);
            setMembers([]);
        } finally {
            setLoading(false);
        }
    }, [statusKeyFilter]);

    useEffect(() => {
        fetchMembers(customerIdFromUrl);
    }, [fetchMembers, customerIdFromUrl]);

    useEffect(() => {
        if (customerIdFromUrl && !hasOpenedNewRef.current) {
            hasOpenedNewRef.current = true;
            openDrawer({ type: "customer_members", id: "new", defaultCustomerId: customerIdFromUrl });
        }
    }, [customerIdFromUrl, openDrawer]);

    useEffect(() => {
        const onFocus = () => fetchMembers(customerIdFromUrl);
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [fetchMembers, customerIdFromUrl]);

    const relationshipLabel = (v: string | null) => {
        if (!v) return "—";
        const opt = relationshipOptions.find((o) => o.key === v);
        return opt ? opt.label : v;
    };

    const columns = [
        { key: "display_name", label: "Name", sortable: true, render: (_: unknown, r: Member) => r.display_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "—" },
        { key: "relationship", label: "Relationship", sortable: true, render: (v: string | null) => relationshipLabel(v) },
        { key: "dob", label: "DOB", sortable: true, render: (v: string | null) => v || "—" },
        { key: "is_active", label: "Active", sortable: true, render: (v: boolean) => (v ? "Yes" : "No") },
        { key: "created_at", label: "Created", sortable: true, render: (v: string) => formatDateTime(v) },
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
                {statusKeyFilter && <span className="h-1.5 w-1.5 rounded-full bg-alloy-blue" aria-hidden />}
            </button>
            {filterOpen && (
                <div className="absolute left-0 top-full z-20 mt-1.5 w-56 rounded-lg border border-alloy-stone/40 bg-white p-4 shadow-lg">
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Status</label>
                            <select
                                value={statusKeyFilter}
                                onChange={(e) => setStatusKeyFilter(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            >
                                <option value="">All</option>
                                {statusOptions.map((s) => (
                                    <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={() => setFilterOpen(false)} className="rounded-lg bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30">Apply</button>
                            {statusKeyFilter && (
                                <button type="button" onClick={() => { setStatusKeyFilter(""); setFilterOpen(false); }} className="rounded-lg px-3 py-1.5 text-sm font-medium text-alloy-muted hover:text-alloy-midnight hover:underline">Clear</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div>
            <AdminListPageHeader
                title={plural}
                toolbarLeft={filterTrigger}
                toolbarRight={
                    <button
                        type="button"
                        onClick={() => openDrawer({ type: "customer_members", id: "new", defaultCustomerId: customerIdFromUrl })}
                        disabled={!canMutate}
                        className="rounded-lg bg-alloy-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        New {singular}
                    </button>
                }
            />
            <div className="pt-6">
                {error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
                )}
                {loading ? (
                    <div className="rounded-xl border border-alloy-stone/30 bg-white p-10 text-center text-sm text-alloy-muted">Loading…</div>
                ) : (
                    <DataTable
                        data={members}
                        columns={columns}
                        filters={[]}
                        hideToolbar
                        onRowClick={(row) => openDrawer({ type: "customer_members", id: row.id })}
                    />
                )}
            </div>
        </div>
    );
}
