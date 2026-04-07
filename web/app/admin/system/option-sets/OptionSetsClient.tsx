"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import PrimaryButton from "@/components/PrimaryButton";
import type { OptionSetListRow } from "@/app/api/admin/option-sets/route";

const SET_KEY_REGEX = /^[a-z0-9_]{2,64}$/;

export default function OptionSetsClient() {
    const { canMutate } = useAdminAuth();
    const [items, setItems] = useState<OptionSetListRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalSetKey, setModalSetKey] = useState("");
    const [modalLabel, setModalLabel] = useState("");
    const [modalSortOrder, setModalSortOrder] = useState(0);
    const [modalSaving, setModalSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/option-sets");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load");
            setItems((json as { option_sets?: OptionSetListRow[] }).option_sets ?? []);
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
        setModalSetKey("");
        setModalLabel("");
        setModalSortOrder(0);
        setModalError(null);
        setModalOpen(true);
    };

    const saveCreate = async () => {
        if (!canMutate) return;
        const set_key = modalSetKey
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, "")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "");
        if (!SET_KEY_REGEX.test(set_key)) {
            setModalError("Set key: 2–64 chars, lowercase letters, numbers, underscores only.");
            return;
        }
        if (!modalLabel.trim()) {
            setModalError("Label is required.");
            return;
        }
        setModalSaving(true);
        setModalError(null);
        try {
            const res = await fetch("/api/admin/option-sets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    set_key,
                    label: modalLabel.trim(),
                    sort_order: modalSortOrder,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error((json as { error?: string }).error ?? "Create failed");
            }
            setModalOpen(false);
            await fetchItems();
        } catch (e) {
            setModalError((e as Error).message);
        } finally {
            setModalSaving(false);
        }
    };

    const deleteSet = async (row: OptionSetListRow) => {
        if (!canMutate) return;
        setDeleteError(null);
        if (!window.confirm(`Delete option set "${row.set_key}" and all its items?`)) return;
        try {
            const res = await fetch(`/api/admin/option-sets/${encodeURIComponent(row.set_key)}`, {
                method: "DELETE",
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg = (json as { error?: string }).error ?? "Delete failed";
                const blockers = (json as { usage_blockers?: unknown[] }).usage_blockers;
                if (res.status === 409 && Array.isArray(blockers) && blockers.length > 0) {
                    setDeleteError(
                        `${msg} Remove references from field definitions or pricing dimensions first.`
                    );
                } else {
                    setDeleteError(msg);
                }
                return;
            }
            await fetchItems();
        } catch (e) {
            setDeleteError((e as Error).message);
        }
    };

    return (
        <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <AdminPageHeader
                    title="Option sets"
                    subtitle="Org-scoped lists for select fields, booking, and pricing dimensions. Keys are stable identifiers."
                />
                {canMutate && <PrimaryButton onClick={openCreate}>New option set</PrimaryButton>}
            </div>

            {loading && <p className="text-sm text-[#59678b]">Loading…</p>}
            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
            )}

            {!loading && !error && (
                <SectionCard title="All sets">
                    {deleteError && (
                        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {deleteError}
                        </div>
                    )}
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-[#e6e8ec] text-[#59678b]">
                                    <th className="pb-2 pr-4 font-semibold">Set key</th>
                                    <th className="pb-2 pr-4 font-semibold">Label</th>
                                    <th className="pb-2 pr-4 font-semibold">Items</th>
                                    <th className="pb-2 pr-4 font-semibold">Sort</th>
                                    {canMutate && <th className="pb-2 font-semibold">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {items.length === 0 ? (
                                    <tr>
                                        <td colSpan={canMutate ? 5 : 4} className="py-4 text-[#59678b]">
                                            No option sets yet. Create one or run database seeds.
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((row) => (
                                        <tr key={row.id} className="border-b border-[#e6e8ec] align-middle">
                                            <td className="py-2 pr-4 font-mono text-[#59678b]">{row.set_key}</td>
                                            <td className="py-2 pr-4 font-medium text-[#31394d]">{row.label}</td>
                                            <td className="py-2 pr-4 text-[#59678b]">{row.item_count}</td>
                                            <td className="py-2 pr-4 text-[#59678b]">{row.sort_order}</td>
                                            {canMutate && (
                                                <td className="py-2">
                                                    <div className="flex flex-wrap gap-2">
                                                        <Link
                                                            href={`/admin/system/option-sets/${encodeURIComponent(row.set_key)}`}
                                                            className="rounded border border-alloy-stone/50 px-2 py-1 text-xs font-medium hover:bg-alloy-stone/20"
                                                        >
                                                            Edit items
                                                        </Link>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteSet(row)}
                                                            className="rounded border border-alloy-ember/40 px-2 py-1 text-xs font-medium text-alloy-ember hover:bg-alloy-ember/10"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </SectionCard>
            )}

            {modalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => !modalSaving && setModalOpen(false)}
                >
                    <div
                        className="w-full max-w-md rounded-lg border border-[#e6e8ec] bg-white p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="mb-3 text-lg font-semibold text-[#31394d]">New option set</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Set key</label>
                                <input
                                    type="text"
                                    value={modalSetKey}
                                    onChange={(e) => setModalSetKey(e.target.value)}
                                    placeholder="e.g. home_type"
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 font-mono text-sm"
                                />
                                <p className="mt-0.5 text-xs text-[#59678b]">Stable ID; cannot be changed later.</p>
                            </div>
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Label</label>
                                <input
                                    type="text"
                                    value={modalLabel}
                                    onChange={(e) => setModalLabel(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Sort order</label>
                                <input
                                    type="number"
                                    value={modalSortOrder}
                                    onChange={(e) => setModalSortOrder(Number(e.target.value) || 0)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                        </div>
                        {modalError && <p className="mt-2 text-sm text-red-600">{modalError}</p>}
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => !modalSaving && setModalOpen(false)}
                                className="rounded border border-[#e6e8ec] px-3 py-1.5 text-sm font-medium hover:bg-[#eef0f4]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={saveCreate}
                                disabled={modalSaving}
                                className="rounded bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                                {modalSaving ? "Saving…" : "Create"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
