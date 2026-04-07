"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import PrimaryButton from "@/components/PrimaryButton";
import type { OptionSetListRow } from "@/app/api/admin/option-sets/route";
import { slugifyAdminKey, uniqueAdminKey } from "@/lib/admin/slugifyAdminKey";

const SET_KEY_REGEX = /^[a-z0-9_]{2,64}$/;

async function readApiError(res: Response): Promise<string> {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return typeof json.error === "string" && json.error.trim() ? json.error.trim() : `Request failed (${res.status})`;
}

function sanitizeSetKeyInput(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

function sanitizeItemKeyInput(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

type DraftItemRow = {
    localId: string;
    label: string;
    sort_order: number;
    manualItemKeyOverride: string;
    status: "pending" | "ok" | "error";
    errorMessage: string;
    savedItemKey?: string;
};

function newDraftRow(sortOrder: number): DraftItemRow {
    return {
        localId: crypto.randomUUID(),
        label: "",
        sort_order: sortOrder,
        manualItemKeyOverride: "",
        status: "pending",
        errorMessage: "",
    };
}

export default function OptionSetsClient() {
    const { canMutate } = useAdminAuth();
    const [items, setItems] = useState<OptionSetListRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalLabel, setModalLabel] = useState("");
    const [modalSortOrder, setModalSortOrder] = useState(0);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [modalSetKeyOverride, setModalSetKeyOverride] = useState("");
    const [draftRows, setDraftRows] = useState<DraftItemRow[]>([]);
    const [createdSetKey, setCreatedSetKey] = useState<string | null>(null);
    const [modalSaving, setModalSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [partialBanner, setPartialBanner] = useState<string | null>(null);
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
        setModalLabel("");
        setModalSortOrder(0);
        setAdvancedOpen(false);
        setModalSetKeyOverride("");
        setDraftRows([newDraftRow(0)]);
        setCreatedSetKey(null);
        setModalError(null);
        setPartialBanner(null);
        setModalOpen(true);
    };

    const addDraftRow = () => {
        setDraftRows((prev) => {
            const nextSort = prev.length ? Math.max(...prev.map((r) => r.sort_order), 0) + 10 : 0;
            return [...prev, newDraftRow(nextSort)];
        });
    };

    const removeDraftRow = (localId: string) => {
        setDraftRows((prev) => prev.filter((r) => !(r.localId === localId && r.status !== "ok")));
    };

    const updateDraftRow = (localId: string, patch: Partial<Pick<DraftItemRow, "label" | "sort_order" | "manualItemKeyOverride">>) => {
        setDraftRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
    };

    const closeModalAndRefresh = async () => {
        setModalOpen(false);
        setCreatedSetKey(null);
        setPartialBanner(null);
        setDraftRows([]);
        await fetchItems();
    };

    const postOneDraftItem = async (
        setKeyForItems: string,
        row: DraftItemRow,
        reserved: Set<string>,
        useAdvancedItemKeys: boolean
    ): Promise<{ ok: true; item_key: string } | { ok: false; message: string }> => {
        let item_key: string;
        if (useAdvancedItemKeys && row.manualItemKeyOverride.trim()) {
            const manual = sanitizeItemKeyInput(row.manualItemKeyOverride);
            if (!SET_KEY_REGEX.test(manual)) {
                return {
                    ok: false,
                    message: "Item key: 2–64 chars, lowercase letters, numbers, underscores.",
                };
            }
            item_key = reserved.has(manual) ? uniqueAdminKey(manual, reserved) : manual;
        } else {
            item_key = uniqueAdminKey(row.label, reserved);
        }

        const res = await fetch(`/api/admin/option-sets/${encodeURIComponent(setKeyForItems)}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                item_key,
                label: row.label.trim(),
                sort_order: row.sort_order,
                metadata: {},
            }),
        });

        if (!res.ok) {
            return { ok: false, message: await readApiError(res) };
        }
        return { ok: true, item_key };
    };

    const runItemCreates = async (
        setKeyForItems: string,
        rowsToSubmit: DraftItemRow[],
        workingRows: DraftItemRow[]
    ): Promise<DraftItemRow[]> => {
        const reserved = new Set<string>();
        for (const r of workingRows) {
            if (r.status === "ok" && r.savedItemKey) reserved.add(r.savedItemKey);
        }

        let next = workingRows;
        for (const row of rowsToSubmit) {
            const result = await postOneDraftItem(setKeyForItems, row, reserved, advancedOpen);
            if (!result.ok) {
                next = next.map((r) =>
                    r.localId === row.localId ? { ...r, status: "error" as const, errorMessage: result.message } : r
                );
            } else {
                reserved.add(result.item_key);
                next = next.map((r) =>
                    r.localId === row.localId
                        ? { ...r, status: "ok" as const, errorMessage: "", savedItemKey: result.item_key }
                        : r
                );
            }
            setDraftRows(next);
        }

        const errLabeled = next.filter((r) => r.label.trim() && r.status === "error");
        if (errLabeled.length > 0) {
            setPartialBanner(
                `Option set was created. ${errLabeled.length} option${errLabeled.length === 1 ? "" : "s"} failed to save. Fix issues below or remove rows, then retry.`
            );
        } else {
            setPartialBanner(null);
        }

        return next;
    };

    const createOptionSetAndItems = async (onlyLocalId?: string) => {
        if (!canMutate) return;
        setModalError(null);
        if (!onlyLocalId) setPartialBanner(null);

        if (!modalLabel.trim()) {
            setModalError("Set label is required.");
            return;
        }

        if (onlyLocalId && !createdSetKey) {
            return;
        }

        const set_key = advancedOpen && modalSetKeyOverride.trim()
            ? sanitizeSetKeyInput(modalSetKeyOverride)
            : slugifyAdminKey(modalLabel);
        if (!SET_KEY_REGEX.test(set_key)) {
            setModalError("Set key must be 2–64 characters: lowercase letters, numbers, underscores only.");
            return;
        }

        let workingRows = draftRows;
        const rowsToSubmit = workingRows.filter((r) => {
            if (!r.label.trim()) return false;
            if (onlyLocalId) return r.localId === onlyLocalId && r.status === "error";
            return r.status === "pending" || r.status === "error";
        });

        setModalSaving(true);
        try {
            let setKeyForItems = createdSetKey;

            if (!setKeyForItems) {
                const res = await fetch("/api/admin/option-sets", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        set_key,
                        label: modalLabel.trim(),
                        sort_order: modalSortOrder,
                    }),
                });
                if (!res.ok) {
                    setModalError(await readApiError(res));
                    return;
                }
                const created = (await res.json().catch(() => ({}))) as { set_key?: string };
                const sk = typeof created.set_key === "string" ? created.set_key : set_key;
                setKeyForItems = sk;
                setCreatedSetKey(sk);
            }

            if (!setKeyForItems) {
                setModalError("Could not determine created set key.");
                return;
            }

            if (rowsToSubmit.length === 0 && !onlyLocalId) {
                await closeModalAndRefresh();
                return;
            }

            if (rowsToSubmit.length === 0) {
                return;
            }

            const nextRows = await runItemCreates(setKeyForItems, rowsToSubmit, workingRows);
            workingRows = nextRows;

            const labeled = workingRows.filter((r) => r.label.trim());
            const allOk = labeled.length > 0 && labeled.every((r) => r.status === "ok");
            const noneFailed = !workingRows.some((r) => r.status === "error");

            if (allOk && noneFailed) {
                await closeModalAndRefresh();
            }
        } finally {
            setModalSaving(false);
        }
    };

    const retryFailedItems = () => {
        void createOptionSetAndItems();
    };

    const retryOneRow = (localId: string) => {
        void createOptionSetAndItems(localId);
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

    const hasFailedRows = draftRows.some((r) => r.status === "error");

    return (
        <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <AdminPageHeader
                    title="Option sets"
                    subtitle="Org-scoped lists for select fields, booking, and pricing dimensions. Keys are auto-generated from labels unless you use Advanced."
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
                        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#e6e8ec] bg-white p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="mb-3 text-lg font-semibold text-[#31394d]">New option set</h3>

                        {partialBanner && (
                            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                                <p>{partialBanner}</p>
                                {createdSetKey && (
                                    <Link
                                        href={`/admin/system/option-sets/${encodeURIComponent(createdSetKey)}`}
                                        className="mt-2 inline-block text-sm font-medium text-alloy-pine hover:underline"
                                    >
                                        Open set detail
                                    </Link>
                                )}
                            </div>
                        )}

                        <div className="space-y-3">
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Set label</label>
                                <input
                                    type="text"
                                    value={modalLabel}
                                    onChange={(e) => setModalLabel(e.target.value)}
                                    disabled={!!createdSetKey}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm disabled:bg-[#f4f5f7]"
                                />
                                {!advancedOpen && !createdSetKey && modalLabel.trim() && (
                                    <p className="mt-0.5 text-xs text-[#59678b]">
                                        Set key will be{" "}
                                        <span className="font-mono font-medium text-[#31394d]">
                                            {slugifyAdminKey(modalLabel)}
                                        </span>
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Sort order</label>
                                <input
                                    type="number"
                                    value={modalSortOrder}
                                    onChange={(e) => setModalSortOrder(Number(e.target.value) || 0)}
                                    disabled={!!createdSetKey}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm disabled:bg-[#f4f5f7]"
                                />
                            </div>

                            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#31394d]">
                                <input
                                    type="checkbox"
                                    checked={advancedOpen}
                                    onChange={(e) => setAdvancedOpen(e.target.checked)}
                                    disabled={!!createdSetKey}
                                    className="rounded border-[#c4c8cc] disabled:opacity-50"
                                />
                                Advanced (set key &amp; per-option keys)
                            </label>
                            {advancedOpen && !createdSetKey && (
                                <div>
                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Set key override</label>
                                    <input
                                        type="text"
                                        value={modalSetKeyOverride}
                                        onChange={(e) => setModalSetKeyOverride(e.target.value)}
                                        placeholder="Leave blank to derive from label"
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 font-mono text-sm"
                                    />
                                </div>
                            )}

                            <div className="border-t border-[#e6e8ec] pt-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold uppercase tracking-wide text-[#59678b]">
                                        Initial options
                                    </span>
                                    {canMutate && (
                                        <button
                                            type="button"
                                            onClick={addDraftRow}
                                            className="text-xs font-medium text-alloy-pine hover:underline"
                                        >
                                            + Add row
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    {draftRows.map((row) => (
                                        <div
                                            key={row.localId}
                                            className={`rounded-md border px-3 py-2 ${
                                                row.status === "ok"
                                                    ? "border-green-200 bg-green-50/50"
                                                    : row.status === "error"
                                                      ? "border-red-200 bg-red-50/40"
                                                      : "border-[#e6e8ec]"
                                            }`}
                                        >
                                            <div className="flex flex-wrap items-end gap-2">
                                                <div className="min-w-[140px] flex-1">
                                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">
                                                        Label
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={row.label}
                                                        onChange={(e) => updateDraftRow(row.localId, { label: e.target.value })}
                                                        disabled={row.status === "ok"}
                                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm disabled:bg-white/80"
                                                    />
                                                </div>
                                                <div className="w-24">
                                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Sort</label>
                                                    <input
                                                        type="number"
                                                        value={row.sort_order}
                                                        onChange={(e) =>
                                                            updateDraftRow(row.localId, {
                                                                sort_order: Number(e.target.value) || 0,
                                                            })
                                                        }
                                                        disabled={row.status === "ok"}
                                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm disabled:bg-white/80"
                                                    />
                                                </div>
                                                {canMutate && row.status !== "ok" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeDraftRow(row.localId)}
                                                        className="mb-0.5 text-xs text-alloy-ember hover:underline"
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                            {advancedOpen && row.status !== "ok" && (
                                                <div className="mt-2">
                                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">
                                                        Item key override (optional)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={row.manualItemKeyOverride}
                                                        onChange={(e) =>
                                                            updateDraftRow(row.localId, {
                                                                manualItemKeyOverride: e.target.value,
                                                            })
                                                        }
                                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 font-mono text-sm"
                                                    />
                                                </div>
                                            )}
                                            {row.status === "ok" && row.savedItemKey && (
                                                <p className="mt-1 text-xs text-green-800">
                                                    Saved as <span className="font-mono">{row.savedItemKey}</span>
                                                </p>
                                            )}
                                            {row.status === "error" && row.errorMessage && (
                                                <p className="mt-1 text-xs text-red-700">{row.errorMessage}</p>
                                            )}
                                            {row.status === "error" && canMutate && createdSetKey && (
                                                <button
                                                    type="button"
                                                    onClick={() => retryOneRow(row.localId)}
                                                    disabled={modalSaving}
                                                    className="mt-2 text-xs font-medium text-alloy-pine hover:underline disabled:opacity-50"
                                                >
                                                    Retry this row
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {modalError && <p className="mt-2 text-sm text-red-600">{modalError}</p>}

                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => !modalSaving && setModalOpen(false)}
                                className="rounded border border-[#e6e8ec] px-3 py-1.5 text-sm font-medium hover:bg-[#eef0f4]"
                            >
                                Cancel
                            </button>
                            {createdSetKey && (hasFailedRows || partialBanner) && (
                                <button
                                    type="button"
                                    onClick={() => void closeModalAndRefresh()}
                                    className="rounded border border-[#e6e8ec] px-3 py-1.5 text-sm font-medium hover:bg-[#eef0f4]"
                                >
                                    Done
                                </button>
                            )}
                            {hasFailedRows && (
                                <button
                                    type="button"
                                    onClick={retryFailedItems}
                                    disabled={modalSaving}
                                    className="rounded border border-alloy-midnight/30 bg-white px-3 py-1.5 text-sm font-medium text-alloy-midnight hover:bg-[#eef0f4] disabled:opacity-50"
                                >
                                    Retry failed items
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => void createOptionSetAndItems()}
                                disabled={modalSaving}
                                className="rounded bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                                {modalSaving
                                    ? "Saving…"
                                    : createdSetKey
                                      ? hasFailedRows
                                          ? "Save / retry"
                                          : "Add options"
                                      : "Create"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
