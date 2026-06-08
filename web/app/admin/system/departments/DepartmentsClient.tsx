"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import RuntimeMetadataReadOnlyPanel from "@/components/adminV2/settings/RuntimeMetadataReadOnlyPanel";

export type DepartmentRow = {
    id: string;
    org_id: string;
    key: string;
    name: string;
    description: string | null;
    sort_order: number;
    is_active: boolean;
    /** JSONB — attention rules, activity signals, tenant_slice, etc. (read-only in Settings UI). */
    metadata?: unknown;
    created_at: string;
    updated_at: string | null;
};

const KEY_REGEX = /^[a-z0-9_]{2,64}$/;

export default function DepartmentsClient({ adminV2Chrome = false }: { adminV2Chrome?: boolean } = {}) {
    const { canMutate } = useAdminAuth();
    const [items, setItems] = useState<DepartmentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalId, setModalId] = useState<string | null>(null);
    const [modalKey, setModalKey] = useState("");
    const [modalName, setModalName] = useState("");
    const [modalDescription, setModalDescription] = useState("");
    const [modalSortOrder, setModalSortOrder] = useState(0);
    const [modalActive, setModalActive] = useState(true);
    /** Effective metadata from list API — not edited in this modal */
    const [modalMetadata, setModalMetadata] = useState<unknown>(null);
    const [modalSaving, setModalSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/departments");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load");
            setItems((json as { items?: DepartmentRow[] }).items ?? []);
        } catch (e) {
            setError((e as Error).message);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const openCreate = () => {
        setModalId(null);
        setModalKey("");
        setModalName("");
        setModalDescription("");
        setModalSortOrder(0);
        setModalActive(true);
        setModalMetadata(null);
        setModalError(null);
        setModalOpen(true);
    };

    const openEdit = (row: DepartmentRow) => {
        setModalId(row.id);
        setModalKey(row.key);
        setModalName(row.name);
        setModalDescription(row.description ?? "");
        setModalSortOrder(row.sort_order);
        setModalActive(row.is_active);
        setModalMetadata(row.metadata ?? null);
        setModalError(null);
        setModalOpen(true);
    };

    const saveModal = async () => {
        if (!canMutate) return;
        const key = modalKey
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "");
        if (!key || !KEY_REGEX.test(key)) {
            setModalError("Key: 2–64 chars, lowercase letters, numbers, underscores only.");
            return;
        }
        if (!modalName.trim()) {
            setModalError("Name is required.");
            return;
        }

        setModalSaving(true);
        setModalError(null);
        try {
            if (modalId) {
                const res = await fetch(`/api/admin/departments/${modalId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        key,
                        name: modalName.trim(),
                        description: modalDescription.trim() || null,
                        sort_order: modalSortOrder,
                        is_active: modalActive,
                    }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
            } else {
                const res = await fetch("/api/admin/departments", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        key,
                        name: modalName.trim(),
                        description: modalDescription.trim() || null,
                        sort_order: modalSortOrder,
                        is_active: modalActive,
                    }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json as { error?: string }).error ?? "Create failed");
            }
            setModalOpen(false);
            await fetchItems();
        } catch (e) {
            setModalError((e as Error).message);
        } finally {
            setModalSaving(false);
        }
    };

    const remove = async (row: DepartmentRow) => {
        if (!canMutate) return;
        if (!window.confirm(`Delete department “${row.name}”? Work units must be removed first.`)) return;
        const res = await fetch(`/api/admin/departments/${row.id}`, { method: "DELETE" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert((json as { error?: string }).error ?? "Delete failed");
            return;
        }
        await fetchItems();
    };

    const addDeptAction = canMutate ? (
        <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-alloy-pine px-4 py-2 text-sm font-medium text-white hover:bg-alloy-pine/90"
        >
            Add department
        </button>
    ) : null;

    return (
        <div>
            {adminV2Chrome ? (
                <SettingsPageHeader
                    title="Departments"
                    subtitle="Business functions within your organization (hierarchy). Work units belong to departments."
                    actions={addDeptAction}
                />
            ) : (
                <AdminPageHeader
                    title="Departments"
                    subtitle="Business functions within your organization (hierarchy). Work units belong to departments."
                    actions={addDeptAction}
                />
            )}

            <SectionCard title="All departments">
                {loading ? (
                    <p className="text-sm text-alloy-forge/70">Loading…</p>
                ) : error ? (
                    <p className="text-sm text-red-600">{error}</p>
                ) : items.length === 0 ? (
                    <p className="text-sm text-alloy-forge/70">No departments yet. Create one to organize work units.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead>
                                <tr className="border-b border-admin-border text-alloy-forge/70">
                                    <th className="py-2 pr-4 font-medium">Name</th>
                                    <th className="py-2 pr-4 font-medium">Key</th>
                                    <th className="py-2 pr-4 font-medium">Sort</th>
                                    <th className="py-2 pr-4 font-medium">Active</th>
                                    <th className="py-2 pr-4 font-medium w-40">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((row) => (
                                    <tr key={row.id} className="border-b border-admin-border/60">
                                        <td className="py-2 pr-4 text-alloy-forge font-medium">{row.name}</td>
                                        <td className="py-2 pr-4 font-mono text-xs">{row.key}</td>
                                        <td className="py-2 pr-4">{row.sort_order}</td>
                                        <td className="py-2 pr-4">{row.is_active ? "Yes" : "No"}</td>
                                        <td className="py-2 pr-4 space-x-2">
                                            {canMutate ? (
                                                <>
                                                    <button type="button" className="text-alloy-pine text-sm font-medium" onClick={() => openEdit(row)}>
                                                        Edit
                                                    </button>
                                                    <button type="button" className="text-red-600 text-sm font-medium" onClick={() => remove(row)}>
                                                        Delete
                                                    </button>
                                                </>
                                            ) : (
                                                <span className="text-alloy-forge/50 text-sm">View only</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>

            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-alloy-midnight/40 overflow-y-auto">
                    <div className="bg-admin-surface-card border border-admin-border rounded-xl shadow-lg max-w-2xl w-full p-6 my-8 max-h-[min(92vh,880px)] overflow-y-auto">
                        <h2 className="text-lg font-semibold text-alloy-forge">{modalId ? "Edit department" : "New department"}</h2>
                        <div className="mt-4 space-y-3">
                            <label className="block text-sm">
                                <span className="text-alloy-forge/80">Key</span>
                                <input
                                    className="mt-1 w-full border border-admin-border rounded-md px-3 py-2 text-sm"
                                    value={modalKey}
                                    onChange={(e) => setModalKey(e.target.value)}
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-alloy-forge/80">Name</span>
                                <input
                                    className="mt-1 w-full border border-admin-border rounded-md px-3 py-2 text-sm"
                                    value={modalName}
                                    onChange={(e) => setModalName(e.target.value)}
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-alloy-forge/80">Description</span>
                                <textarea
                                    className="mt-1 w-full border border-admin-border rounded-md px-3 py-2 text-sm min-h-[72px]"
                                    value={modalDescription}
                                    onChange={(e) => setModalDescription(e.target.value)}
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="text-alloy-forge/80">Sort order</span>
                                <input
                                    type="number"
                                    className="mt-1 w-full border border-admin-border rounded-md px-3 py-2 text-sm"
                                    value={modalSortOrder}
                                    onChange={(e) => setModalSortOrder(Number(e.target.value))}
                                />
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={modalActive} onChange={(e) => setModalActive(e.target.checked)} />
                                <span>Active</span>
                            </label>
                            <RuntimeMetadataReadOnlyPanel metadata={modalMetadata} entity="department" isNewRow={!modalId} />
                            {modalError ? <p className="text-sm text-red-600">{modalError}</p> : null}
                        </div>
                        <div className="mt-6 flex justify-end gap-2">
                            <button type="button" className="px-4 py-2 text-sm border border-admin-border rounded-lg" onClick={() => setModalOpen(false)}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={modalSaving || !canMutate}
                                className="px-4 py-2 text-sm bg-alloy-pine text-white rounded-lg disabled:opacity-50"
                                onClick={saveModal}
                            >
                                {modalSaving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
