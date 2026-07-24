"use client";

/**
 * Entity → Fields → manage categories, in place.
 *
 * Categories are `field_section_definitions` rows, so this panel is a thin,
 * honest surface over `/api/admin/field-sections`: POST to add, PATCH to rename /
 * reorder / archive. Nothing navigates away.
 *
 * One wrinkle worth knowing: a category can exist for an entity without any org
 * row behind it, because the platform ships seed categories. There is nothing to
 * PATCH in that case, so the first rename/reorder/archive of a seed category
 * materializes an org row for it first (`ensureCategoryRow`) and then edits that
 * row. That is the same thing the standalone Categories surface does — the
 * operator just never has to know it happened.
 */

import { useEffect, useMemo, useState } from "react";
import ConfigurationAdvancedToggle from "@/components/adminV2/configuration/ConfigurationAdvancedToggle";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import {
    entityDefinitionApiType,
    type EntityFieldCategoryVm,
    type EntityWorkspaceVm,
} from "@/lib/dataModel/dataModelWorkspaceVm";

const CATEGORY_KEY_REGEX = /^[a-z0-9_]{2,64}$/;

function slugifyCategoryKey(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64);
}

type FieldSectionRow = {
    id: string;
    section_key: string;
    label: string | null;
    description: string | null;
    sort_order: number;
    is_archived: boolean;
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function errorFrom(json: Record<string, unknown>, fallback: string): string {
    const raw = json.error;
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object" && typeof (raw as { message?: string }).message === "string") {
        return (raw as { message: string }).message;
    }
    return fallback;
}

