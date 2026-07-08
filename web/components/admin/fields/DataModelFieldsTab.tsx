"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import ConfigurationCategoryHeader from "@/components/adminV2/configuration/ConfigurationCategoryHeader";
import {
    archivedCategoryKeys,
    buildActiveConfigurationCategoryPickerOptions,
    orderedEntityCategoryKeys,
    resolveConfigurationCategoryLabel,
} from "@/lib/adminV2/configuration/configurationCategoryCatalog";
import { CONFIG_WORKSPACE_INLINE_EDITOR_SHELL_CLASS } from "@/lib/adminV2/configuration/configurationWorkspaceOperatorUi";
import DataModelFieldCreateRow, {
    type FieldInlineCreateValues,
} from "@/components/admin/fields/DataModelFieldCreateRow";
import DataModelFieldRow, { type FieldInlineEditValues } from "@/components/admin/fields/DataModelFieldRow";
import FieldOwnershipFilterTabs, {
    type FieldOwnershipFilter,
} from "@/components/admin/fields/FieldOwnershipFilterTabs";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { fetchFieldSectionRegistry, type FieldSectionRegistryRow } from "@/lib/admin/fieldSectionSelectOptions";
import {
    buildSettingsFieldCatalogEntries,
    countFieldsByOwnership,
    filterCatalogByOwnership,
    groupCatalogEntriesBySection,
    hubEntityApiTypes,
    type SettingsFieldCatalogEntry,
    type SettingsHubEntityKey,
} from "@/lib/fields/fieldCatalogForSettings";
import { isOperatorHiddenField } from "@/lib/fields/fieldSettingsOperatorUi";
import {
    buildFieldLifecyclePatch,
    readFieldLifecycleState,
    type FieldDeleteSafetySummary,
    type FieldLifecycleState,
} from "@/lib/fields/fieldLifecycleModel";

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
        requirement_policy: r.requirement_policy ?? null,
        interaction_policy: r.interaction_policy ?? null,
        created_at: String(r.created_at),
        updated_at: String(r.updated_at),
    };
}

type Props = {
    hubEntity: SettingsHubEntityKey;
    primaryEntityType: string;
    createSignal?: number;
    focusRefKey?: string | null;
    initialOwnershipFilter?: FieldOwnershipFilter;
    onOwnershipFilterChange?: (filter: FieldOwnershipFilter) => void;
    onCatalogChange?: (entries: SettingsFieldCatalogEntry[]) => void;
};

