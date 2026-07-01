"use client";

import { useCallback, useState } from "react";
import {
    resolveActiveProgramCategoriesForSite,
    slugifyLocationProgramCategoryKey,
    suggestNextLocationProgramCategorySortOrder,
    type LocationProgramCategoryRow,
} from "@/lib/locations/locationProgramCategories";

type SiteRow = {
    id: string;
    label?: string | null;
};

type Props = {
    sites: SiteRow[];
    categoriesBySite: Map<string, LocationProgramCategoryRow[]>;
    programCategories: LocationProgramCategoryRow[];
    onCategoriesChange: (next: LocationProgramCategoryRow[]) => void;
    onError: (message: string) => void;
    inputClass: string;
};

type AddDraft = {
    label: string;
    key: string;
};

export default function LocationProgramCategoriesSettingsPanel({
    sites,
    categoriesBySite,
    programCategories,
    onCategoriesChange,
    onError,
    inputClass,
}: Props) {
    const [categorySavingId, setCategorySavingId] = useState<string | null>(null);
    const [categoryCreatingSiteId, setCategoryCreatingSiteId] = useState<string | null>(null);
    const [addDraftBySite, setAddDraftBySite] = useState<Record<string, AddDraft>>({});
    const [expandedSiteIds, setExpandedSiteIds] = useState<Set<string>>(() => new Set(sites.map((s) => s.id)));

    const patchProgramCategory = useCallback(
        async (categoryId: string, patch: { label?: string; is_active?: boolean; sort_order?: number }) => {
            setCategorySavingId(categoryId);
            try {
                const res = await fetch("/api/admin/location-program-categories", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ updates: [{ id: categoryId, ...patch }] }),
                });
                const json = (await res.json().catch(() => ({}))) as {
                    categories?: LocationProgramCategoryRow[];
                    error?: string;
                };
                if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
                const updated = json.categories?.[0];
                if (updated) {
                    onCategoriesChange(
                        programCategories.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
                    );
                }
            } catch (e) {
                onError((e as Error).message);
            } finally {
                setCategorySavingId(null);
            }
        },
        [onCategoriesChange, onError, programCategories]
    );

    const createProgramCategory = useCallback(
        async (siteId: string) => {
            const draft = addDraftBySite[siteId] ?? { label: "", key: "" };
            const label = draft.label.trim();
            if (!label) {
                onError("Enter a program name before adding.");
                return;
            }
            const key = draft.key.trim()
                ? slugifyLocationProgramCategoryKey(draft.key)
                : slugifyLocationProgramCategoryKey(label);

            setCategoryCreatingSiteId(siteId);
            try {
                const res = await fetch("/api/admin/location-program-categories", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        location_id: siteId,
                        label,
                        key,
                        sort_order: suggestNextLocationProgramCategorySortOrder(programCategories, siteId),
                    }),
                });
                const json = (await res.json().catch(() => ({}))) as {
                    category?: LocationProgramCategoryRow;
                    error?: string;
                };
                if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
                if (json.category) {
                    onCategoriesChange([...programCategories, json.category]);
                    setAddDraftBySite((prev) => ({ ...prev, [siteId]: { label: "", key: "" } }));
                }
            } catch (e) {
                onError((e as Error).message);
            } finally {
                setCategoryCreatingSiteId(null);
            }
        },
        [addDraftBySite, onCategoriesChange, onError, programCategories]
    );

    const toggleSiteExpanded = (siteId: string) => {
        setExpandedSiteIds((prev) => {
            const next = new Set(prev);
            if (next.has(siteId)) next.delete(siteId);
            else next.add(siteId);
            return next;
        });
    };

    if (sites.length === 0) {
        return (
            <p className="text-xs text-alloy-midnight/45">
                Add a site location above to configure program categories.
            </p>
        );
    }

    return (
        <div className="space-y-2">
            {sites.map((site) => {
                const siteCategories = categoriesBySite.get(site.id) ?? [];
                const activeCategories = resolveActiveProgramCategoriesForSite(siteCategories, site.id);
                const expanded = expandedSiteIds.has(site.id);
                const draft = addDraftBySite[site.id] ?? { label: "", key: "" };
                const creating = categoryCreatingSiteId === site.id;
                const siteLabel = (site.label ?? "Untitled site").trim() || "Untitled site";

                return (
                    <div
                        key={site.id}
                        className="overflow-hidden rounded-md border border-alloy-forge/10 bg-white"
                    >
                        <button
                            type="button"
                            onClick={() => toggleSiteExpanded(site.id)}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-alloy-stone/15"
                        >
                            <span className="text-sm font-medium text-alloy-midnight/85">{siteLabel}</span>
                            <span className="text-[11px] text-alloy-midnight/45">
                                {activeCategories.length} active · {siteCategories.length} total
                            </span>
                        </button>

                        {expanded ? (
                            <div className="border-t border-alloy-forge/8 px-3 py-2.5">
                                {siteCategories.length === 0 ? (
                                    <p className="mb-2 text-xs text-alloy-midnight/45">
                                        No programs yet. Add one below — it will appear in lead intake, rooms, and
                                        waitlists for this site.
                                    </p>
                                ) : (
                                    <div className="mb-3 overflow-x-auto">
                                        <table className="w-full min-w-[420px] border-collapse text-xs">
                                            <thead>
                                                <tr className="border-b border-alloy-forge/10 text-left text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                                    <th className="py-1.5 pr-2">Program</th>
                                                    <th className="py-1.5 pr-2">Key</th>
                                                    <th className="py-1.5 pr-2 w-16">Order</th>
                                                    <th className="py-1.5 pr-2 w-16">Active</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {siteCategories.map((c) => {
                                                    const saving = categorySavingId === c.id;
                                                    return (
                                                        <tr
                                                            key={c.id}
                                                            className="border-b border-alloy-forge/6 last:border-0"
                                                        >
                                                            <td className="py-1.5 pr-2">
                                                                <input
                                                                    type="text"
                                                                    defaultValue={c.label}
                                                                    disabled={saving}
                                                                    className={`${inputClass} w-full min-w-[120px]`}
                                                                    onBlur={(e) => {
                                                                        const next = e.target.value.trim();
                                                                        if (!next || next === c.label) return;
                                                                        void patchProgramCategory(c.id, {
                                                                            label: next,
                                                                        });
                                                                    }}
                                                                />
                                                            </td>
                                                            <td className="py-1.5 pr-2 font-mono text-[10px] text-alloy-midnight/40">
                                                                {c.key}
                                                            </td>
                                                            <td className="py-1.5 pr-2">
                                                                <input
                                                                    type="number"
                                                                    defaultValue={c.sort_order ?? 100}
                                                                    disabled={saving}
                                                                    className={`${inputClass} w-14`}
                                                                    onBlur={(e) => {
                                                                        const next = Number(e.target.value);
                                                                        if (
                                                                            !Number.isFinite(next) ||
                                                                            next === (c.sort_order ?? 100)
                                                                        ) {
                                                                            return;
                                                                        }
                                                                        void patchProgramCategory(c.id, {
                                                                            sort_order: next,
                                                                        });
                                                                    }}
                                                                />
                                                            </td>
                                                            <td className="py-1.5 pr-2">
                                                                <input
                                                                    type="checkbox"
                                                                    defaultChecked={c.is_active !== false}
                                                                    disabled={saving}
                                                                    onChange={(e) => {
                                                                        void patchProgramCategory(c.id, {
                                                                            is_active: e.target.checked,
                                                                        });
                                                                    }}
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                <div className="rounded-md border border-dashed border-alloy-forge/15 bg-alloy-stone/10 px-2.5 py-2">
                                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                        Add program
                                    </p>
                                    <div className="flex flex-wrap items-end gap-2">
                                        <label className="flex min-w-[140px] flex-1 flex-col gap-0.5">
                                            <span className="text-[10px] text-alloy-midnight/45">Display name</span>
                                            <input
                                                type="text"
                                                value={draft.label}
                                                disabled={creating}
                                                placeholder="e.g. Summer Camp"
                                                className={inputClass}
                                                onChange={(e) =>
                                                    setAddDraftBySite((prev) => ({
                                                        ...prev,
                                                        [site.id]: {
                                                            ...draft,
                                                            label: e.target.value,
                                                        },
                                                    }))
                                                }
                                            />
                                        </label>
                                        <label className="flex min-w-[120px] flex-col gap-0.5">
                                            <span className="text-[10px] text-alloy-midnight/45">
                                                Key (optional)
                                            </span>
                                            <input
                                                type="text"
                                                value={draft.key}
                                                disabled={creating}
                                                placeholder="summer_camp"
                                                className={`${inputClass} font-mono text-[11px]`}
                                                onChange={(e) =>
                                                    setAddDraftBySite((prev) => ({
                                                        ...prev,
                                                        [site.id]: { ...draft, key: e.target.value },
                                                    }))
                                                }
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            disabled={creating || !draft.label.trim()}
                                            onClick={() => void createProgramCategory(site.id)}
                                            className="rounded-md border border-alloy-pine/30 bg-alloy-pine/10 px-3 py-1.5 text-xs font-semibold text-alloy-pine hover:bg-alloy-pine/15 disabled:opacity-50"
                                        >
                                            {creating ? "Adding…" : "Add program"}
                                        </button>
                                    </div>
                                    <p className="mt-1.5 text-[10px] text-alloy-midnight/40">
                                        Keys are stable identifiers stored on inquiry children. Leave key blank to
                                        auto-generate from the display name.
                                    </p>
                                </div>
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}
