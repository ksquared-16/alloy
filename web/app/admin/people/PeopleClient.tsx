"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";
import { formatDateTime } from "@/lib/adminFormatters";

type PersonRow = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    _person_name?: string | null;
    _customer_count?: number;
    _compatibility_contacts_count?: number;
    _compatibility_members_count?: number;
    _updated?: string | null;
};

export default function PeopleClient() {
    const { openDrawer } = useAdminDrawer();
    const [persons, setPersons] = useState<PersonRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/persons");
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
                setPersons(json.persons ?? []);
            } else {
                setPersons([]);
                setError((json as { error?: string }).error ?? "Failed to load people");
            }
        } catch {
            setPersons([]);
            setError("Failed to load people");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    const columns = buildEntityTableColumns<PersonRow>("persons", {
        _customer_count: (value) => (value != null && Number(value) > 0 ? String(value) : "—"),
        _updated: (value) => (value != null && value !== "" ? formatDateTime(String(value)) : "—"),
    });

    return (
        <div>
            <AdminListPageHeader
                title="People"
                subtitle="Canonical human records. Use Contacts or Members for legacy compatibility."
            />
            <div className="pt-4">
                {error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                        {error}
                    </div>
                )}
                {loading ? (
                    <div className="py-8 text-center text-sm text-alloy-muted">Loading…</div>
                ) : (
                    <DataTable
                        data={persons}
                        columns={columns}
                        filters={[]}
                        onRowClick={(row) => openDrawer({ type: "persons", id: row.id })}
                    />
                )}
            </div>
        </div>
    );
}
