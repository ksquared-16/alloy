"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import PrimaryButton from "@/components/PrimaryButton";
import { adminFieldEntitySingularLabel } from "@/lib/admin/adminFieldEntityDisplayLabel";
import type { OptionSetUsageBlocker } from "@/lib/admin/collectOptionSetUsage";
import { uniqueAdminKey } from "@/lib/admin/slugifyAdminKey";
import {
    ALLOWED_FILTER_OPERATORS,
    ALLOWED_REFERENCE_ENTITIES,
    getOptionSetMode,
    normalizeOptionSetConfig,
    optionSetModeLabel,
    referenceEntityLabel,
    type OptionSetCascadeBinding,
    type OptionSetConfig,
    type OptionSetMode,
    type OptionSetReferenceFilter,
    type ReferenceEntity,
} from "@/lib/fields/optionSetConfig";

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
    config?: OptionSetConfig | Record<string, unknown>;
};

function emptyFilterRow(): OptionSetReferenceFilter {
    return { field: "", operator: "eq", value: "" };
}

function emptyCascadeBinding(): OptionSetCascadeBinding {
    return { bind_to_filter: "" };
}

function hydrateConfigForm(config: unknown): {
    mode: OptionSetMode;
    refEntity: ReferenceEntity;
    valueField: string;
    labelField: string;
    filters: OptionSetReferenceFilter[];
    cascadeBindings: OptionSetCascadeBinding[];
} {
    const normalized = normalizeOptionSetConfig(config);
    if (normalized.mode === "static") {
        return {
            mode: "static",
            refEntity: "locations",
            valueField: "id",
            labelField: "label",
            filters: [],
            cascadeBindings: [],
        };
    }
    return {
        mode: "reference",
        refEntity: normalized.reference?.entity ?? "locations",
        valueField: normalized.reference?.value_field ?? "id",
        labelField: normalized.reference?.label_field ?? "label",
        filters: normalized.reference?.filters ? [...normalized.reference.filters] : [],
        cascadeBindings: normalized.cascade?.depends_on ? [...normalized.cascade.depends_on] : [],
    };
}

function buildConfigFromForm(args: {
    mode: OptionSetMode;
    refEntity: ReferenceEntity;
    valueField: string;
    labelField: string;
    filters: OptionSetReferenceFilter[];
    cascadeBindings: OptionSetCascadeBinding[];
}): OptionSetConfig {
    if (args.mode === "static") {
        return { version: 1, mode: "static" };
    }
    const reference = {
        entity: args.refEntity,
        value_field: args.valueField.trim() || "id",
        label_field: args.labelField.trim() || "label",
        ...(args.filters.length > 0
            ? {
                  filters: args.filters
                      .filter((f) => f.field.trim())
                      .map((f) => ({
                          field: f.field.trim(),
                          operator: f.operator,
                          value: f.value,
                      })),
              }
            : {}),
    };
    const cascadeBindings = args.cascadeBindings.filter(
        (b) => (b.bind_to_filter ?? "").trim() || (b.bind_to_metadata ?? "").trim()
    );
    return {
        version: 1,
        mode: "reference",
        reference,
        ...(cascadeBindings.length > 0 ? { cascade: { depends_on: cascadeBindings } } : {}),
    };
}

type ItemRow = {
    id: string;
    item_key: string;
    label: string;
    sort_order: number;
    metadata: Record<string, unknown>;
};

