"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { getQueueDefinitionStoredVersion } from "@/lib/rrs/queue/queueDefinitionV1";
import type { DepartmentRow } from "../departments/DepartmentsClient";

export type WorkUnitRow = {
    id: string;
    org_id: string;
    department_id: string;
    key: string;
    name: string;
    description: string | null;
    sort_order: number;
    is_active: boolean;
    queue_definition: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

const KEY_REGEX = /^[a-z0-9_]{2,64}$/;

function stringifyQueue(q: Record<string, unknown>): string {
    try {
        return JSON.stringify(q ?? {}, null, 2);
    } catch {
        return "{}";
    }
}

export default function WorkUnitsClient() {
    const { canMutate } = useAdminAuth();
    const [departments, setDepartments] = useState<DepartmentRow[]>([]);
    const [items, setItems] = useState<WorkUnitRow[]>([]);
    const [filterDeptId, setFilterDeptId] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalId, setModalId] = useState<string | null>(null);
    const [modalDeptId, setModalDeptId] = useState("");
    const [modalKey, setModalKey] = useState("");
    const [modalName, setModalName] = useState("");
    const [modalDescription, setModalDescription] = useState("");
    const [modalSortOrder, setModalSortOrder] = useState(0);
    const [modalActive, setModalActive] = useState(true);
    const [modalQueueJson, setModalQueueJson] = useState("{}");
    /** Optimistic concurrency for PATCH `queue_definition` (see `expected_queue_definition_version`). */
    const [modalQueueExpectedVersion, setModalQueueExpectedVersion] = useState(0);
    const [modalSaving, setModalSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);

    const deptNameById = useMemo(() => {
        const m = new Map<string, string>();
        for (const d of departments) m.set(d.id, d.name);
        return m;
    }, [departments]);

    const fetchDepartments = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/departments");
            const json = await res.json().catch(() => ({}));
            if (res.ok) setDepartments((json as { items?: DepartmentRow[] }).items ?? []);
        } catch {
            setDepartments([]);
        }
    }, []);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const q = filterDeptId ? `?department_id=${encodeURIComponent(filterDeptId)}` : "";
            const res = await fetch(`/api/admin/work-units${q}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load");
            const raw = (json as { items?: WorkUnitRow[] }).items ?? [];
            setItems(
                raw.map((r) => ({
                    ...r,
                    queue_definition:
                        typeof r.queue_definition === "object" && r.queue_definition !== null
                            ? (r.queue_definition as Record<string, unknown>)
                            : {},
                }))
            );
        } catch (e) {
            setError((e as Error).message);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [filterDeptId]);

    useEffect(() => {
        fetchDepartments();
    }, [fetchDepartments]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const sortedForDisplay = useMemo(() => {
        return [...items].sort((a, b) => {
            const da = deptNameById.get(a.department_id) ?? "";
            const db = deptNameById.get(b.department_id) ?? "";
            if (da !== db) return da.localeCompare(db);
            if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
            return a.name.localeCompare(b.name);
        });
    }, [items, deptNameById]);

    const openCreate = () => {
        setModalId(null);
        setModalDeptId(filterDeptId || (departments[0]?.id ?? ""));
        setModalKey("");
        setModalName("");
        setModalDescription("");
        setModalSortOrder(0);
        setModalActive(true);
        setModalQueueJson("{}");
        setModalQueueExpectedVersion(0);
        setModalError(null);
        setModalOpen(true);
    };

    const openEdit = (row: WorkUnitRow) => {
        setModalId(row.id);
        setModalDeptId(row.department_id);
        setModalKey(row.key);
        setModalName(row.name);
        setModalDescription(row.description ?? "");
        setModalSortOrder(row.sort_order);
        setModalActive(row.is_active);
        setModalQueueJson(stringifyQueue(row.queue_definition));
        setModalQueueExpectedVersion(getQueueDefinitionStoredVersion(row.queue_definition));
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
        if (!modalDeptId) {
            setModalError("Department is required.");
            return;
        }
        let queueParsed: Record<string, unknown>;
        try {
            const p = JSON.parse(modalQueueJson.trim() || "{}") as unknown;
            if (typeof p !== "object" || p === null || Array.isArray(p)) {
                setModalError("Queue definition must be a JSON object.");
                return;
            }
            queueParsed = p as Record<string, unknown>;
        } catch {
            setModalError("Invalid JSON in queue definition.");
            return;
        }

        /** Empty object clears stored queue_definition (server treats null as clear to `{}`). */
        const queue_definition =
            Object.keys(queueParsed).length === 0 ? null : queueParsed;

        setModalSaving(true);
        setModalError(null);
        try {
            if (modalId) {
                const res = await fetch(`/api/admin/work-units/${modalId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        department_id: modalDeptId,
                        key,
                        name: modalName.trim(),
                        description: modalDescription.trim() || null,
                        sort_order: modalSortOrder,
                        is_active: modalActive,
                        queue_definition,
                        expected_queue_definition_version: modalQueueExpectedVersion,
                    }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
            } else {
                const res = await fetch("/api/admin/work-units", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        department_id: modalDeptId,
                        key,
                        name: modalName.trim(),
                        description: modalDescription.trim() || null,
                        sort_order: modalSortOrder,
                        is_active: modalActive,
                        queue_definition,
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

    const remove = async (row: WorkUnitRow) => {
        if (!canMutate) return;
        if (!window.confirm(`Delete work unit “${row.name}”? Jobs linked to it will clear work_unit_id.`)) return;
        const res = await fetch(`/api/admin/work-units/${row.id}`, { method: "DELETE" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert((json as { error?: string }).error ?? "Delete failed");
            return;
        }
        await fetchItems();
    };

    return (
        <div>
            <AdminPageHeader
                title="Work units"
                subtitle="Operational queues or cohorts within a department. Queue definition is raw JSON for now."
                actions={
                    canMutate ? (
                        <button
                            type="button"
                            onClick={openCreate}
                            disabled={departments.length === 0}
                            className="px-4 py-2 rounded-lg bg-alloy-pine text-white text-sm font-medium hover:bg-alloy-pine/90 disabled:opacity-50"
                        >
                            Add work unit
                        </button>
                    ) : null
                }
            />

            <SectionCard title="Filter">
                <label className="flex flex-wrap items-center gap-2 text-sm text-alloy-forge">
                    <span>Department</span>
                    <select
                        className="border border-admin-border rounded-md px-3 py-2 text-sm min-w-[200px]"
                        value={filterDeptId}
                        onChange={(e) => setFilterDeptId(e.target.value)}
                    >
                        <option value="">All departments</option>
                        {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.name}
                            </option>
                        ))}
                    </select>
                </label>
                {departments.length === 0 ? (
                    <p className="mt-2 text-sm text-amber-700">Create at least one department first.</p>
                ) : null}
            </SectionCard>

            <SectionCard title="Work units">
                {loading ? (
                    <p className="text-sm text-alloy-forge/70">Loading…</p>
                ) : error ? (
                    <p className="text-sm text-red-600">{error}</p>
                ) : sortedForDisplay.length === 0 ? (
                    <p className="text-sm text-alloy-forge/70">No work units yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead>
                                <tr className="border-b border-admin-border text-alloy-forge/70">
                                    <th className="py-2 pr-4 font-medium">Department</th>
                                    <th className="py-2 pr-4 font-medium">Name</th>
                                    <th className="py-2 pr-4 font-medium">Key</th>
                                    <th className="py-2 pr-4 font-medium">Sort</th>
                                    <th className="py-2 pr-4 font-medium">Active</th>
                                    <th className="py-2 pr-4 font-medium w-40">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedForDisplay.map((row) => (
                                    <tr key={row.id} className="border-b border-admin-border/60">
                                        <td className="py-2 pr-4 text-alloy-forge">{deptNameById.get(row.department_id) ?? row.department_id.slice(0, 8)}</td>
                                        <td className="py-2 pr-4 font-medium text-alloy-forge">{row.name}</td>
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
                    <div className="bg-admin-surface-card border border-admin-border rounded-xl shadow-lg max-w-lg w-full p-6 my-8">
                        <h2 className="text-lg font-semibold text-alloy-forge">{modalId ? "Edit work unit" : "New work unit"}</h2>
                        <div className="mt-4 space-y-3">
                            <label className="block text-sm">
                                <span className="text-alloy-forge/80">Department</span>
                                <select
                                    className="mt-1 w-full border border-admin-border rounded-md px-3 py-2 text-sm"
                                    value={modalDeptId}
                                    onChange={(e) => setModalDeptId(e.target.value)}
                                >
                                    <option value="">Select…</option>
                                    {departments.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
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
                                    className="mt-1 w-full border border-admin-border rounded-md px-3 py-2 text-sm min-h-[64px]"
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
                            <label className="block text-sm">
                                <span className="text-alloy-forge/80">Queue definition (JSON)</span>
                                <textarea
                                    className="mt-1 w-full border border-admin-border rounded-md px-3 py-2 text-sm font-mono text-xs min-h-[120px]"
                                    value={modalQueueJson}
                                    onChange={(e) => setModalQueueJson(e.target.value)}
                                />
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={modalActive} onChange={(e) => setModalActive(e.target.checked)} />
                                <span>Active</span>
                            </label>
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
