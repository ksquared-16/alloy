"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import ConfigurationCategoryCreateRow from "@/components/adminV2/configuration/ConfigurationCategoryCreateRow";
import ConfigurationCategoryRow, {
    type ConfigurationCategoryRowModel,
} from "@/components/adminV2/configuration/ConfigurationCategoryRow";
import { CONFIG_WORKSPACE_INLINE_EDITOR_SHELL_CLASS } from "@/lib/adminV2/configuration/configurationWorkspaceOperatorUi";
import { entityCategorySeeds } from "@/lib/adminV2/configuration/configurationCategoryCatalog";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    fetchFieldSectionDefinitions,
    type FieldSectionDefinitionRow,
} from "@/lib/admin/fieldSectionSelectOptions";
import { hubEntityApiTypes, type SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

type Props = {
    hubEntity: SettingsHubEntityKey;
    primaryEntityType: string;
    createSignal?: number;
};

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

export default function DataModelCategoriesTab({
    hubEntity,
    primaryEntityType,
    createSignal = 0,
}: Props) {
    const { canMutate } = useAdminAuth();
    const [categories, setCategories] = useState<FieldSectionDefinitionRow[]>([]);
    const [fieldCounts, setFieldCounts] = useState<Map<string, number>>(new Map());
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [rowSaving, setRowSaving] = useState(false);
    const [rowError, setRowError] = useState<string | null>(null);
    const [showArchived, setShowArchived] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const [defs, ...fieldResponses] = await Promise.all([
                fetchFieldSectionDefinitions(primaryEntityType),
                ...hubEntityApiTypes(hubEntity).map((et) =>
                    fetch(`/api/admin/field-definitions?entity_type=${encodeURIComponent(et)}`).then((r) => r.json()),
                ),
            ]);
            const counts = new Map<string, number>();
            for (const json of fieldResponses) {
                const rows = ((json as { field_definitions?: Record<string, unknown>[] }).field_definitions ?? []).map(
                    toFieldDef,
                );
                for (const row of rows) {
                    const key = row.section_key?.trim() || "general";
                    counts.set(key, (counts.get(key) ?? 0) + 1);
                }
            }
            setCategories(defs.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)));
            setFieldCounts(counts);
        } catch (e) {
            setLoadError((e as Error).message);
            setCategories([]);
        } finally {
            setLoading(false);
        }
    }, [hubEntity, primaryEntityType]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (createSignal > 0) {
            setCreating(true);
            setExpandedId(null);
        }
    }, [createSignal]);

    const visibleCategories = useMemo(
        () =>
            categories.filter((c) => {
                if (!c.is_archived) return true;
                if (!showArchived) return false;
                return (fieldCounts.get(c.section_key) ?? 0) > 0;
            }),
        [categories, showArchived, fieldCounts],
    );

    const rowModels: ConfigurationCategoryRowModel[] = useMemo(
        () =>
            visibleCategories.map((c) => ({
                id: c.id,
                section_key: c.section_key,
                label: c.label,
                description: c.description,
                sort_order: c.sort_order,
                is_archived: c.is_archived,
                field_count: fieldCounts.get(c.section_key) ?? 0,
            })),
        [visibleCategories, fieldCounts],
    );

    const saveCategory = async (id: string, values: { label: string; description: string }) => {
        if (!canMutate) return;
        setRowSaving(true);
        setRowError(null);
        try {
            const res = await fetch(`/api/admin/field-sections/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    label: values.label,
                    description: values.description || null,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
            setExpandedId(null);
            await load();
        } catch (e) {
            setRowError((e as Error).message);
        } finally {
            setRowSaving(false);
        }
    };

    const archiveCategory = async (id: string) => {
        if (!canMutate) return;
        setRowSaving(true);
        setRowError(null);
        try {
            const res = await fetch(`/api/admin/field-sections/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_archived: true }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Archive failed");
            setExpandedId(null);
            await load();
        } catch (e) {
            setRowError((e as Error).message);
        } finally {
            setRowSaving(false);
        }
    };

    const reorderCategory = async (id: string, direction: "up" | "down") => {
        if (!canMutate) return;
        const idx = visibleCategories.findIndex((c) => c.id === id);
        if (idx < 0) return;
        const swapIdx = direction === "up" ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= visibleCategories.length) return;
        const current = visibleCategories[idx]!;
        const adjacent = visibleCategories[swapIdx]!;
        setRowSaving(true);
        setRowError(null);
        try {
            const [resA, resB] = await Promise.all([
                fetch(`/api/admin/field-sections/${current.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sort_order: adjacent.sort_order }),
                }),
                fetch(`/api/admin/field-sections/${adjacent.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sort_order: current.sort_order }),
                }),
            ]);
            if (!resA.ok || !resB.ok) throw new Error("Reorder failed");
            await load();
        } catch (e) {
            setRowError((e as Error).message);
        } finally {
            setRowSaving(false);
        }
    };

    const defaultSeedLabels = entityCategorySeeds(hubEntity)
        .map((s) => s.label)
        .join(" · ");

    return (
        <div className="min-w-0 space-y-2.5" data-testid="data-model-categories-tab">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-xl text-[11px] leading-snug text-alloy-midnight/55">
                    Categories organize this entity&apos;s vocabulary. Create a category, then assign fields to it.
                </p>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[10px] text-alloy-midnight/45">
                        <input
                            type="checkbox"
                            checked={showArchived}
                            onChange={(e) => setShowArchived(e.target.checked)}
                            className="rounded border-alloy-forge/20"
                        />
                        Show archived
                    </label>
                    {canMutate ? (
                        <button
                            type="button"
                            onClick={() => {
                                setCreating(true);
                                setExpandedId(null);
                            }}
                            className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-alloy-bend-pine/90"
                            data-testid="categories-tab-add"
                        >
                            Add Category
                        </button>
                    ) : null}
                </div>
            </div>

            {categories.length === 0 && !loading ? (
                <p className="text-[11px] text-alloy-midnight/45">
                    No custom categories yet. Defaults for this entity include: {defaultSeedLabels}
                </p>
            ) : null}

            <div className={CONFIG_WORKSPACE_INLINE_EDITOR_SHELL_CLASS}>
                <ConfigurationCategoryCreateRow
                    entityType={primaryEntityType}
                    open={creating}
                    canMutate={canMutate}
                    error={createError}
                    onCancel={() => {
                        setCreating(false);
                        setCreateError(null);
                    }}
                    onCreated={async () => {
                        setCreating(false);
                        setCreateError(null);
                        await load();
                    }}
                    onError={setCreateError}
                />
            </div>

            {loadError ? <p className="text-xs text-alloy-ember">{loadError}</p> : null}
            {loading ? <p className="text-[12px] text-alloy-midnight/45">Loading categories…</p> : null}

            {!loading && rowModels.length > 0 ? (
                <div
                    className="overflow-hidden rounded-lg border border-alloy-forge/12 bg-white lg:max-w-[48rem]"
                    data-testid="data-model-category-list"
                >
                    {rowModels.map((category, index) => (
                        <ConfigurationCategoryRow
                            key={category.id}
                            category={category}
                            expanded={expandedId === category.id}
                            canMutate={canMutate}
                            canMoveUp={index > 0}
                            canMoveDown={index < rowModels.length - 1}
                            saving={rowSaving && expandedId === category.id}
                            error={expandedId === category.id ? rowError : null}
                            onExpand={() => {
                                setCreating(false);
                                setExpandedId(category.id);
                                setRowError(null);
                            }}
                            onCollapse={() => {
                                setExpandedId(null);
                                setRowError(null);
                            }}
                            onSave={(values) => saveCategory(category.id, values)}
                            onArchive={() => archiveCategory(category.id)}
                            onMoveUp={() => reorderCategory(category.id, "up")}
                            onMoveDown={() => reorderCategory(category.id, "down")}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}
