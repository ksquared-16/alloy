"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import DataTable from "@/components/admin/DataTable";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";

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
    updated_at?: string | null;
    _customer_name?: string | null;
    _relationship_label?: string | null;
    _age?: number | null;
    _linked_contacts_count?: number;
    _updated?: string;
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

    const fetchMembers = useCallback(async (customerId?: string) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (customerId) params.set("customer_id", customerId);
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

    const columns = buildEntityTableColumns<Member>("customer_members", {
        display_name: (_v, r) => r.display_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "—",
    });

    return (
        <div>
            <AdminListPageHeader
                title={plural}
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
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-sm text-amber-900">
                <strong>Legacy view.</strong> For the canonical human record, use{" "}
                <Link href="/admin/people" className="font-medium text-alloy-blue hover:underline">People</Link>.
            </div>
            <div className="pt-4">
                {error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
                )}
                {loading ? (
                    <div className="rounded-xl border border-admin-border bg-admin-surface-card p-10 text-center text-sm text-alloy-muted">Loading…</div>
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