export default function OptionSetDetailClient({
    setKey,
    basePath = "/admin/system/option-sets",
    adminV2Chrome = false,
}: {
    setKey: string;
    basePath?: string;
    adminV2Chrome?: boolean;
}) {
    const { canMutate } = useAdminAuth();
    const { labels } = useEntityLabels();
    const [setRow, setSetRow] = useState<SetRow | null>(null);
    const [items, setItems] = useState<ItemRow[]>([]);
    const [blockers, setBlockers] = useState<OptionSetUsageBlocker[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [editLabel, setEditLabel] = useState("");
    const [editSortOrder, setEditSortOrder] = useState(0);
    const [editMode, setEditMode] = useState<OptionSetMode>("static");
    const [editRefEntity, setEditRefEntity] = useState<ReferenceEntity>("locations");
    const [editValueField, setEditValueField] = useState("id");
    const [editLabelField, setEditLabelField] = useState("label");
    const [editFilters, setEditFilters] = useState<OptionSetReferenceFilter[]>([]);
    const [editCascadeBindings, setEditCascadeBindings] = useState<OptionSetCascadeBinding[]>([]);
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

    const previewConfig = useMemo(
        () =>
            buildConfigFromForm({
                mode: editMode,
                refEntity: editRefEntity,
                valueField: editValueField,
                labelField: editLabelField,
                filters: editFilters,
                cascadeBindings: editCascadeBindings,
            }),
        [editMode, editRefEntity, editValueField, editLabelField, editFilters, editCascadeBindings]
    );

    const isReferenceMode = editMode === "reference";

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
            const hydrated = hydrateConfigForm(s.config);
            setEditMode(hydrated.mode);
            setEditRefEntity(hydrated.refEntity);
            setEditValueField(hydrated.valueField);
            setEditLabelField(hydrated.labelField);
            setEditFilters(hydrated.filters);
            setEditCascadeBindings(hydrated.cascadeBindings);
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
            const config = buildConfigFromForm({
                mode: editMode,
                refEntity: editRefEntity,
                valueField: editValueField,
                labelField: editLabelField,
                filters: editFilters,
                cascadeBindings: editCascadeBindings,
            });
            const res = await fetch(`/api/admin/option-sets/${encodedKey}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: editLabel.trim(), sort_order: editSortOrder, config }),
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
                <Link href={basePath} className="text-sm text-alloy-pine hover:underline">
                    ← Option sets
                </Link>
                <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
            </div>
        );
    }

    return (
        <>
            <div className="mb-4">
                <Link href={basePath} className="text-sm text-alloy-pine hover:underline">
                    ← Option sets
                </Link>
            </div>
            {adminV2Chrome ? (
                <SettingsPageHeader
                    title={setRow?.label ?? setKey}
                    subtitle={`Set key: ${setKey} · ${optionSetModeLabel(getOptionSetMode(setRow?.config))}`}
                    actions={
                        canMutate && !isReferenceMode ? (
                            <PrimaryButton onClick={openCreateItem}>Add item</PrimaryButton>
                        ) : undefined
                    }
                />
            ) : (
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <AdminPageHeader
                        title={setRow?.label ?? setKey}
                        subtitle={`Set key: ${setKey} · ${optionSetModeLabel(getOptionSetMode(setRow?.config))}`}
                    />
                    {canMutate && !isReferenceMode && <PrimaryButton onClick={openCreateItem}>Add item</PrimaryButton>}
                </div>
            )}

            {blockers.length > 0 && (
                <SectionCard title="Usage">
                    <p className="mb-2 text-sm text-[#59678b]">
                        This set is referenced elsewhere. You cannot delete the set until references are removed.
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-[#31394d]">
                        {blockers.map((b, i) =>
                            b.kind === "field_definition" ? (
                                <li key={`fd-${b.id}-${i}`}>
                                    {adminFieldEntitySingularLabel(labels, b.entity_type)} field{" "}
                                    <span className="font-mono">
                                        {b.entity_type}.{b.field_key}
                                    </span>
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

            {setRow && (
                <SectionCard title="Set details">
                    <div className="grid max-w-xl gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Label</label>
                            {canMutate ? (
                                <input
                                    type="text"
                                    value={editLabel}
                                    onChange={(e) => setEditLabel(e.target.value)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            ) : (
                                <p className="text-sm text-[#31394d]">{setRow.label}</p>
                            )}
                        </div>
                        <div>
                            <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Sort order</label>
                            {canMutate ? (
                                <input
                                    type="number"
                                    value={editSortOrder}
                                    onChange={(e) => setEditSortOrder(Number(e.target.value) || 0)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                />
                            ) : (
                                <p className="text-sm text-[#31394d]">{setRow.sort_order}</p>
                            )}
                        </div>
                        <div>
                            <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Mode</label>
                            {canMutate ? (
                                <select
                                    value={editMode}
                                    onChange={(e) => setEditMode(e.target.value as OptionSetMode)}
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                >
                                    <option value="static">Static list</option>
                                    <option value="reference">Reference-backed</option>
                                </select>
                            ) : (
                                <p className="text-sm text-[#31394d]">{optionSetModeLabel(editMode)}</p>
                            )}
                        </div>
                    </div>

                    {isReferenceMode && (
                        <div className="mt-4 space-y-4 rounded-md border border-[#e6e8ec] bg-[#f8f9fb] p-3">
                            <p className="text-sm text-[#59678b]">
                                Options resolve from org records at runtime. Fields bind to this set via{" "}
                                <span className="font-mono">option_set_key</span>.
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Reference entity</label>
                                    {canMutate ? (
                                        <select
                                            value={editRefEntity}
                                            onChange={(e) => setEditRefEntity(e.target.value as ReferenceEntity)}
                                            className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                        >
                                            {ALLOWED_REFERENCE_ENTITIES.map((entity) => (
                                                <option key={entity} value={entity}>
                                                    {referenceEntityLabel(entity)}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <p className="text-sm text-[#31394d]">{referenceEntityLabel(editRefEntity)}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Value field</label>
                                    {canMutate ? (
                                        <input
                                            type="text"
                                            value={editValueField}
                                            onChange={(e) => setEditValueField(e.target.value)}
                                            className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 font-mono text-sm"
                                        />
                                    ) : (
                                        <p className="font-mono text-sm text-[#31394d]">{editValueField}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Label field</label>
                                    {canMutate ? (
                                        <input
                                            type="text"
                                            value={editLabelField}
                                            onChange={(e) => setEditLabelField(e.target.value)}
                                            className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 font-mono text-sm"
                                        />
                                    ) : (
                                        <p className="font-mono text-sm text-[#31394d]">{editLabelField}</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium text-[#59678b]">Filters</span>
                                    {canMutate && (
                                        <button
                                            type="button"
                                            onClick={() => setEditFilters((prev) => [...prev, emptyFilterRow()])}
                                            className="text-xs font-medium text-alloy-pine hover:underline"
                                        >
                                            Add filter
                                        </button>
                                    )}
                                </div>
                                {editFilters.length === 0 ? (
                                    <p className="text-xs text-[#59678b]">No filters — all active records from the entity.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {editFilters.map((filter, index) => (
                                            <div key={`filter-${index}`} className="grid gap-2 sm:grid-cols-4">
                                                <input
                                                    type="text"
                                                    value={filter.field}
                                                    disabled={!canMutate}
                                                    onChange={(e) =>
                                                        setEditFilters((prev) =>
                                                            prev.map((row, i) =>
                                                                i === index ? { ...row, field: e.target.value } : row
                                                            )
                                                        )
                                                    }
                                                    placeholder="field"
                                                    className="rounded border border-[#e6e8ec] px-2 py-1.5 font-mono text-sm disabled:bg-[#eef0f4]"
                                                />
                                                <select
                                                    value={filter.operator}
                                                    disabled={!canMutate}
                                                    onChange={(e) =>
                                                        setEditFilters((prev) =>
                                                            prev.map((row, i) =>
                                                                i === index
                                                                    ? {
                                                                          ...row,
                                                                          operator: e.target.value as OptionSetReferenceFilter["operator"],
                                                                          value: e.target.value === "in" ? [] : "",
                                                                      }
                                                                    : row
                                                            )
                                                        )
                                                    }
                                                    className="rounded border border-[#e6e8ec] px-2 py-1.5 text-sm disabled:bg-[#eef0f4]"
                                                >
                                                    {ALLOWED_FILTER_OPERATORS.map((op) => (
                                                        <option key={op} value={op}>
                                                            {op}
                                                        </option>
                                                    ))}
                                                </select>
                                                <input
                                                    type="text"
                                                    value={
                                                        Array.isArray(filter.value)
                                                            ? filter.value.join(", ")
                                                            : filter.value
                                                    }
                                                    disabled={!canMutate}
                                                    onChange={(e) =>
                                                        setEditFilters((prev) =>
                                                            prev.map((row, i) =>
                                                                i === index
                                                                    ? {
                                                                          ...row,
                                                                          value:
                                                                              row.operator === "in"
                                                                                  ? e.target.value
                                                                                        .split(",")
                                                                                        .map((v) => v.trim())
                                                                                        .filter(Boolean)
                                                                                  : e.target.value,
                                                                      }
                                                                    : row
                                                            )
                                                        )
                                                    }
                                                    placeholder={filter.operator === "in" ? "a, b, c" : "value"}
                                                    className="rounded border border-[#e6e8ec] px-2 py-1.5 font-mono text-sm disabled:bg-[#eef0f4] sm:col-span-2"
                                                />
                                                {canMutate && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setEditFilters((prev) => prev.filter((_, i) => i !== index))
                                                        }
                                                        className="text-xs font-medium text-alloy-ember hover:underline sm:col-span-4 sm:justify-self-start"
                                                    >
                                                        Remove filter
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium text-[#59678b]">Cascade bindings</span>
                                    {canMutate && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setEditCascadeBindings((prev) => [...prev, emptyCascadeBinding()])
                                            }
                                            className="text-xs font-medium text-alloy-pine hover:underline"
                                        >
                                            Add binding
                                        </button>
                                    )}
                                </div>
                                {editCascadeBindings.length === 0 ? (
                                    <p className="text-xs text-[#59678b]">
                                        No cascade — options load without parent field values.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {editCascadeBindings.map((binding, index) => (
                                            <div key={`cascade-${index}`} className="grid gap-2 sm:grid-cols-3">
                                                <input
                                                    type="text"
                                                    value={binding.bind_to_filter}
                                                    disabled={!canMutate}
                                                    onChange={(e) =>
                                                        setEditCascadeBindings((prev) =>
                                                            prev.map((row, i) =>
                                                                i === index
                                                                    ? { ...row, bind_to_filter: e.target.value }
                                                                    : row
                                                            )
                                                        )
                                                    }
                                                    placeholder="bind_to_filter"
                                                    className="rounded border border-[#e6e8ec] px-2 py-1.5 font-mono text-sm disabled:bg-[#eef0f4]"
                                                />
                                                <input
                                                    type="text"
                                                    value={binding.bind_to_metadata ?? ""}
                                                    disabled={!canMutate}
                                                    onChange={(e) =>
                                                        setEditCascadeBindings((prev) =>
                                                            prev.map((row, i) =>
                                                                i === index
                                                                    ? {
                                                                          ...row,
                                                                          bind_to_metadata: e.target.value || undefined,
                                                                      }
                                                                    : row
                                                            )
                                                        )
                                                    }
                                                    placeholder="bind_to_metadata (optional)"
                                                    className="rounded border border-[#e6e8ec] px-2 py-1.5 font-mono text-sm disabled:bg-[#eef0f4]"
                                                />
                                                <label className="flex items-center gap-2 text-xs text-[#59678b]">
                                                    <input
                                                        type="checkbox"
                                                        checked={binding.optional === true}
                                                        disabled={!canMutate}
                                                        onChange={(e) =>
                                                            setEditCascadeBindings((prev) =>
                                                                prev.map((row, i) =>
                                                                    i === index
                                                                        ? { ...row, optional: e.target.checked }
                                                                        : row
                                                                )
                                                            )
                                                        }
                                                    />
                                                    Optional
                                                </label>
                                                {canMutate && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setEditCascadeBindings((prev) =>
                                                                prev.filter((_, i) => i !== index)
                                                            )
                                                        }
                                                        className="text-xs font-medium text-alloy-ember hover:underline sm:col-span-3"
                                                    >
                                                        Remove binding
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="mb-0.5 block text-xs font-medium text-[#59678b]">Config preview</label>
                                <pre className="max-h-48 overflow-auto rounded border border-[#e6e8ec] bg-white p-2 font-mono text-xs text-[#31394d]">
                                    {JSON.stringify(previewConfig, null, 2)}
                                </pre>
                            </div>
                        </div>
                    )}

                    {canMutate && (
                        <>
                            {setSaveError && <p className="mt-2 text-sm text-red-600">{setSaveError}</p>}
                            <button
                                type="button"
                                onClick={saveSet}
                                disabled={setSaving}
                                className="mt-3 rounded bg-alloy-midnight px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                                {setSaving ? "Saving…" : "Save set"}
                            </button>
                        </>
                    )}
                </SectionCard>
            )}

            <SectionCard title={isReferenceMode ? "Static items (legacy / unused at runtime)" : "Items"}>
                {isReferenceMode && (
                    <p className="mb-3 text-sm text-[#59678b]">
                        Reference-backed sets resolve options from records. Items below are not used at runtime in Phase 1.
                    </p>
                )}
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
