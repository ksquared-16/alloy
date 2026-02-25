"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import DataTable from "@/components/admin/DataTable";
import Drawer from "@/components/admin/Drawer";
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

type Customer = { id: string; name: string | null };

export default function CustomerMembersClient() {
    const { labels } = useEntityLabels();
    const plural = labels.customer_members?.plural ?? "Members";
    const singular = labels.customer_members?.singular ?? "Member";

    const searchParams = useSearchParams();
    const customerIdFromUrl = searchParams.get("customer_id")?.trim() || undefined;

    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [newOpen, setNewOpen] = useState(false);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const { canMutate } = useAdminAuth();

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

    const fetchCustomers = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/customers");
            const json = await res.json().catch(() => ({}));
            if (res.ok && Array.isArray(json)) {
                setCustomers((json as { id: string; name: string | null }[]).map((c) => ({ id: c.id, name: c.name ?? null })));
            } else if (res.ok && (json as { customers?: Customer[] }).customers) {
                setCustomers((json as { customers: Customer[] }).customers);
            } else {
                setCustomers([]);
            }
        } catch {
            setCustomers([]);
        }
    }, []);

    useEffect(() => {
        fetchMembers(customerIdFromUrl);
    }, [fetchMembers, customerIdFromUrl]);

    useEffect(() => {
        if (customerIdFromUrl) {
            setNewOpen(true);
            setSelectedId(null);
        }
    }, [customerIdFromUrl]);

    useEffect(() => {
        if (newOpen) fetchCustomers();
    }, [newOpen, fetchCustomers]);

    const selected = selectedId ? members.find((m) => m.id === selectedId) : null;
    const isDrawerOpen = !!selected || newOpen;

    const columns = [
        { key: "display_name", label: "Name", sortable: true, render: (_: unknown, r: Member) => r.display_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "—" },
        { key: "relationship", label: "Relationship", sortable: true, render: (v: string | null) => v || "—" },
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
                    onClick={() => { setSelectedId(null); setNewOpen(true); }}
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
                    onRowClick={(row) => { setSelectedId(row.id); setNewOpen(false); }}
                />
            )}

            <Drawer
                isOpen={isDrawerOpen}
                onClose={() => { setSelectedId(null); setNewOpen(false); }}
                title={selected ? `${singular}: ${selected.display_name || selected.id}` : `New ${singular}`}
            >
                {selected ? (
                    <MemberDetail
                        member={selected}
                        singular={singular}
                        canMutate={canMutate}
                        onClose={() => setSelectedId(null)}
                        onSaved={() => fetchMembers()}
                    />
                ) : newOpen ? (
                    <MemberForm
                        customers={customers}
                        singular={singular}
                        canMutate={canMutate}
                        defaultCustomerId={customerIdFromUrl}
                        onClose={() => setNewOpen(false)}
                        onSaved={() => { setNewOpen(false); fetchMembers(customerIdFromUrl); }}
                    />
                ) : null}
            </Drawer>
        </div>
    );
}

