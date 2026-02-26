"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

type Member = {
    id: string;
    customer_id: string;
    display_name: string | null;
    relationship: string | null;
    first_name: string | null;
    last_name: string | null;
    dob: string | null;
    is_active: boolean;
    created_at: string;
};

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

    useEffect(() => {
        fetch("/api/admin/customer-member-relationship-types")
            .then((r) => (r.ok ? r.json() : { options: [] }))
            .then((json: { options?: { key: string; label: string }[] }) => setRelationshipOptions(json.options ?? []))
            .catch(() => setRelationshipOptions([]));
    }, []);

    const fetchMembers = useCallback(async (customerId?: string) => {
        setLoading(true);
        setError(null);
        try {
            const url = customerId
                ? `/api/admin/customer-members?customer_id=${encodeURIComponent(customerId)}`
                : "/api/admin/customer-members";
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
    }, []);

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
        { key: "created_at", label: "Created", sortable: true, render: (v: string) => new Date(v).toLocaleString() },
    ];

    return (
        <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-3xl font-bold text-alloy-midnight">{plural}</h1>
                <button
                    type="button"
                    onClick={() => openDrawer({ type: "customer_members", id: "new", defaultCustomerId: customerIdFromUrl })}
                    disabled={!canMutate}
                    className="rounded-md border border-alloy-stone/50 bg-white px-4 py-2 text-sm font-medium text-alloy-midnight hover:bg-alloy-stone/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    New {singular}
                </button>
            </div>

            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
            )}

            {loading ? (
                <p className="text-sm text-alloy-midnight/60">Loading…</p>
            ) : (
                <DataTable
                    data={members}
                    columns={columns}
                    onRowClick={(row) => openDrawer({ type: "customer_members", id: row.id })}
                />
            )}
        </div>
    );
}
