"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import PrimaryButton from "@/components/PrimaryButton";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";
import { slugifyAdminKey } from "@/lib/admin/slugifyAdminKey";

const ENTITY_TYPES = [
    "person",
    "location",
    "customer",
    "job",
    "opportunity",
    "vendor",
    "schedule",
] as const;

type EntityType = (typeof ENTITY_TYPES)[number];

type FieldSectionRow = {
    id: string;
    org_id: string;
    entity_type: string;
    section_key: string;
    label: string;
    description: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string | null;
};

function toRow(r: Record<string, unknown>): FieldSectionRow {
    return {
        id: String(r.id),
        org_id: String(r.org_id),
        entity_type: String(r.entity_type),
        section_key: String(r.section_key),
        label: String(r.label),
        description: r.description != null ? String(r.description) : null,
        sort_order: typeof r.sort_order === "number" ? r.sort_order : Number(r.sort_order) || 0,
        created_at: String(r.created_at),
        updated_at: r.updated_at != null ? String(r.updated_at) : null,
    };
}

async function readApiError(res: Response): Promise<string> {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return typeof json.error === "string" && json.error.trim() ? json.error.trim() : `Request failed (${res.status})`;
}

const SECTION_KEY_REGEX = /^[a-z0-9_]{2,64}$/;

