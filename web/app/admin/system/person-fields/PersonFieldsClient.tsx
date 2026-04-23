"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";
import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import { sortFieldDefinitionsForAdminList } from "@/lib/admin/sortFieldDefinitions";
import OptionSetKeyPicker from "@/components/admin/OptionSetKeyPicker";
import {
    buildConfigWithOptionSetKey,
    getOptionSetKeyFromConfig,
    isSelectLikeFieldType,
} from "@/lib/admin/fieldDefinitionOptionSetConfig";
import {
    fetchFieldSectionRegistry,
    mergeFieldSectionSelectOptions,
    sectionKeyInOptions,
    type FieldSectionRegistryRow,
} from "@/lib/admin/fieldSectionSelectOptions";

const FIELD_TYPES = ["text", "email", "phone", "number", "date", "datetime", "boolean", "select", "multiselect"] as const;

function slugifyLabel(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 64) || "";
}

function toFieldDef(r: Record<string, unknown>): FieldDef {
    return {
        id: String(r.id),
        org_id: String(r.org_id),
        entity_type: String(r.entity_type),
        field_key: String(r.field_key),
        field_type: String(r.field_type),
        label: r.label != null ? String(r.label) : null,
        description: r.description != null ? String(r.description) : null,
        is_system: Boolean(r.is_system),
        is_required: Boolean(r.is_required),
        is_active: r.is_active !== false,
        is_visible_in_form: r.is_visible_in_form !== false,
        is_visible_in_drawer: r.is_visible_in_drawer !== false,
        is_visible_in_table: r.is_visible_in_table !== false,
        is_visible_in_public_booking: Boolean(r.is_visible_in_public_booking),
        is_filterable: Boolean(r.is_filterable),
        is_sortable: Boolean(r.is_sortable),
        section_key: r.section_key != null ? String(r.section_key) : null,
        sort_order: typeof r.sort_order === "number" ? r.sort_order : Number(r.sort_order) || 0,
        placeholder: r.placeholder != null ? String(r.placeholder) : null,
        help_text: r.help_text != null ? String(r.help_text) : null,
        config: r.config != null && typeof r.config === "object" ? (r.config as Record<string, unknown>) : null,
        created_at: String(r.created_at),
        updated_at: String(r.updated_at),
    };
}