export default function DataModelFieldsTab({
    hubEntity,
    primaryEntityType,
    createSignal = 0,
    focusRefKey = null,
    initialOwnershipFilter = "all",
    onOwnershipFilterChange,
    onCatalogChange,
}: Props) {
    const { canMutate } = useAdminAuth();
    const [items, setItems] = useState<FieldDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [ownershipFilter, setOwnershipFilter] = useState<FieldOwnershipFilter>(initialOwnershipFilter);
    const [expandedRefKey, setExpandedRefKey] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [categoryRegistry, setCategoryRegistry] = useState<FieldSectionRegistryRow[]>([]);
    const [rowSaving, setRowSaving] = useState(false);
    const [rowError, setRowError] = useState<string | null>(null);
    const [createSaving, setCreateSaving] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [deleteSafetyById, setDeleteSafetyById] = useState<Record<string, FieldDeleteSafetySummary>>({});

    useEffect(() => {
        setOwnershipFilter(initialOwnershipFilter);
    }, [initialOwnershipFilter, hubEntity]);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const merged: FieldDef[] = [];
            for (const et of hubEntityApiTypes(hubEntity)) {
                const res = await fetch(`/api/admin/field-definitions?entity_type=${encodeURIComponent(et)}`);
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load fields");
                const raw = (json as { field_definitions?: Record<string, unknown>[] }).field_definitions ?? [];
                merged.push(...raw.map(toFieldDef));
            }
            setItems(merged);
        } catch (e) {
            setLoadError((e as Error).message);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [hubEntity]);

    useEffect(() => {
        void fetchItems();
    }, [fetchItems]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const registry = await fetchFieldSectionRegistry(primaryEntityType);
            if (!cancelled) {
                setCategoryRegistry(registry);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [primaryEntityType]);

    const activeCategoryOptions = useMemo(
        () => buildActiveConfigurationCategoryPickerOptions(hubEntity, categoryRegistry),
        [hubEntity, categoryRegistry],
    );

    useEffect(() => {
        if (createSignal > 0) {
            setCreating(true);
            setExpandedRefKey(null);
        }
    }, [createSignal]);

    useEffect(() => {
        if (focusRefKey) {
            setExpandedRefKey(focusRefKey);
            setCreating(false);
        }
    }, [focusRefKey]);

    const visibleCustom = useMemo(
        () =>
            items.filter(
                (row) =>
                    !isOperatorHiddenField(row.entity_type, {
                        field_key: row.field_key,
                        is_system: row.is_system,
                        label: row.label,
                        config: row.config,
                    }),
            ),
        [items],
    );

    const entries = useMemo(
        () =>
            buildSettingsFieldCatalogEntries({
                hubEntity,
                entityTypes: hubEntityApiTypes(hubEntity),
                customFields: visibleCustom,
                includeHiddenCustom: true,
                includeArchivedCustom: true,
            }),
        [hubEntity, visibleCustom],
    );

    useEffect(() => {
        onCatalogChange?.(entries);
    }, [entries, onCatalogChange]);

    const allCounts = countFieldsByOwnership(entries);
    const filtered = filterCatalogByOwnership(entries, ownershipFilter);
    const groups = groupCatalogEntriesBySection(filtered);
    const archivedKeys = archivedCategoryKeys(categoryRegistry);
    const sectionKeys = orderedEntityCategoryKeys(hubEntity, groups.keys(), categoryRegistry).filter((sectionKey) => {
        const sectionEntries = groups.get(sectionKey) ?? [];
        if (sectionEntries.length === 0) return false;
        if (archivedKeys.has(sectionKey)) return sectionEntries.length > 0;
        return true;
    });

    const saveEdit = async (entry: SettingsFieldCatalogEntry, values: FieldInlineEditValues) => {
        if (!entry.fieldDef || !canMutate) return;
        setRowSaving(true);
        setRowError(null);
        try {
            const lifecycle = values.is_active ? "active" : readFieldLifecycleState(entry.fieldDef) === "archived" ? "archived" : "hidden";
            const lifecyclePatch = buildFieldLifecyclePatch(lifecycle, entry.fieldDef);
            const res = await fetch(`/api/admin/field-definitions/${entry.fieldDef.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    label: values.label.trim() || null,
                    description: values.description.trim() || null,
                    help_text: values.help_text.trim() || null,
                    section_key: values.category_key.trim() || "custom",
                    ...lifecyclePatch,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
            const updated = toFieldDef(json as Record<string, unknown>);
            setItems((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
            setExpandedRefKey(null);
            await fetchItems();
        } catch (e) {
            setRowError((e as Error).message);
        } finally {
            setRowSaving(false);
        }
    };

    const applyLifecycle = async (entry: SettingsFieldCatalogEntry, state: FieldLifecycleState) => {
        if (!entry.fieldDef || !canMutate) return;
        setRowSaving(true);
        setRowError(null);
        try {
            const patch = buildFieldLifecyclePatch(state, entry.fieldDef);
            const res = await fetch(`/api/admin/field-definitions/${entry.fieldDef.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Lifecycle update failed");
            await fetchItems();
        } catch (e) {
            setRowError((e as Error).message);
        } finally {
            setRowSaving(false);
        }
    };

    const loadDeleteSafety = async (entry: SettingsFieldCatalogEntry) => {
        if (!entry.fieldDef || entry.ownership !== "custom") return;
        try {
            const res = await fetch(`/api/admin/field-definitions/${entry.fieldDef.id}/delete-safety`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) return;
            setDeleteSafetyById((prev) => ({
                ...prev,
                [entry.fieldDef!.id]: json as FieldDeleteSafetySummary,
            }));
        } catch {
            // non-blocking
        }
    };

    const deleteField = async (entry: SettingsFieldCatalogEntry) => {
        if (!entry.fieldDef || entry.fieldDef.is_system || !canMutate) return;
        const safety = deleteSafetyById[entry.fieldDef.id];
        if (safety && !safety.safe) {
            setRowError(safety.blockers.map((b) => b.label).join(" "));
            return;
        }
        if (!window.confirm(`Delete "${entry.label}"? This cannot be undone.`)) {
            return;
        }
        setRowSaving(true);
        setRowError(null);
        try {
            const res = await fetch(`/api/admin/field-definitions/${entry.fieldDef.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                const safety = (json as { safety?: FieldDeleteSafetySummary }).safety;
                if (safety?.blockers?.length) {
                    setRowError(safety.blockers.map((b) => b.label).join(" "));
                } else {
                    throw new Error((json as { error?: string }).error ?? "Delete failed");
                }
                return;
            }
            setExpandedRefKey(null);
            await fetchItems();
        } catch (e) {
            setRowError((e as Error).message);
        } finally {
            setRowSaving(false);
        }
    };

    const createField = async (values: FieldInlineCreateValues) => {
        if (!canMutate) return;
        const key = values.field_key.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
        if (!/^[a-z0-9_]{2,64}$/.test(key)) {
            setCreateError("Could not derive a valid key from the label.");
            return;
        }
        setCreateSaving(true);
        setCreateError(null);
        try {
            const res = await fetch("/api/admin/field-definitions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity_type: primaryEntityType,
                    field_key: key,
                    label: values.label.trim() || key,
                    description: values.description.trim() || null,
                    field_type: values.field_type,
                    section_key: values.category_key.trim() || "custom",
                    sort_order: 100,
                    is_required: false,
                    is_active: values.is_active,
                    is_visible_in_form: values.is_active,
                    is_visible_in_drawer: values.is_active,
                    is_visible_in_table: values.is_active,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.status === 409) {
                setCreateError((json as { error?: string }).error ?? "Key already exists.");
                return;
            }
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Create failed");
            setCreating(false);
            await fetchItems();
        } catch (e) {
            setCreateError((e as Error).message);
        } finally {
            setCreateSaving(false);
        }
    };

    return (
        <div className="min-w-0 space-y-2.5" data-testid="data-model-fields-tab">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <FieldOwnershipFilterTabs
                    value={ownershipFilter}
                    onChange={(next) => {
                        setOwnershipFilter(next);
                        onOwnershipFilterChange?.(next);
                    }}
                    counts={{
                        all: allCounts.total,
                        platform: allCounts.platform,
                        custom: allCounts.custom,
                        computed: allCounts.computed,
                    }}
                />
                {canMutate ? (
                    <button
                        type="button"
                        onClick={() => {
                            setCreating(true);
                            setExpandedRefKey(null);
                        }}
                        className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-alloy-bend-pine/90"
                        data-testid="fields-tab-add-field"
                    >
                        Add Field
                    </button>
                ) : null}
            </div>

            {loadError ? <p className="text-xs text-alloy-ember">{loadError}</p> : null}
            {loading ? <p className="text-[12px] text-alloy-midnight/45">Loading fields…</p> : null}

            <div className={CONFIG_WORKSPACE_INLINE_EDITOR_SHELL_CLASS}>
                <DataModelFieldCreateRow
                    open={creating}
                    activeCategoryOptions={activeCategoryOptions}
                    saving={createSaving}
                    error={createError}
                    canMutate={canMutate}
                    onCancel={() => {
                        setCreating(false);
                        setCreateError(null);
                    }}
                    onCreate={createField}
                />
            </div>

            {!loading && filtered.length === 0 ? (
                <p className="text-[12px] text-alloy-midnight/55">No fields match this filter.</p>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-2">
                {sectionKeys.map((sectionKey) => {
                    const sectionEntries = groups.get(sectionKey) ?? [];
                    if (sectionEntries.length === 0) return null;
                    const baseLabel = resolveConfigurationCategoryLabel(sectionKey, categoryRegistry, hubEntity);
                    const isArchived = archivedKeys.has(sectionKey);
                    const label = isArchived ? `${baseLabel} · Archived` : baseLabel;
                    return (
                        <section
                            key={sectionKey}
                            data-testid={`field-category-group-${sectionKey}`}
                            data-archived={isArchived ? "true" : "false"}
                        >
                            <ConfigurationCategoryHeader label={label} testId={`field-category-${sectionKey}`} />
                            <div
                                className="overflow-hidden rounded-lg border border-alloy-forge/12 bg-white"
                                data-testid="data-model-field-section-list"
                            >
                                {sectionEntries.map((entry) => (
                                    <DataModelFieldRow
                                        key={entry.id}
                                        entry={entry}
                                        hubEntity={hubEntity}
                                        expanded={expandedRefKey === entry.refKey}
                                        onExpand={() => {
                                            setCreating(false);
                                            setExpandedRefKey(entry.refKey);
                                            setRowError(null);
                                            void loadDeleteSafety(entry);
                                        }}
                                        onCollapse={() => {
                                            setExpandedRefKey(null);
                                            setRowError(null);
                                        }}
                                        canMutate={canMutate}
                                        activeCategoryOptions={activeCategoryOptions}
                                        deleteSafety={
                                            entry.fieldDef ? deleteSafetyById[entry.fieldDef.id] ?? null : null
                                        }
                                        saving={rowSaving && expandedRefKey === entry.refKey}
                                        error={expandedRefKey === entry.refKey ? rowError : null}
                                        onLifecycle={(state) => applyLifecycle(entry, state)}
                                        onSave={(values) => saveEdit(entry, values)}
                                        onDelete={() => deleteField(entry)}
                                    />
                                ))}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
