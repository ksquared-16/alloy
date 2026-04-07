"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import PrimaryButton from "@/components/PrimaryButton";
import type { OptionSetUsageBlocker } from "@/lib/admin/collectOptionSetUsage";
import { uniqueAdminKey } from "@/lib/admin/slugifyAdminKey";

const ITEM_KEY_REGEX = /^[a-z0-9_]{2,64}$/;

function sanitizeItemKeyInput(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

async function readApiError(res: Response): Promise<string> {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return typeof json.error === "string" && json.error.trim() ? json.error.trim() : `Request failed (${res.status})`;
}

type SetRow = {
    id: string;
    set_key: string;
    label: string;
    sort_order: number;
};

type ItemRow = {
    id: string;
    item_key: string;
    label: string;
    sort_order: number;
    metadata: Record<string, unknown>;
};

export default function OptionSetDetailClient({ setKey }: { setKey: string }) {
    const { canMutate } = useAdminAuth();
    const [setRow, setSetRow] = useState<SetRow | null>(null);
    const [items, setItems] = useState<ItemRow[]>([]);
    const [blockers, setBlockers] = useState<OptionSetUsageBlocker[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [editLabel, setEditLabel] = useState("");
    const [editSortOrder, setEditSortOrder] = useState(0);
    const [setSaving, setSetSaving] = useState(false);
    const [setSaveError, setSetSaveError] = useState<string | null>(null);

    const [itemModalOpen, setItemModalOpen] = useState(false);
    const [itemModalId, setItemModalId] = useState<string | null>(null);
    const [itemModalKeyOverride, setItemModalKeyOverride] = useState("");
    const [itemModalLabel, setItemModalLabel] = useState("");
    const [itemModalSort, setItemModalSort] = useState(0);
    const [itemModalMeta, setItemModalMeta] = useState("{}");
    const [itemModalAdvanced, setItemModalAdvanced] = useState(false);
    const [itemSaving, setItemSaving] = useState(false);
    const [itemError, setItemError] = useState<string | null>(null);

    const encodedKey = encodeURIComponent(setKey);

    const reservedItemKeys = useMemo(() => new Set(items.map((i) => i.item_key)), [items]);

    const previewCreateItemKey = useMemo(() => {
        if (!itemModalLabel.trim()) return "";
        return uniqueAdminKey(itemModalLabel, reservedItemKeys);
    }, [itemModalLabel, reservedItemKeys]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/option-sets/${encodedKey}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load");
            const s = json.set as SetRow;
            setSetRow(s);
            setEditLabel(s.label);
            setEditSortOrder(s.sort_order);
            setItems(
                ((json.items ?? []) as Record<string, unknown>[]).map((r) => ({
                    id: String(r.id),
                    item_key: String(r.item_key),
                    label: String(r.label),
                    sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
                    metadata:
                        r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                            ? (r.metadata as Record<string, unknown>)
                            : {},
                }))
            );
            setBlockers((json.usage_blockers as OptionSetUsageBlocker[]) ?? []);
        } catch (e) {
            setError((e as Error).message);
            setSetRow(null);
            setItems([]);
            setBlockers([]);
        } finally {
            setLoading(false);
        }
    }, [encodedKey]);

    useEffect(() => {
        load();
    }, [load]);

    const saveSet = async () => {
        if (!canMutate || !setRow) return;
        setSetSaving(true);
        setSetSaveError(null);
        try {
            const res = await fetch(`/api/admin/option-sets/${encodedKey}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: editLabel.trim(), sort_order: editSortOrder }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
            await load();
        } catch (e) {
            setSetSaveError((e as Error).message);
        } finally {
            setSetSaving(false);
        }
    };

    const openCreateItem = () => {
        setItemModalId(null);
        setItemModalKeyOverride("");
        setItemModalLabel("");
        setItemModalSort(items.length ? Math.max(...items.map((i) => i.sort_order), 0) + 10 : 0);
        setItemModalMeta("{}");
        setItemModalAdvanced(false);
        setItemError(null);
        setItemModalOpen(true);
    };

    const openEditItem = (row: ItemRow) => {
        setItemModalId(row.id);
        setItemModalKeyOverride("");
        setItemModalLabel(row.label);
        setItemModalSort(row.sort_order);
        try {
            setItemModalMeta(JSON.stringify(row.metadata ?? {}, null, 2));
        } catch {
            setItemModalMeta("{}");
        }
        setItemModalAdvanced(false);
        setItemError(null);
        setItemModalOpen(true);
    };

    const resolveCreateItemKey = (): { item_key: string } | { error: string } => {
        if (!itemModalLabel.trim()) return { error: "Label is required." };

        if (itemModalAdvanced && itemModalKeyOverride.trim()) {
            const manual = sanitizeItemKeyInput(itemModalKeyOverride);
            if (!ITEM_KEY_REGEX.test(manual)) {
                return { error: "Item key: 2–64 chars, lowercase letters, numbers, underscores." };
            }
            return { item_key: manual };
        }

        const key = uniqueAdminKey(itemModalLabel, reservedItemKeys);
        if (!ITEM_KEY_REGEX.test(key)) {
            return { error: "Could not derive a valid item key from the label." };
        }
        return { item_key: key };
    };

    const saveItem = async () => {
        if (!canMutate) return;
        setItemSaving(true);
        setItemError(null);
        try {
            if (itemModalId) {
                const patchBody: Record<string, unknown> = {
                    label: itemModalLabel.trim(),
                    sort_order: itemModalSort,
                };
                if (itemModalAdvanced) {
                    try {
                        const parsed = JSON.parse(itemModalMeta.trim() || "{}");
                        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
                            patchBody.metadata = parsed as Record<string, unknown>;
                        } else {
                            setItemError("metadata must be a JSON object.");
                            setItemSaving(false);
                            return;
                        }
                    } catch {
                        setItemError("metadata must be valid JSON object.");
                        setItemSaving(false);
                        return;
                    }
                }

                const res = await fetch(`/api/admin/option-sets/${encodedKey}/items/${itemModalId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(patchBody),
                });
                if (!res.ok) throw new Error(await readApiError(res));
            } else {
                const keyRes = resolveCreateItemKey();
                if ("error" in keyRes) {
                    setItemError(keyRes.error);
                    setItemSaving(false);
                    return;
                }
                const { item_key } = keyRes;

                let metadata: Record<string, unknown> = {};
                if (itemModalAdvanced) {
                    try {
                        const parsed = JSON.parse(itemModalMeta.trim() || "{}");
                        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
                            metadata = parsed as Record<string, unknown>;
                        } else {
                            setItemError("metadata must be a JSON object.");
                            setItemSaving(false);
                            return;
                        }
                    } catch {
                        setItemError("metadata must be valid JSON object.");
                        setItemSaving(false);
                        return;
                    }
                }

                const res = await fetch(`/api/admin/option-sets/${encodedKey}/items`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        item_key,
                        label: itemModalLabel.trim(),
                        sort_order: itemModalSort,
                        metadata,
                    }),
                });
                if (!res.ok) throw new Error(await readApiError(res));
            }
            setItemModalOpen(false);
            await load();
        } catch (e) {
            setItemError((e as Error).message);
        } finally {
            setItemSaving(false);
        }
    };

    const deleteItem = async (row: ItemRow) => {
        if (!canMutate) return;
        if (!window.confirm(`Remove item "${row.item_key}"?`)) return;
        try {
            const res = await fetch(`/api/admin/option-sets/${encodedKey}/items/${row.id}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error(await readApiError(res));
            await load();
        } catch (e) {
            setError((e as Error).message);
        }
    };

    if (loading) {
        return <p className="text-sm text-[#59678b]">Loading…</p>;
    }
    if (error && !setRow) {
        return (
            <div className="space-y-4">
                <Link href="/admin/system/option-sets" className="text-sm text-alloy-pine hover:underline">
                    ← Option sets
                </Link>
                <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
            </div>
        );
    }

    return (
        <>
            <div className="mb-4">
                <Link href="/admin/system/option-sets" className="text-sm text-alloy-pine hover:underline">
                    ← Option sets
                </Link>
            </div>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <AdminPageHeader title={setRow?.label ?? setKey} subtitle={`Set key: ${setKey}`} />
                {canMutate && <PrimaryButton onClick={openCreateItem}>Add item</PrimaryButton>}
            </div>

            {blockers.length > 0 && (
                <SectionCard title="Usage">
                    <p className="mb-2 text-sm text-[#59678b]">
                        This set is referenced elsewhere. You cannot delete the set until references are removed.
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-[#31394d]">
                        {blockers.map((b, i) =>
                            b.kind === "field_definition" ? (
                                <li key={`fd-${b.id}-${i}`}>
                                    Field <span className="font-mono">{b.entity_type}.{b.field_key}</span>
                                </li>
                            ) : (
                                <li key={`pd-${b.id}-${i}`}>
                                    Pricing dimension <span className="font-mono">{b.dimension_key}</span>
                                </li>
                            )
                        )}
                    </ul>
                </SectionCard>
            )}

            {setRow && canMutate && (
                <SectionCard title="Set details">
                    <div className="grid max-w-xl gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Label</label>
                            <input
                                type="text"
                                value={editLabel}
                                onChange={(e) => setEditLabel(e.target.value)}
                                className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                            />
                        </div>
                        <div>
                            <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Sort order</label>
                            <input
                                type="number"
                                value={editSortOrder}
                                onChange={(e) => setEditSortOrder(Number(e.target.value) || 0)}
                                className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                            />
                        </div>
                    </div>
                    {setSaveError && <p className="mt-2 text-sm text-red-600">{setSaveError}</p>}
                    <button
                        type="button"
                        onClick={saveSet}
                        disabled={setSaving}
                        className="mt-3 rounded bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                        {setSaving ? "Saving…" : "Save set"}
                    </button>
                </SectionCard>
            )}

            <SectionCard title="Items">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                        <thead>
                            <tr className="border-b border-[#e6e8ec] text-[#59678b]">
                                <th className="pb-2 pr-4 font-semibold">Item key</th>
                                <th className="pb-2 pr-4 font-semibold">Label</th>
                                <th className="pb-2 pr-4 font-semibold">Sort</th>
                                {canMutate && <th className="pb-2 font-semibold">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan={canMutate ? 4 : 3} className="py-4 text-[#59678b]">
                                        No items yet.
                                    </td>
                                </tr>
                            ) : (
                                items.map((row) => (
                                    <tr key={row.id} className="border-b border-[#e6e8ec] align-middle">
                                        <td className="py-2 pr-4 font-mono text-[#59678b]">{row.item_key}</td>
                                        <td className="py-2 pr-4 font-medium text-[#31394d]">{row.label}</td>
                                        <td className="py-2 pr-4 text-[#59678b]">{row.sort_order}</td>
                                        {canMutate && (
                                            <td className="py-2">
                                                <div className="flex flex-wrap gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEditItem(row)}
                                                        className="rounded border border-alloy-stone/50 px-2 py-1 text-xs font-medium hover:bg-alloy-stone/20"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteItem(row)}
                                                        className="rounded border border-alloy-ember/40 px-2 py-1 text-xs font-medium text-alloy-ember hover:bg-alloy-ember/10"
                                                    >
                                                        Remove
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

            {itemModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => !itemSaving && setItemModalOpen(false)}
                >
                    <div
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[#e6e8ec] bg-white p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="mb-3 text-lg font-semibold text-[#31394d]">
                            {itemModalId ? "Edit item" : "New item"}
                        </h3>
                        <div className="space-y-3">
                            {itemModalId && (
                                <div>
                                    <span className="text-xs text-[#59678b]">Item key</span>
                                    <p className="font-mono text-sm text-[#31394d]">{items.find((i) => i.id === itemModalId)?.item_key ?? ""}</p>
                                </div>
                            )}
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Label</label>
                                <input
                                    type="text"
                                    value={itemModalLabel}
                                    onChange={(e) => setItemModalLabel(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            {!itemModalId && !itemModalAdvanced && itemModalLabel.trim() && (
                                <p className="text-xs text-[#59678b]">
                                    Item key will be{" "}
                                    <span className="font-mono font-medium text-[#31394d]">{previewCreateItemKey}</span>
                                </p>
                            )}
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Sort order</label>
                                <input
                                    type="number"
                                    value={itemModalSort}
                                    onChange={(e) => setItemModalSort(Number(e.target.value) || 0)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#31394d]">
                                <input
                                    type="checkbox"
                                    checked={itemModalAdvanced}
                                    onChange={(e) => setItemModalAdvanced(e.target.checked)}
                                    className="rounded border-[#c4c8cc]"
                                />
                                Advanced (item key &amp; metadata)
                            </label>
                            {itemModalAdvanced && !itemModalId && (
                                <div>
                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Item key override</label>
                                    <input
                                        type="text"
                                        value={itemModalKeyOverride}
                                        onChange={(e) => setItemModalKeyOverride(e.target.value)}
                                        placeholder="Leave blank to auto-generate from label"
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 font-mono text-sm"
                                    />
                                    <p className="mt-0.5 text-xs text-[#59678b]">Immutable after create. Must be unique in this set.</p>
                                </div>
                            )}
                            {itemModalAdvanced && (
                                <div>
                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Metadata (JSON)</label>
                                    <textarea
                                        value={itemModalMeta}
                                        onChange={(e) => setItemModalMeta(e.target.value)}
                                        rows={5}
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 font-mono text-xs"
                                    />
                                </div>
                            )}
                        </div>
                        {itemError && <p className="mt-2 text-sm text-red-600">{itemError}</p>}
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => !itemSaving && setItemModalOpen(false)}
                                className="rounded border border-[#e6e8ec] px-3 py-1.5 text-sm font-medium hover:bg-[#eef0f4]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={saveItem}
                                disabled={itemSaving}
                                className="rounded bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                                {itemSaving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