function MemberDetail({
    member,
    singular,
    canMutate,
    onClose,
    onSaved,
}: {
    member: Member;
    singular: string;
    canMutate: boolean;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [display_name, setDisplayName] = useState(member.display_name ?? "");
    const [relationship, setRelationship] = useState(member.relationship ?? "");
    const [first_name, setFirstName] = useState(member.first_name ?? "");
    const [last_name, setLastName] = useState(member.last_name ?? "");
    const [dob, setDob] = useState(member.dob ?? "");
    const [is_active, setIsActive] = useState(member.is_active);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!display_name.trim()) { setFormError("Display name is required"); return; }
        setSaving(true);
        setFormError(null);
        try {
            const res = await fetch(`/api/admin/customer-members/${member.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    display_name: display_name.trim(),
                    relationship: relationship.trim() || null,
                    first_name: first_name.trim() || null,
                    last_name: last_name.trim() || null,
                    dob: dob.trim() || null,
                    is_active,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
            setEditing(false);
            onSaved();
        } catch (e) {
            setFormError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm(`Delete this ${singular.toLowerCase()}?`)) return;
        setDeleting(true);
        setFormError(null);
        try {
            const res = await fetch(`/api/admin/customer-members/${member.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Delete failed");
            onClose();
            onSaved();
        } catch (e) {
            setFormError((e as Error).message);
        } finally {
            setDeleting(false);
        }
    };

    if (editing) {
        return (
            <form onSubmit={handleSave} className="space-y-4">
                {formError && <p className="text-sm text-red-600">{formError}</p>}
                <div><strong className="text-alloy-midnight/70">ID</strong> {member.id}</div>
                <div><strong className="text-alloy-midnight/70">Customer ID</strong> {member.customer_id}</div>
                <div>
                    <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">Display name *</label>
                    <input value={display_name} onChange={(e) => setDisplayName(e.target.value)} className="w-full rounded border border-alloy-stone/40 px-3 py-2 text-sm" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">Relationship</label>
                    <input value={relationship} onChange={(e) => setRelationship(e.target.value)} className="w-full rounded border border-alloy-stone/40 px-3 py-2 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">First name</label>
                        <input value={first_name} onChange={(e) => setFirstName(e.target.value)} className="w-full rounded border border-alloy-stone/40 px-3 py-2 text-sm" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">Last name</label>
                        <input value={last_name} onChange={(e) => setLastName(e.target.value)} className="w-full rounded border border-alloy-stone/40 px-3 py-2 text-sm" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">DOB</label>
                    <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="w-full rounded border border-alloy-stone/40 px-3 py-2 text-sm" />
                </div>
                <label className="flex items-center gap-2">
                    <input type="checkbox" checked={is_active} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
                    <span className="text-sm">Active</span>
                </label>
                <div className="flex gap-2 pt-2">
                    <button type="submit" disabled={saving} className="rounded bg-alloy-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save</button>
                    <button type="button" onClick={() => setEditing(false)} className="rounded border border-alloy-stone/50 px-4 py-2 text-sm font-medium">Cancel</button>
                </div>
            </form>
        );
    }

    return (
        <div className="space-y-4">
            <div><strong className="text-alloy-midnight/70">ID</strong> {member.id}</div>
            <div><strong className="text-alloy-midnight/70">Display name</strong> {member.display_name ?? "—"}</div>
            <div><strong className="text-alloy-midnight/70">Relationship</strong> {member.relationship ?? "—"}</div>
            <div><strong className="text-alloy-midnight/70">First name</strong> {member.first_name ?? "—"}</div>
            <div><strong className="text-alloy-midnight/70">Last name</strong> {member.last_name ?? "—"}</div>
            <div><strong className="text-alloy-midnight/70">DOB</strong> {member.dob ?? "—"}</div>
            <div><strong className="text-alloy-midnight/70">Active</strong> {member.is_active ? "Yes" : "No"}</div>
            <div><strong className="text-alloy-midnight/70">Created</strong> {new Date(member.created_at).toLocaleString()}</div>
            <div><strong className="text-alloy-midnight/70">Customer ID</strong> {member.customer_id}</div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            {canMutate && (
                <div className="flex gap-2 pt-2 border-t border-alloy-stone/30">
                    <button type="button" onClick={() => setEditing(true)} className="rounded bg-alloy-blue px-4 py-2 text-sm font-medium text-white">Edit</button>
                    <button type="button" onClick={handleDelete} disabled={deleting} className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">Delete</button>
                </div>
            )}
        </div>
    );
}

function MemberForm({
    customers,
    singular,
    canMutate,
    onClose,
    onSaved,
    defaultCustomerId,
}: {
    customers: Customer[];
    singular: string;
    canMutate: boolean;
    onClose: () => void;
    onSaved: () => void;
    defaultCustomerId?: string;
}) {
    const [display_name, setDisplayName] = useState("");
    const [relationship, setRelationship] = useState("");
    const [first_name, setFirstName] = useState("");
    const [last_name, setLastName] = useState("");
    const [dob, setDob] = useState("");
    const [customer_id, setCustomerId] = useState(defaultCustomerId ?? "");
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        if (defaultCustomerId) setCustomerId(defaultCustomerId);
    }, [defaultCustomerId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!display_name.trim()) { setFormError("Display name is required"); return; }
        if (!customer_id) { setFormError("Customer is required"); return; }
        setSaving(true);
        setFormError(null);
        try {
            const res = await fetch("/api/admin/customer-members", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    customer_id,
                    display_name: display_name.trim(),
                    relationship: relationship.trim() || null,
                    first_name: first_name.trim() || null,
                    last_name: last_name.trim() || null,
                    dob: dob.trim() || null,
                    is_active: true,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Create failed");
            onSaved();
        } catch (e) {
            setFormError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div>
                <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">Customer *</label>
                <select
                    value={customer_id}
                    onChange={(e) => setCustomerId(e.target.value)}
                    required
                    className="w-full rounded border border-alloy-stone/40 px-3 py-2 text-sm"
                >
                    <option value="">Select customer</option>
                    {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name || c.id}</option>
                    ))}
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">Display name *</label>
                <input value={display_name} onChange={(e) => setDisplayName(e.target.value)} className="w-full rounded border border-alloy-stone/40 px-3 py-2 text-sm" required />
            </div>
            <div>
                <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">Relationship</label>
                <input value={relationship} onChange={(e) => setRelationship(e.target.value)} className="w-full rounded border border-alloy-stone/40 px-3 py-2 text-sm" placeholder="e.g. Child" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">First name</label>
                    <input value={first_name} onChange={(e) => setFirstName(e.target.value)} className="w-full rounded border border-alloy-stone/40 px-3 py-2 text-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">Last name</label>
                    <input value={last_name} onChange={(e) => setLastName(e.target.value)} className="w-full rounded border border-alloy-stone/40 px-3 py-2 text-sm" />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-alloy-midnight/80 mb-1">DOB</label>
                <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="w-full rounded border border-alloy-stone/40 px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2 pt-2">
                <button type="submit" disabled={saving || !canMutate} className="rounded bg-alloy-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                    {saving ? "Creating…" : "Create"}
                </button>
                <button type="button" onClick={onClose} className="rounded border border-alloy-stone/50 px-4 py-2 text-sm font-medium">
                    Cancel
                </button>
            </div>
        </form>
    );
}