export default function PersonFieldsClient({
    manageOptionSetsHref,
    headerVariant = "default",
}: { manageOptionSetsHref?: string; headerVariant?: "default" | "compact" } = {}) {
    const { canMutate } = useAdminAuth();
    const { labels } = useEntityLabels();
    const personEntityLabel = useMemo(() => adminFieldEntitySingularLabel(labels, "person"), [labels]);
    const pageTitle = useMemo(() => `${personEntityLabel} Fields`, [personEntityLabel]);
    const pageSubtitle = useMemo(
        () =>
            `Configure field definitions for the ${personEntityLabel.toLowerCase()} entity. System fields can be customized (labels, visibility, order). Add custom fields for your org.`,
        [personEntityLabel]
    );
    const [items, setItems] = useState<FieldDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [editOpen, setEditOpen] = useState(false);
    const [editRow, setEditRow] = useState<FieldDef | null>(null);
    const [editLabel, setEditLabel] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editRequired, setEditRequired] = useState(false);
    const [editActive, setEditActive] = useState(true);
    const [editVisibleForm, setEditVisibleForm] = useState(true);
    const [editVisibleDrawer, setEditVisibleDrawer] = useState(true);
    const [editVisibleTable, setEditVisibleTable] = useState(true);
    const [editFilterable, setEditFilterable] = useState(false);
    const [editSortable, setEditSortable] = useState(false);
    const [editSectionKey, setEditSectionKey] = useState("");
    const [editSortOrder, setEditSortOrder] = useState(100);
    const [editPlaceholder, setEditPlaceholder] = useState("");
    const [editHelpText, setEditHelpText] = useState("");
    const [editOptionSetKey, setEditOptionSetKey] = useState("");
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const [createOpen, setCreateOpen] = useState(false);
    const [createKey, setCreateKey] = useState("");
    const [createLabel, setCreateLabel] = useState("");
    const [createDescription, setCreateDescription] = useState("");
    const [createFieldType, setCreateFieldType] = useState<string>("text");
    const [createSectionKey, setCreateSectionKey] = useState("custom");
    const [createSortOrder, setCreateSortOrder] = useState(100);
    const [createRequired, setCreateRequired] = useState(false);
    const [createVisibleForm, setCreateVisibleForm] = useState(true);
    const [createVisibleDrawer, setCreateVisibleDrawer] = useState(true);
    const [createVisibleTable, setCreateVisibleTable] = useState(true);
    const [createFilterable, setCreateFilterable] = useState(false);
    const [createSortable, setCreateSortable] = useState(false);
    const [createPlaceholder, setCreatePlaceholder] = useState("");
    const [createHelpText, setCreateHelpText] = useState("");
    const [createOptionSetKey, setCreateOptionSetKey] = useState("");
    const [createSaving, setCreateSaving] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const createKeyManuallyEditedRef = useRef(false);
    const [deleteSavingId, setDeleteSavingId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [sectionRegistry, setSectionRegistry] = useState<FieldSectionRegistryRow[]>([]);

    const sortedItems = useMemo(() => sortFieldDefinitionsForAdminList(items), [items]);

    const inUseSectionKeys = useMemo(
        () =>
            new Set(
                items
                    .map((i) => i.section_key)
                    .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
            ),
        [items]
    );

    const sectionOptions = useMemo(
        () => mergeFieldSectionSelectOptions(sectionRegistry, inUseSectionKeys),
        [sectionRegistry, inUseSectionKeys]
    );

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/field-definitions?entity_type=person");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load field definitions");
            const raw = (json as { field_definitions?: Record<string, unknown>[] }).field_definitions ?? [];
            setItems(raw.map(toFieldDef));
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

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const reg = await fetchFieldSectionRegistry("person");
            if (!cancelled) setSectionRegistry(reg);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const openEdit = (row: FieldDef) => {
        setEditRow(row);
        setEditLabel(row.label ?? "");
        setEditDescription(row.description ?? "");
        setEditRequired(row.is_required);
        setEditActive(row.is_active);
        setEditVisibleForm(row.is_visible_in_form);
        setEditVisibleDrawer(row.is_visible_in_drawer);
        setEditVisibleTable(row.is_visible_in_table);
        setEditFilterable(row.is_filterable);
        setEditSortable(row.is_sortable);
        setEditSectionKey(row.section_key ?? "");
        setEditSortOrder(row.sort_order);
        setEditPlaceholder(row.placeholder ?? "");
        setEditHelpText(row.help_text ?? "");
        setEditOptionSetKey(getOptionSetKeyFromConfig(row.config));
        setEditError(null);
        setEditOpen(true);
    };

    const saveEdit = async () => {
        if (!canMutate || !editRow) return;
        setEditSaving(true);
        setEditError(null);
        try {
            const body: Record<string, unknown> = {
                label: editLabel.trim() || null,
                description: editDescription.trim() || null,
                is_required: editRequired,
                is_active: editActive,
                is_visible_in_form: editVisibleForm,
                is_visible_in_drawer: editVisibleDrawer,
                is_visible_in_table: editVisibleTable,
                is_filterable: editFilterable,
                is_sortable: editSortable,
                section_key: editSectionKey.trim() || "custom",
                sort_order: editSortOrder,
                placeholder: editPlaceholder.trim() || null,
                help_text: editHelpText.trim() || null,
            };
            if (isSelectLikeFieldType(editRow.field_type)) {
                body.config = buildConfigWithOptionSetKey(editRow.config, editOptionSetKey);
            }
            const res = await fetch(`/api/admin/field-definitions/${editRow.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
            setEditOpen(false);
            setEditRow(null);
            await fetchItems();
        } catch (e) {
            setEditError((e as Error).message);
        } finally {
            setEditSaving(false);
        }
    };

    const deleteRow = async (row: FieldDef) => {
        if (!canMutate || row.is_system) return;
        setDeleteError(null);
        if (!window.confirm(`Delete custom field "${row.field_key}"? Stored values for this field will be removed.`)) return;
        setDeleteSavingId(row.id);
        try {
            const res = await fetch(`/api/admin/field-definitions/${row.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Delete failed");
            await fetchItems();
        } catch (e) {
            setDeleteError((e as Error).message);
        } finally {
            setDeleteSavingId(null);
        }
    };

    const openCreate = () => {
        setCreateKey("");
        setCreateLabel("");
        setCreateDescription("");
        setCreateFieldType("text");
        setCreateSectionKey("custom");
        setCreateSortOrder(100);
        setCreateRequired(false);
        setCreateVisibleForm(true);
        setCreateVisibleDrawer(true);
        setCreateVisibleTable(true);
        setCreateFilterable(false);
        setCreateSortable(false);
        setCreatePlaceholder("");
        setCreateHelpText("");
        setCreateOptionSetKey("");
        setCreateError(null);
        createKeyManuallyEditedRef.current = false;
        setCreateOpen(true);
    };

    useEffect(() => {
        if (!createOpen || createKeyManuallyEditedRef.current) return;
        const slug = slugifyLabel(createLabel);
        if (slug.length >= 2) setCreateKey(slug);
    }, [createOpen, createLabel]);

    const saveCreate = async () => {
        if (!canMutate) return;
        const key = createKey.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
        if (!key || key.length < 2) {
            setCreateError("field_key must be at least 2 characters (letters, numbers, underscores).");
            return;
        }
        if (!/^[a-z0-9_]{2,64}$/.test(key)) {
            setCreateError("field_key: lowercase letters, numbers, underscores only, 2–64 characters.");
            return;
        }
        setCreateSaving(true);
        setCreateError(null);
        try {
            const payload: Record<string, unknown> = {
                entity_type: "person",
                field_key: key,
                label: createLabel.trim() || key,
                description: createDescription.trim() || null,
                field_type: createFieldType,
                section_key: createSectionKey.trim() || "custom",
                sort_order: createSortOrder,
                is_required: createRequired,
                is_visible_in_form: createVisibleForm,
                is_visible_in_drawer: createVisibleDrawer,
                is_visible_in_table: createVisibleTable,
                is_filterable: createFilterable,
                is_sortable: createSortable,
                placeholder: createPlaceholder.trim() || null,
                help_text: createHelpText.trim() || null,
            };
            if (isSelectLikeFieldType(createFieldType)) {
                payload.config = buildConfigWithOptionSetKey(null, createOptionSetKey);
            }
            const res = await fetch("/api/admin/field-definitions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = await res.json().catch(() => ({}));
            if (res.status === 409) {
                setCreateError((json as { error?: string }).error ?? "Key already exists.");
                return;
            }
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Create failed");
            setCreateOpen(false);
            await fetchItems();
        } catch (e) {
            setCreateError((e as Error).message);
        } finally {
            setCreateSaving(false);
        }
    };

    const compactSubtitle =
        "System fields: labels, visibility, and order. Add custom fields for your org — same APIs as legacy System pages.";

    return (
        <>
            {headerVariant === "compact" ? (
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold tracking-tight text-alloy-midnight">{pageTitle}</h2>
                        <p className="mt-0.5 max-w-3xl text-xs leading-snug text-alloy-midnight/55">{compactSubtitle}</p>
                    </div>
                    {canMutate && (
                        <button
                            type="button"
                            onClick={openCreate}
                            className="shrink-0 rounded-md bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                        >
                            Add custom field
                        </button>
                    )}
                </div>
            ) : (
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <AdminPageHeader title={pageTitle} subtitle={pageSubtitle} />
                    {canMutate && (
                        <button
                            type="button"
                            onClick={openCreate}
                            className="shrink-0 px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90"
                        >
                            Add custom field
                        </button>
                    )}
                </div>
            )}

            {loading && <p className="text-sm text-[#59678b]">Loading…</p>}
            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {error}
                </div>
            )}

            {!loading && !error && (
                <SectionCard
                    title={headerVariant === "compact" ? "Field definitions" : "Person field definitions"}
                    surfaceTone={headerVariant === "compact" ? "settingsPanel" : "default"}
                >
                    {deleteError && (
                        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{deleteError}</div>
                    )}
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[800px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-[#e6e8ec] text-[#59678b]">
                                    <th className="pb-2 pr-4 font-semibold">Key</th>
                                    <th className="pb-2 pr-4 font-semibold">Type</th>
                                    <th className="pb-2 pr-4 font-semibold">Label</th>
                                    <th className="pb-2 pr-4 font-semibold">Section</th>
                                    <th className="pb-2 pr-4 font-semibold">Sort</th>
                                    <th className="pb-2 pr-4 font-semibold">Required</th>
                                    <th className="pb-2 pr-4 font-semibold">Form</th>
                                    <th className="pb-2 pr-4 font-semibold">Drawer</th>
                                    <th className="pb-2 pr-4 font-semibold">Table</th>
                                    <th className="pb-2 pr-4 font-semibold">System</th>
                                    {canMutate && <th className="pb-2 font-semibold">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedItems.length === 0 ? (
                                    <tr>
                                        <td colSpan={canMutate ? 11 : 10} className="py-4 text-[#59678b]">
                                            No field definitions. Seed person fields in Supabase or add a custom field.
                                        </td>
                                    </tr>
                                ) : (
                                    sortedItems.map((row) => (
                                        <tr key={row.id} className="border-b border-[#e6e8ec] align-middle">
                                            <td className="py-2 pr-4 font-mono text-[#59678b]">{row.field_key}</td>
                                            <td className="py-2 pr-4 text-[#59678b]">{row.field_type}</td>
                                            <td className="py-2 pr-4 font-medium text-[#31394d]">{row.label ?? "—"}</td>
                                            <td className="py-2 pr-4 text-[#59678b]">{row.section_key ?? "—"}</td>
                                            <td className="py-2 pr-4 text-[#59678b]">{row.sort_order}</td>
                                            <td className="py-2 pr-4">{row.is_required ? "Yes" : "No"}</td>
                                            <td className="py-2 pr-4">{row.is_visible_in_form ? "Yes" : "No"}</td>
                                            <td className="py-2 pr-4">{row.is_visible_in_drawer ? "Yes" : "No"}</td>
                                            <td className="py-2 pr-4">{row.is_visible_in_table ? "Yes" : "No"}</td>
                                            <td className="py-2 pr-4">{row.is_system ? "Yes" : "—"}</td>
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
                                                        {!row.is_system && (
                                                            <button
                                                                type="button"
                                                                onClick={() => deleteRow(row)}
                                                                disabled={deleteSavingId === row.id}
                                                                className="rounded border border-alloy-ember/40 px-2 py-1 text-xs font-medium text-alloy-ember hover:bg-alloy-ember/10 disabled:opacity-50"
                                                            >
                                                                {deleteSavingId === row.id ? "…" : "Delete"}
                                                            </button>
                                                        )}
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

            {editOpen && editRow && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => !editSaving && setEditOpen(false)}
                >
                    <div
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[#e6e8ec] bg-white p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="mb-4 text-lg font-semibold text-[#31394d]">
                            Edit field: {editRow.field_key} {editRow.is_system && "(system)"}
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Label</label>
                                <input
                                    type="text"
                                    value={editLabel}
                                    onChange={(e) => setEditLabel(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Description</label>
                                <input
                                    type="text"
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            <div className="flex flex-wrap gap-4">
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={editRequired} onChange={(e) => setEditRequired(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Required
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Active
                                </label>
                            </div>
                            <div className="flex flex-wrap gap-4">
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={editVisibleForm} onChange={(e) => setEditVisibleForm(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Form
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={editVisibleDrawer} onChange={(e) => setEditVisibleDrawer(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Drawer
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={editVisibleTable} onChange={(e) => setEditVisibleTable(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Table
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={editFilterable} onChange={(e) => setEditFilterable(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Filterable
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={editSortable} onChange={(e) => setEditSortable(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Sortable
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-[#59678b] mb-0.5">Section</label>
                                    <select
                                        value={
                                            sectionKeyInOptions(sectionOptions, editSectionKey)
                                                ? editSectionKey
                                                : (sectionOptions[0]?.value ?? "custom")
                                        }
                                        onChange={(e) => setEditSectionKey(e.target.value)}
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                    >
                                        {sectionOptions.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-[#59678b] mb-0.5">Sort order</label>
                                    <input
                                        type="number"
                                        value={editSortOrder}
                                        onChange={(e) => setEditSortOrder(Number(e.target.value) || 0)}
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Placeholder</label>
                                <input
                                    type="text"
                                    value={editPlaceholder}
                                    onChange={(e) => setEditPlaceholder(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Help text</label>
                                <input
                                    type="text"
                                    value={editHelpText}
                                    onChange={(e) => setEditHelpText(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            {editRow && isSelectLikeFieldType(editRow.field_type) && (
                                <div>
                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Option set</label>
                                    <OptionSetKeyPicker
                                        value={editOptionSetKey}
                                        onChange={setEditOptionSetKey}
                                        disabled={!canMutate || editSaving}
                                        manageOptionSetsHref={manageOptionSetsHref}
                                    />
                                </div>
                            )}
                        </div>
                        {editError && <p className="mt-2 text-sm text-red-600">{editError}</p>}
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => !editSaving && setEditOpen(false)}
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

            {createOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => !createSaving && setCreateOpen(false)}
                >
                    <div
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[#e6e8ec] bg-white p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="mb-4 text-lg font-semibold text-[#31394d]">Add custom person field</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Label</label>
                                <input
                                    type="text"
                                    value={createLabel}
                                    onChange={(e) => setCreateLabel(e.target.value)}
                                    placeholder="e.g. Dog Owners"
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                                <p className="mt-0.5 text-xs text-[#59678b]">Display name. Field key is generated below and can be edited.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Field key</label>
                                <input
                                    type="text"
                                    value={createKey}
                                    onChange={(e) => {
                                        createKeyManuallyEditedRef.current = true;
                                        setCreateKey(e.target.value);
                                    }}
                                    placeholder="e.g. dog_owners"
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm font-mono"
                                />
                                <p className="mt-0.5 text-xs text-[#59678b]">Lowercase letters, numbers, underscores only. 2–64 chars. Auto-generated from label unless edited.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Description</label>
                                <input
                                    type="text"
                                    value={createDescription}
                                    onChange={(e) => setCreateDescription(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Field type</label>
                                <select
                                    value={createFieldType}
                                    onChange={(e) => setCreateFieldType(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                >
                                    {FIELD_TYPES.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-[#59678b] mb-0.5">Section</label>
                                    <select
                                        value={
                                            sectionKeyInOptions(sectionOptions, createSectionKey)
                                                ? createSectionKey
                                                : (sectionOptions[0]?.value ?? "custom")
                                        }
                                        onChange={(e) => setCreateSectionKey(e.target.value)}
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                    >
                                        {sectionOptions.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-[#59678b] mb-0.5">Sort order</label>
                                    <input
                                        type="number"
                                        value={createSortOrder}
                                        onChange={(e) => setCreateSortOrder(Number(e.target.value) || 0)}
                                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-4">
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={createRequired} onChange={(e) => setCreateRequired(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Required
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={createVisibleForm} onChange={(e) => setCreateVisibleForm(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Form
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={createVisibleDrawer} onChange={(e) => setCreateVisibleDrawer(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Drawer
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={createVisibleTable} onChange={(e) => setCreateVisibleTable(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Table
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={createFilterable} onChange={(e) => setCreateFilterable(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Filterable
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={createSortable} onChange={(e) => setCreateSortable(e.target.checked)} className="rounded border-[#c4c8cc]" />
                                    Sortable
                                </label>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Placeholder</label>
                                <input
                                    type="text"
                                    value={createPlaceholder}
                                    onChange={(e) => setCreatePlaceholder(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">Help text</label>
                                <input
                                    type="text"
                                    value={createHelpText}
                                    onChange={(e) => setCreateHelpText(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            </div>
                            {isSelectLikeFieldType(createFieldType) && (
                                <div>
                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Option set</label>
                                    <OptionSetKeyPicker
                                        value={createOptionSetKey}
                                        onChange={setCreateOptionSetKey}
                                        disabled={!canMutate || createSaving}
                                        manageOptionSetsHref={manageOptionSetsHref}
                                    />
                                </div>
                            )}
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
                                {createSaving ? "Creating…" : "Create"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