export function EntityFieldCategoriesPanel({
    entity,
    canMutate,
    configLocked,
    onCategoriesChanged,
    onClose,
    testId = "entity-field-categories-panel",
}: {
    entity: EntityWorkspaceVm;
    canMutate: boolean;
    configLocked: boolean;
    /** Fired with the freshly reloaded category list after any successful mutation. */
    onCategoriesChanged: (categories: readonly EntityFieldCategoryVm[]) => void;
    onClose: () => void;
    testId?: string;
}) {
    const apiEntityType = entityDefinitionApiType(entity.hubKey);
    const canEdit = canMutate && !configLocked;

    const [rows, setRows] = useState<readonly EntityFieldCategoryVm[]>(entity.fieldCategories);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [renamingKey, setRenamingKey] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [creating, setCreating] = useState(false);
    const [newLabel, setNewLabel] = useState("");
    const [newKey, setNewKey] = useState("");
    const [keyTouched, setKeyTouched] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    useEffect(() => {
        setRows(entity.fieldCategories);
    }, [entity.fieldCategories]);

    const derivedKey = useMemo(() => (keyTouched ? newKey : slugifyCategoryKey(newLabel)), [
        keyTouched,
        newKey,
        newLabel,
    ]);

    /**
     * Re-read the org rows and rebuild the category list the same way the server
     * does, so the panel and the field list can never disagree about labels or order.
     */
    const reload = async () => {
        const res = await fetch(`/api/admin/field-sections?entity_type=${encodeURIComponent(apiEntityType)}`);
        const json = await readJson(res);
        if (!res.ok) throw new Error(errorFrom(json, "Could not load categories"));
        const sections = Array.isArray(json.sections) ? (json.sections as FieldSectionRow[]) : [];
        const byKey = new Map(sections.map((row) => [String(row.section_key).trim(), row] as const));

        const next: EntityFieldCategoryVm[] = [];
        const seen = new Set<string>();
        for (const row of sections) {
            const key = String(row.section_key).trim();
            if (!key || row.is_archived === true || seen.has(key)) continue;
            seen.add(key);
            next.push({
                key,
                label: (row.label ?? "").trim() || key,
                fieldCount: entity.fields.filter((field) => field.categoryKey === key).length,
                registryId: String(row.id),
                description: row.description ?? null,
                sortOrder: Number(row.sort_order) || 0,
                isPlatformSeed: entity.fieldCategories.some((c) => c.key === key && c.isPlatformSeed),
            });
        }
        // Seed and in-use categories with no org row still belong to the entity.
        for (const category of entity.fieldCategories) {
            if (seen.has(category.key)) continue;
            const row = byKey.get(category.key);
            if (row?.is_archived === true) continue;
            seen.add(category.key);
            next.push({ ...category, registryId: row ? String(row.id) : null });
        }
        next.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

        setRows(next);
        onCategoriesChanged(next);
        return next;
    };

    /** Guarantee an org row exists for a category so it can be renamed/reordered/archived. */
    const ensureCategoryRow = async (category: EntityFieldCategoryVm): Promise<string> => {
        if (category.registryId) return category.registryId;
        const res = await fetch("/api/admin/field-sections", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                entity_type: apiEntityType,
                section_key: category.key,
                label: category.label,
                sort_order: category.sortOrder,
            }),
        });
        const json = await readJson(res);
        if (!res.ok) throw new Error(errorFrom(json, "Could not customize this category"));
        return String((json as { id?: string }).id ?? "");
    };

    const run = async (key: string, action: () => Promise<void>) => {
        if (!canEdit) return;
        setBusyKey(key);
        setError(null);
        try {
            await action();
            await reload();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusyKey(null);
        }
    };

    const addCategory = () =>
        run("__new__", async () => {
            const key = derivedKey.trim().toLowerCase();
            if (!CATEGORY_KEY_REGEX.test(key)) {
                throw new Error("Enter a name of at least two letters or numbers.");
            }
            if (rows.some((row) => row.key === key)) {
                throw new Error("A category with this name already exists.");
            }
            const res = await fetch("/api/admin/field-sections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity_type: apiEntityType,
                    section_key: key,
                    label: newLabel.trim() || key,
                    sort_order: (rows[rows.length - 1]?.sortOrder ?? 0) + 10,
                }),
            });
            const json = await readJson(res);
            if (res.status === 409) throw new Error("A category with this name already exists.");
            if (!res.ok) throw new Error(errorFrom(json, "Could not add the category"));
            setCreating(false);
            setNewLabel("");
            setNewKey("");
            setKeyTouched(false);
        });

    const renameCategory = (category: EntityFieldCategoryVm) =>
        run(category.key, async () => {
            const label = renameValue.trim();
            if (!label) throw new Error("Category name cannot be empty.");
            const id = await ensureCategoryRow(category);
            const res = await fetch(`/api/admin/field-sections/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label }),
            });
            const json = await readJson(res);
            if (!res.ok) throw new Error(errorFrom(json, "Rename failed"));
            setRenamingKey(null);
        });

    const archiveCategory = (category: EntityFieldCategoryVm) =>
        run(category.key, async () => {
            if (category.fieldCount > 0) {
                throw new Error(
                    `Move the ${category.fieldCount} field${category.fieldCount === 1 ? "" : "s"} in ${category.label} to another category first.`,
                );
            }
            const id = await ensureCategoryRow(category);
            const res = await fetch(`/api/admin/field-sections/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_archived: true }),
            });
            const json = await readJson(res);
            if (!res.ok) throw new Error(errorFrom(json, "Archive failed"));
        });

    /**
     * Reorder writes explicit `sort_order` for the whole list. Seed categories only
     * carry an implicit platform order, so a partial write would leave the list
     * ambiguous — materializing every position is what makes the new order stick.
     */
    const moveCategory = (category: EntityFieldCategoryVm, direction: -1 | 1) =>
        run(category.key, async () => {
            const index = rows.findIndex((row) => row.key === category.key);
            const target = index + direction;
            if (index < 0 || target < 0 || target >= rows.length) return;
            const reordered = [...rows];
            const [moved] = reordered.splice(index, 1);
            if (!moved) return;
            reordered.splice(target, 0, moved);

            for (const [position, row] of reordered.entries()) {
                const sortOrder = (position + 1) * 10;
                if (row.registryId == null) {
                    const id = await ensureCategoryRow(row);
                    const res = await fetch(`/api/admin/field-sections/${id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sort_order: sortOrder }),
                    });
                    if (!res.ok) throw new Error(errorFrom(await readJson(res), "Reorder failed"));
                    continue;
                }
                if (row.sortOrder === sortOrder) continue;
                const res = await fetch(`/api/admin/field-sections/${row.registryId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sort_order: sortOrder }),
                });
                if (!res.ok) throw new Error(errorFrom(await readJson(res), "Reorder failed"));
            }
        });

    return (
        <ConfigWorkspaceCard
            title={`${entity.displayName} field categories`}
            description="How this entity's fields are grouped in forms, drawers, and this list."
            compact
            testId={testId}
        >
            <ul className="space-y-1" data-testid={`${testId}-list`}>
                {rows.map((category, index) => {
                    const busy = busyKey === category.key;
                    const renaming = renamingKey === category.key;
                    return (
                        <li
                            key={category.key}
                            className="rounded-md border border-alloy-forge/10 px-2 py-1.5"
                            data-testid={`${testId}-row-${category.key}`}
                        >
                            {renaming ?
                                <div className="flex flex-wrap items-center gap-2">
                                    <input
                                        autoFocus
                                        value={renameValue}
                                        onChange={(event) => setRenameValue(event.target.value)}
                                        className="min-w-0 flex-1 rounded-md border border-alloy-forge/15 bg-white px-2 py-1 text-[12px]"
                                        data-testid={`${testId}-rename-input`}
                                    />
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void renameCategory(category)}
                                        className="rounded-lg bg-alloy-bend-pine px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                                        data-testid={`${testId}-rename-save`}
                                    >
                                        {busy ? "Saving…" : "Save"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRenamingKey(null)}
                                        className="text-[11px] font-medium text-alloy-midnight/55 hover:underline"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            :   <div className="flex flex-wrap items-center gap-2">
                                    <span className="min-w-0 flex-1 truncate text-[12px] text-alloy-midnight">
                                        {category.label}
                                        <span className="ml-1.5 text-[10px] text-alloy-midnight/40">
                                            {category.fieldCount} field{category.fieldCount === 1 ? "" : "s"}
                                        </span>
                                    </span>
                                    {canEdit ?
                                        <span className="flex shrink-0 items-center gap-1.5">
                                            <button
                                                type="button"
                                                disabled={busy || index === 0}
                                                onClick={() => void moveCategory(category, -1)}
                                                aria-label={`Move ${category.label} up`}
                                                className="rounded px-1 text-[11px] text-alloy-midnight/50 hover:bg-alloy-stone/25 disabled:opacity-30"
                                                data-testid={`${testId}-move-up-${category.key}`}
                                            >
                                                ↑
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy || index === rows.length - 1}
                                                onClick={() => void moveCategory(category, 1)}
                                                aria-label={`Move ${category.label} down`}
                                                className="rounded px-1 text-[11px] text-alloy-midnight/50 hover:bg-alloy-stone/25 disabled:opacity-30"
                                                data-testid={`${testId}-move-down-${category.key}`}
                                            >
                                                ↓
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => {
                                                    setRenamingKey(category.key);
                                                    setRenameValue(category.label);
                                                    setError(null);
                                                }}
                                                className="text-[11px] font-medium text-alloy-bend-pine hover:underline disabled:opacity-50"
                                                data-testid={`${testId}-rename-${category.key}`}
                                            >
                                                Rename
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => void archiveCategory(category)}
                                                className="text-[11px] font-medium text-alloy-midnight/50 hover:underline disabled:opacity-50"
                                                data-testid={`${testId}-archive-${category.key}`}
                                            >
                                                Archive
                                            </button>
                                        </span>
                                    :   null}
                                </div>
                            }
                        </li>
                    );
                })}
            </ul>

            {error ?
                <p className="mt-2 text-xs text-alloy-ember" data-testid={`${testId}-error`}>
                    {error}
                </p>
            :   null}

            {canEdit ?
                creating ?
                    <div className="mt-2.5 space-y-2 border-t border-alloy-stone/25 pt-2.5">
                        <label className="block space-y-0.5">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                Category name
                            </span>
                            <input
                                autoFocus
                                value={newLabel}
                                onChange={(event) => setNewLabel(event.target.value)}
                                placeholder="e.g. Transportation"
                                className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                                data-testid={`${testId}-new-label`}
                            />
                        </label>
                        <div>
                            <ConfigurationAdvancedToggle
                                open={advancedOpen}
                                onToggle={() => setAdvancedOpen((open) => !open)}
                            />
                            {advancedOpen ?
                                <label className="mt-1.5 block space-y-0.5">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                        Internal reference
                                    </span>
                                    <input
                                        value={derivedKey}
                                        onChange={(event) => {
                                            setKeyTouched(true);
                                            setNewKey(event.target.value);
                                        }}
                                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 font-mono text-xs"
                                        data-testid={`${testId}-new-key`}
                                    />
                                    <span className="text-[10px] text-alloy-midnight/40">
                                        Generated from the name. Rarely needs changing.
                                    </span>
                                </label>
                            :   null}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={busyKey === "__new__"}
                                onClick={() => void addCategory()}
                                className="rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                                data-testid={`${testId}-create-save`}
                            >
                                {busyKey === "__new__" ? "Adding…" : "Add Category"}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setCreating(false);
                                    setError(null);
                                }}
                                className="text-[11px] font-medium text-alloy-midnight/55 hover:underline"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                :   <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-alloy-stone/25 pt-2.5">
                        <button
                            type="button"
                            onClick={() => setCreating(true)}
                            className="text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                            data-testid={`${testId}-add-category`}
                        >
                            Add Category
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-[11px] font-medium text-alloy-midnight/55 hover:underline"
                            data-testid={`${testId}-done`}
                        >
                            Done
                        </button>
                    </div>
            :   <p className="mt-2.5 border-t border-alloy-stone/25 pt-2.5 text-[11px] text-alloy-midnight/50">
                    {configLocked ?
                        "Configuration is locked for this organization."
                    :   "You do not have permission to change categories."}
                </p>
            }
        </ConfigWorkspaceCard>
    );
}
