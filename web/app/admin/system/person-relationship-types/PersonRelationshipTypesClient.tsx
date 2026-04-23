"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminVertical } from "@/contexts/AdminVerticalContext";
import type { PersonRelationshipTypeSetting } from "@/app/api/admin/person-relationship-type-settings/route";

const KEY_REGEX = /^[a-z0-9_]{2,64}$/;

type IndustryOption = { id: string; key: string; label: string };

const REL_TYPES_SUBTITLE =
    "Types for person-to-person relationships. Defaults are driven by your org industry (Entity Labels). Stored in person_relationships.relationship_type.";

export default function PersonRelationshipTypesClient({
    adminV2Chrome = false,
    omitOuterHeader = false,
}: {
    adminV2Chrome?: boolean;
    omitOuterHeader?: boolean;
} = {}) {
    const { canMutate } = useAdminAuth();
    const { verticals } = useAdminVertical();
    const [industries, setIndustries] = useState<IndustryOption[]>([]);
    const [items, setItems] = useState<PersonRelationshipTypeSetting[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [showAll, setShowAll] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [modalId, setModalId] = useState<string | null>(null);
    const [modalKey, setModalKey] = useState("");
    const [modalLabel, setModalLabel] = useState("");
    const [modalDescription, setModalDescription] = useState("");
    const [modalSortOrder, setModalSortOrder] = useState(100);
    const [modalActive, setModalActive] = useState(true);
    const [modalSaving, setModalSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const url = showAll ? "/api/admin/person-relationship-type-settings?all=true" : "/api/admin/person-relationship-type-settings";
            const res = await fetch(url);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load");
            setItems((json as { items?: PersonRelationshipTypeSetting[] }).items ?? []);
        } catch (e) {
            setError((e as Error).message);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [showAll]);

    const fetchIndustries = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/industries");
            const json = await res.json().catch(() => ({}));
            if (res.ok) setIndustries((json as { industries?: IndustryOption[] }).industries ?? []);
        } catch {
            setIndustries([]);
        }
    }, []);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    useEffect(() => {
        fetchIndustries();
    }, [fetchIndustries]);

    const openCreate = () => {
        setModalId(null);
        setModalKey("");
        setModalLabel("");
        setModalDescription("");
        setModalSortOrder(100);
        setModalActive(true);
        setModalError(null);
        setModalOpen(true);
    };

    const openEdit = (row: PersonRelationshipTypeSetting) => {
        setModalId(row.id);
        setModalKey(row.key);
        setModalLabel(row.label ?? "");
        setModalDescription(row.description ?? "");
        setModalSortOrder(row.sort_order);
        setModalActive(row.is_active);
        setModalError(null);
        setModalOpen(true);
    };

    const saveModal = async () => {
        if (!canMutate) return;
        const key = modalKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
        if (!key) {
            setModalError("Key is required.");
            return;
        }
        if (!KEY_REGEX.test(key)) {
            setModalError("Key must be 2–64 characters: lowercase letters, numbers, underscores only.");
            return;
        }
        if (!modalLabel.trim()) {
            setModalError("Label is required.");
            return;
        }

        setModalSaving(true);
        setModalError(null);
        try {
            if (modalId) {
                const res = await fetch(`/api/admin/person-relationship-type-settings/${modalId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        label: modalLabel.trim() || null,
                        description: modalDescription.trim() || null,
                        sort_order: modalSortOrder,
                        is_active: modalActive,
                    }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
            } else {
                const res = await fetch("/api/admin/person-relationship-type-settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        key,
                        label: modalLabel.trim() || null,
                        description: modalDescription.trim() || null,
                        sort_order: modalSortOrder,
                        is_active: modalActive,
                    }),
                });
                const json = await res.json().catch(() => ({}));
                if (res.status === 409) {
                    setModalError((json as { error?: string }).error ?? "Key already exists.");
                    return;
                }
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

    const isEdit = !!modalId;

    const addRelBtn = canMutate ? (
        <button
            type="button"
            onClick={openCreate}
            className="shrink-0 rounded-md bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
            Add Relationship Type
        </button>
    ) : null;

    const sectionSurface = adminV2Chrome ? ({ surfaceTone: "settingsPanel" as const, accentClassName: "border-l-alloy-pine/55" }) : {};

    const pageHeader =
        omitOuterHeader && adminV2Chrome ? (
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/50">Person-to-person types</h3>
                {addRelBtn}
            </div>
        ) : adminV2Chrome ? (
            <SettingsPageHeader title="Relationship Types" subtitle={REL_TYPES_SUBTITLE} actions={addRelBtn} className="mb-4" />
        ) : (
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <AdminPageHeader title="Relationship Types" subtitle={REL_TYPES_SUBTITLE} />
                {addRelBtn}
            </div>
        );

    return (
        <>
            {pageHeader}

            {loading && <p className="text-sm text-alloy-midnight/55">Loading…</p>}
            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {error}
                </div>
            )}

            {!loading && !error && (
                <SectionCard title="Relationship types" {...sectionSurface}>
                    <div className="mb-3 flex items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-[#59678b]">
                            <input
                                type="checkbox"
                                checked={showAll}
                                onChange={(e) => setShowAll(e.target.checked)}
                                className="rounded border-[#c4c8cc]"
                            />
                            Show all configured rows
                        </label>
                        <span className="text-xs text-[#8a8f98]">
                            {showAll ? "Showing every relationship type in this org." : "Showing only options effective for your org industry (and universal)."}
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[600px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-[#e6e8ec] text-[#59678b]">
                                    <th className="pb-2 pr-4 font-semibold">Key</th>
                                    <th className="pb-2 pr-4 font-semibold">Label</th>
                                    <th className="pb-2 pr-4 font-semibold">Description</th>
                                    <th className="pb-2 pr-4 font-semibold">Sort</th>
                                    <th className="pb-2 pr-4 font-semibold">Industry</th>
                                    <th className="pb-2 pr-4 font-semibold">Vertical</th>
                                    <th className="pb-2 pr-4 font-semibold">Active</th>
                                    <th className="pb-2 pr-4 font-semibold">System</th>
                                    {canMutate && <th className="pb-2 font-semibold">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {items.length === 0 ? (
                                    <tr>
                                        <td colSpan={canMutate ? 9 : 8} className="py-4 text-[#59678b]">
                                            No relationship types. Add one to get started. Options shown in forms follow your org industry (Entity Labels).
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((row) => (
                                        <tr key={row.id} className="border-b border-[#e6e8ec] align-middle">
                                            <td className="py-2 pr-4 font-mono text-[#59678b]">{row.key}</td>
                                            <td className="py-2 pr-4 font-medium text-[#31394d]">{row.label ?? "—"}</td>
                                            <td className="py-2 pr-4 text-[#59678b] max-w-[200px] truncate"
                                                title={row.description ?? undefined}>
                                                {row.description ?? "—"}
                                            </td>
                                            <td className="py-2 pr-4 text-[#59678b]">{row.sort_order}</td>
                                            <td className="py-2 pr-4 text-[#59678b]">
                                                {row.industry_id ? (industries.find((i) => i.id === row.industry_id)?.label ?? row.industry_id.slice(0, 8)) : "Universal"}
                                            </td>
                                            <td className="py-2 pr-4 text-[#59678b]">
                                                {row.vertical_id ? (verticals.find((v) => v.id === row.vertical_id)?.name ?? row.vertical_id.slice(0, 8)) : "—"}
                                            </td>
                                            <td className="py-2 pr-4">{row.is_active ? "Yes" : "No"}</td>
                                            <td className="py-2 pr-4">{row.is_system ? "Yes" : "—"}</td>
                                            {canMutate && (
                                                <td className="py-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEdit(row)}
                                                        className="rounded border border-alloy-stone/50 px-2 py-1 text-xs font-medium hover:bg-alloy-stone/20"
                                                    >
                                                        Edit
                                                    </button>
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
                        <h3 className="mb-4 text-lg font-semibold text-[#31394d]">
                            {modalId ? "Edit Relationship Type" : "Add Relationship Type"}
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Key</label>
                                <input
                                    type="text"
                                    value={modalKey}
                                    onChange={(e) => setModalKey(e.target.value)}
                                    placeholder="e.g. spouse"
                                    disabled={isEdit}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm disabled:opacity-60"
                                />
                                {isEdit && <p className="mt-0.5 text-xs text-[#59678b]">Key cannot be changed after create.</p>}
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Label</label>
                                <input
                                    type="text"
                                    value={modalLabel}
                                    onChange={(e) => setModalLabel(e.target.value)}
                                    placeholder="Display name"
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Description (optional)</label>
                                <input
                                    type="text"
                                    value={modalDescription}
                                    onChange={(e) => setModalDescription(e.target.value)}
                                    placeholder="Optional description"
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Sort order</label>
                                <input
                                    type="number"
                                    value={modalSortOrder}
                                    onChange={(e) => setModalSortOrder(Number(e.target.value) || 0)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            {modalId && (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="prt-modal-active"
                                        checked={modalActive}
                                        onChange={(e) => setModalActive(e.target.checked)}
                                    />
                                    <label htmlFor="prt-modal-active" className="text-sm text-[#31394d]">Active</label>
                                </div>
                            )}
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
                                onClick={saveModal}
                                disabled={modalSaving}
                                className="rounded bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                                {modalSaving ? "Saving…" : modalId ? "Save" : "Create"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
