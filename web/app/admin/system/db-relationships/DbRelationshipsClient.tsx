"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { formatDateTime } from "@/lib/adminFormatters";

type CustomerPersonRow = {
    id: string;
    customer_id: string;
    person_id: string;
    role: string | null;
    role_label: string | null;
    _customer_name: string | null;
    _person_name: string | null;
    created_at?: string | null;
};

type PersonRelationshipRow = {
    id: string;
    from_person_id: string;
    to_person_id: string;
    relationship_type: string | null;
    _relationship_type_label: string | null;
    _from_person_name: string | null;
    _to_person_name: string | null;
    created_at?: string | null;
};

function LinkButton({
    label,
    onClick,
}: {
    label: string | null;
    onClick: () => void;
}) {
    const text = label ?? "—";
    return (
        <button
            type="button"
            onClick={onClick}
            className="text-left font-medium text-alloy-blue hover:underline truncate max-w-[200px] block"
        >
            {text}
        </button>
    );
}

export default function DbRelationshipsClient() {
    const { openDrawer } = useAdminDrawer();
    const [customerPersons, setCustomerPersons] = useState<CustomerPersonRow[]>([]);
    const [personRelationships, setPersonRelationships] = useState<PersonRelationshipRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/db-relationships");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load");
            setCustomerPersons((json as { customer_persons?: CustomerPersonRow[] }).customer_persons ?? []);
            setPersonRelationships((json as { person_relationships?: PersonRelationshipRow[] }).person_relationships ?? []);
        } catch (e) {
            setError((e as Error).message);
            setCustomerPersons([]);
            setPersonRelationships([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <>
            <div className="mb-6">
                <AdminPageHeader
                    title="DB Relationships"
                    subtitle="Inspect and manage customer–person links and person-to-person relationships."
                />
            </div>

            {loading && <p className="text-sm text-[#59678b]">Loading…</p>}
            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {error}
                </div>
            )}

            {!loading && !error && (
                <div className="space-y-8">
                    <SectionCard title="Customer People">
                        <p className="text-sm text-[#59678b] mb-3">
                            Links between customers and people (customer_persons). Click a name to open that record.
                        </p>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[600px] text-left text-sm">
                                <thead>
                                    <tr className="border-b border-[#e6e8ec] text-[#59678b]">
                                        <th className="pb-2 pr-4 font-semibold">Customer</th>
                                        <th className="pb-2 pr-4 font-semibold">Person</th>
                                        <th className="pb-2 pr-4 font-semibold">Role</th>
                                        <th className="pb-2 pr-4 font-semibold">Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customerPersons.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="py-4 text-[#59678b]">
                                                No customer–person links yet. Add people to customers from the Customer or Person drawer.
                                            </td>
                                        </tr>
                                    ) : (
                                        customerPersons.map((row) => (
                                            <tr key={row.id} className="border-b border-[#e6e8ec] align-middle">
                                                <td className="py-2 pr-4">
                                                    <LinkButton
                                                        label={row._customer_name}
                                                        onClick={() => openDrawer({ type: "customers", id: row.customer_id })}
                                                    />
                                                </td>
                                                <td className="py-2 pr-4">
                                                    <LinkButton
                                                        label={row._person_name}
                                                        onClick={() => openDrawer({ type: "persons", id: row.person_id })}
                                                    />
                                                </td>
                                                <td className="py-2 pr-4 text-[#59678b]">{row.role_label ?? row.role ?? "—"}</td>
                                                <td className="py-2 pr-4 text-[#59678b]">{row.created_at ? formatDateTime(row.created_at) : "—"}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>

                    <SectionCard title="Person Relationships">
                        <p className="text-sm text-[#59678b] mb-3">
                            Person-to-person relationships (person_relationships). Click a name to open that person.
                        </p>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[600px] text-left text-sm">
                                <thead>
                                    <tr className="border-b border-[#e6e8ec] text-[#59678b]">
                                        <th className="pb-2 pr-4 font-semibold">From person</th>
                                        <th className="pb-2 pr-4 font-semibold">Relationship type</th>
                                        <th className="pb-2 pr-4 font-semibold">To person</th>
                                        <th className="pb-2 pr-4 font-semibold">Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {personRelationships.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="py-4 text-[#59678b]">
                                                No person-to-person relationships yet. Add them from the Person drawer.
                                            </td>
                                        </tr>
                                    ) : (
                                        personRelationships.map((row) => (
                                            <tr key={row.id} className="border-b border-[#e6e8ec] align-middle">
                                                <td className="py-2 pr-4">
                                                    <LinkButton
                                                        label={row._from_person_name}
                                                        onClick={() => openDrawer({ type: "persons", id: row.from_person_id })}
                                                    />
                                                </td>
                                                <td className="py-2 pr-4 text-[#59678b]">{row._relationship_type_label ?? row.relationship_type ?? "—"}</td>
                                                <td className="py-2 pr-4">
                                                    <LinkButton
                                                        label={row._to_person_name}
                                                        onClick={() => openDrawer({ type: "persons", id: row.to_person_id })}
                                                    />
                                                </td>
                                                <td className="py-2 pr-4 text-[#59678b]">{row.created_at ? formatDateTime(row.created_at) : "—"}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </SectionCard>
                </div>
            )}
        </>
    );
}