export default function FieldSectionsClient({ adminV2Chrome = false }: { adminV2Chrome?: boolean } = {}) {
    const { canMutate } = useAdminAuth();
    const { labels } = useEntityLabels();
    const [entityType, setEntityType] = useState<EntityType>("person");
    const [rows, setRows] = useState<FieldSectionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [createOpen, setCreateOpen] = useState(false);
    const [createLabel, setCreateLabel] = useState("");
    const [createSectionKey, setCreateSectionKey] = useState("");
    const [createDescription, setCreateDescription] = useState("");
    const [createSortOrder, setCreateSortOrder] = useState(100);
    const [createAdvancedKey, setCreateAdvancedKey] = useState(false);
    const createKeyManualRef = useRef(false);
    const [createSaving, setCreateSaving] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const [editRow, setEditRow] = useState<FieldSectionRow | null>(null);
    const [editLabel, setEditLabel] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editSortOrder, setEditSortOrder] = useState(100);
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const [deleteError, setDeleteError] = useState<string | null>(null);

    const entityTypeDisplay = useMemo(() => adminFieldEntitySingularLabel(labels, entityType), [labels, entityType]);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/field-sections?entity_type=${encodeURIComponent(entityType)}`,
                { cache: "no-store" }
            );
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load");
            const raw = (json as { sections?: Record<string, unknown>[] }).sections ?? [];
            setRows(raw.map(toRow));
        } catch (e) {
            setError((e as Error).message);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [entityType]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    useEffect(() => {
        if (!createOpen || createKeyManualRef.current || createAdvancedKey) return;
        const slug = slugifyAdminKey(createLabel);
        if (slug.length >= 2) setCreateSectionKey(slug);
    }, [createOpen, createLabel, createAdvancedKey]);

    const openCreate = () => {
        setCreateLabel("");
        setCreateSectionKey("");
        setCreateDescription("");
        setCreateSortOrder(100);
        setCreateAdvancedKey(false);
        createKeyManualRef.current = false;
        setCreateError(null);
        setCreateOpen(true);
    };

    const saveCreate = async () => {
        if (!canMutate) return;
        const label = createLabel.trim();
        if (!label) {
            setCreateError("Label is required.");
            return;
        }
        const section_key = createSectionKey
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, "")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "");
        if (!SECTION_KEY_REGEX.test(section_key)) {
            setCreateError("Section key: 2–64 chars, lowercase letters, numbers, underscores.");
            return;
        }
        setCreateSaving(true);
        setCreateError(null);
        try {
            const res = await fetch("/api/admin/field-sections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity_type: entityType,
                    section_key,
                    label,
                    description: createDescription.trim() || null,
                    sort_order: createSortOrder,
                }),
            });
            if (!res.ok) {
                setCreateError(await readApiError(res));
                return;
            }
            setCreateOpen(false);
            await fetchRows();
        } catch (e) {
            setCreateError((e as Error).message);
        } finally {
            setCreateSaving(false);
        }
    };

    const openEdit = (row: FieldSectionRow) => {
        setEditRow(row);
        setEditLabel(row.label);
        setEditDescription(row.description ?? "");
        setEditSortOrder(row.sort_order);
        setEditError(null);
    };

    const saveEdit = async () => {
        if (!canMutate || !editRow) return;
        const label = editLabel.trim();
        if (!label) {
            setEditError("Label is required.");
            return;
        }
        setEditSaving(true);
        setEditError(null);
        try {
            const res = await fetch(`/api/admin/field-sections/${editRow.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    label,
                    description: editDescription.trim() || null,
                    sort_order: editSortOrder,
                }),
            });
            if (!res.ok) {
                setEditError(await readApiError(res));
                return;
            }
            setEditRow(null);
            await fetchRows();
        } catch (e) {
            setEditError((e as Error).message);
        } finally {
            setEditSaving(false);
        }
    };

    const deleteRow = async (row: FieldSectionRow) => {
        if (!canMutate) return;
        setDeleteError(null);
        if (
            !window.confirm(
                `Delete section "${row.section_key}" for ${adminFieldEntitySingularLabel(labels, row.entity_type)} (${row.entity_type})?`
            )
        )
            return;
        try {
            const res = await fetch(`/api/admin/field-sections/${row.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setDeleteError(await readApiError(res));
                return;
            }
            await fetchRows();
        } catch (e) {
            setDeleteError((e as Error).message);
        }
    };

    const newSectionAction = canMutate ? <PrimaryButton onClick={openCreate}>New section</PrimaryButton> : null;

    return (
        <>
            {adminV2Chrome ? (
                <SettingsPageHeader
                    title="Field sections"
                    subtitle="Labels and ordering for field groups (field_definitions.section_key). One catalog per entity type."
                    actions={newSectionAction}
                />
            ) : (
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <AdminPageHeader
                        title="Field sections"
                        subtitle="Labels and ordering for field groups (field_definitions.section_key). One catalog per entity type."
                    />
                    {newSectionAction}
                </div>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-3">
                <label className="text-sm text-[#59678b]">
                    Entity type{" "}
                    <select
                        value={entityType}
                        onChange={(e) => setEntityType(e.target.value as EntityType)}
                        className="ml-1 rounded border border-[#e6e8ec] px-2 py-1.5 text-sm text-[#31394d]"
                    >
                        {ENTITY_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {adminFieldEntitySingularLabel(labels, t)}
                            </option>
                        ))}
                    </select>
                </label>
                <Link
                    href={
                        entityType === "person"
                            ? "/admin/system/person-fields"
                            : entityType === "location"
                              ? "/admin/system/location-fields"
                              : entityType === "customer"
                                ? "/admin/system/customer-fields"
                                : entityType === "job"
                                  ? "/admin/system/job-fields"
                                  : entityType === "opportunity"
                                    ? "/admin/system/opportunity-fields"
                                    : entityType === "vendor"
                                      ? "/admin/system/vendor-fields"
                                      : "/admin/system/schedule-fields"
                    }
                    className="text-sm font-medium text-alloy-pine hover:underline"
                >
                    Edit {entityTypeDisplay} fields →
                </Link>
            </div>

            {loading && <p className="text-sm text-[#59678b]">Loading…</p>}
            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
            )}

            {!loading && !error && (
                <SectionCard title={`Sections for ${entityTypeDisplay}`}>
                    {deleteError && (
                        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {deleteError}
                        </div>
                    )}
                    <p className="mb-3 text-sm text-[#59678b]">
                        Fields reference these keys via <span className="font-mono">section_key</span>. Deleting a section
                        is blocked while any field still uses it.
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-[#e6e8ec] text-[#59678b]">
                                    <th className="pb-2 pr-4 font-semibold">section_key</th>
                                    <th className="pb-2 pr-4 font-semibold">Label</th>
                                    <th className="pb-2 pr-4 font-semibold">Description</th>
                                    <th className="pb-2 pr-4 font-semibold">Sort</th>
                                    {canMutate && <th className="pb-2 font-semibold">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={canMutate ? 5 : 4} className="py-4 text-[#59678b]">
                                            No section definitions for this entity. Add one or rely on field UI keys (e.g.
                                            custom).
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((row) => (
                                        <tr key={row.id} className="border-b border-[#e6e8ec] align-middle">
                                            <td className="py-2 pr-4 font-mono text-[#59678b]">{row.section_key}</td>
                                            <td className="py-2 pr-4 font-medium text-[#31394d]">{row.label}</td>
                                            <td className="py-2 pr-4 text-[#59678b]">{row.description ?? "—"}</td>
                                            <td className="py-2 pr-4 text-[#59678b]">{row.sort_order}</td>
                                            {canMutate && (
                                                <td className="py-2">
                                                    <div className="flex flex-wrap gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => openEdit(row)}
                                                            className="rounded border border-alloy-stone/50 px-2 py-1 text-xs font-medium hover:bg-alloy-stone/20"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteRow(row)}
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

            {createOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => !createSaving && setCreateOpen(false)}
                >
                    <div
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[#e6e8ec] bg-white p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="mb-3 text-lg font-semibold text-[#31394d]">New section ({entityTypeDisplay})</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Label</label>
                                <input
                                    type="text"
                                    value={createLabel}
                                    onChange={(e) => setCreateLabel(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#31394d]">
                                <input
                                    type="checkbox"
                                    checked={createAdvancedKey}
                                    onChange={(e) => {
                                        setCreateAdvancedKey(e.target.checked);
                                        if (e.target.checked) createKeyManualRef.current = true;
                                    }}
                                    className="rounded border-[#c4c8cc]"
                                />
                                Advanced (edit section_key manually)
                            </label>
                            {createAdvancedKey && (
                                <div>
                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">section_key</label>
                                    <input
                                        type="text"
                                        value={createSectionKey}
                                        onChange={(e) => {
                                            createKeyManualRef.current = true;
                                            setCreateSectionKey(e.target.value);
                                        }}
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 font-mono text-sm"
                                    />
                                    <p className="mt-0.5 text-xs text-[#59678b]">Immutable after create.</p>
                                </div>
                            )}
                            {!createAdvancedKey && createLabel.trim() && (
                                <p className="text-xs text-[#59678b]">
                                    section_key will be{" "}
                                    <span className="font-mono font-medium text-[#31394d]">
                                        {slugifyAdminKey(createLabel)}
                                    </span>
                                </p>
                            )}
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Description</label>
                                <input
                                    type="text"
                                    value={createDescription}
                                    onChange={(e) => setCreateDescription(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Sort order</label>
                                <input
                                    type="number"
                                    value={createSortOrder}
                                    onChange={(e) => setCreateSortOrder(Number(e.target.value) || 0)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                        </div>
                        {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => !createSaving && setCreateOpen(false)}
                                className="rounded border border-[#e6e8ec] px-3 py-1.5 text-sm font-medium hover:bg-[#eef0f4]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={saveCreate}
                                disabled={createSaving}
                                className="rounded bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                                {createSaving ? "Saving…" : "Create"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editRow && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => !editSaving && setEditRow(null)}
                >
                    <div
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[#e6e8ec] bg-white p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="mb-3 text-lg font-semibold text-[#31394d]">
                            Edit section <span className="font-mono text-base">{editRow.section_key}</span>
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Label</label>
                                <input
                                    type="text"
                                    value={editLabel}
                                    onChange={(e) => setEditLabel(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Description</label>
                                <input
                                    type="text"
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
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
                        {editError && <p className="mt-2 text-sm text-red-600">{editError}</p>}
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => !editSaving && setEditRow(null)}
                                className="rounded border border-[#e6e8ec] px-3 py-1.5 text-sm font-medium hover:bg-[#eef0f4]"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={saveEdit}
                                disabled={editSaving}
                                className="rounded bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                                {editSaving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
