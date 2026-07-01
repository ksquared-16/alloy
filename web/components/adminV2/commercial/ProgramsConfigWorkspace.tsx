"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SETTINGS_PAGE_SHELL_CLASS, SETTINGS_PAGE_INTRO_CLASS } from "@/lib/adminV2/settingsPageLayout";
import {
    resolveActiveProgramCategoriesForSite,
    slugifyLocationProgramCategoryKey,
    suggestNextLocationProgramCategorySortOrder,
    type LocationProgramCategoryRow,
} from "@/lib/locations/locationProgramCategories";
import OwnershipBadge from "@/components/configRuntime/OwnershipBadge";

type SiteRow = { id: string; label: string | null; location_type: string };

export default function ProgramsConfigWorkspace() {
    const [sites, setSites] = useState<SiteRow[]>([]);
    const [categories, setCategories] = useState<LocationProgramCategoryRow[]>([]);
    const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [addDraft, setAddDraft] = useState({ label: "", key: "" });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const [locRes, catRes] = await Promise.all([
                    fetch("/api/admin/locations", { credentials: "include" }),
                    fetch("/api/admin/location-program-categories?include_inactive=true", {
                        credentials: "include",
                    }),
                ]);
                const locJson = (await locRes.json().catch(() => ({}))) as { locations?: SiteRow[]; error?: string };
                const catJson = (await catRes.json().catch(() => ({}))) as {
                    categories?: LocationProgramCategoryRow[];
                    error?: string;
                };
                if (!cancelled) {
                    const siteList: SiteRow[] = (locJson.locations ?? []).filter(
                        (l) => l.location_type === "site"
                    );
                    setSites(siteList);
                    setCategories(catJson.categories ?? []);
                    if (siteList.length > 0 && !activeSiteId) {
                        setActiveSiteId(siteList[0]!.id);
                    }
                }
            } catch (e) {
                if (!cancelled) setError((e as Error).message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const siteCategories = activeSiteId
        ? categories.filter((c) => c.location_id === activeSiteId)
        : [];

    const activeCategories = activeSiteId
        ? resolveActiveProgramCategoriesForSite(siteCategories, activeSiteId)
        : [];

    const patchCategory = useCallback(
        async (id: string, patch: { label?: string; is_active?: boolean; sort_order?: number }) => {
            setSavingId(id);
            try {
                const res = await fetch("/api/admin/location-program-categories", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ updates: [{ id, ...patch }] }),
                });
                const json = (await res.json().catch(() => ({}))) as {
                    categories?: LocationProgramCategoryRow[];
                    error?: string;
                };
                if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
                const updated = json.categories?.[0];
                if (updated) {
                    setCategories((prev) =>
                        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
                    );
                }
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setSavingId(null);
            }
        },
        []
    );

    const createCategory = useCallback(async () => {
        if (!activeSiteId) return;
        const label = addDraft.label.trim();
        if (!label) {
            setError("Enter a program name.");
            return;
        }
        const key = addDraft.key.trim()
            ? slugifyLocationProgramCategoryKey(addDraft.key)
            : slugifyLocationProgramCategoryKey(label);

        setCreating(true);
        try {
            const res = await fetch("/api/admin/location-program-categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    location_id: activeSiteId,
                    label,
                    key,
                    sort_order: suggestNextLocationProgramCategorySortOrder(categories, activeSiteId),
                }),
            });
            const json = (await res.json().catch(() => ({}))) as {
                category?: LocationProgramCategoryRow;
                error?: string;
            };
            if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
            if (json.category) {
                setCategories((prev) => [...prev, json.category!]);
                setAddDraft({ label: "", key: "" });
            }
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setCreating(false);
        }
    }, [activeSiteId, addDraft, categories]);

    const inputClass =
        "rounded border border-alloy-forge/15 bg-white px-2 py-1 text-xs text-alloy-midnight focus:border-alloy-pine/40 focus:outline-none focus:ring-1 focus:ring-alloy-pine/20";

    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS}>
            <header className="flex items-center gap-3">
                <Link
                    href="/settings/commercial"
                    className="text-xs text-alloy-midnight/40 hover:text-alloy-midnight/70"
                >
                    Programs & Tuition
                </Link>
                <span className="text-alloy-midnight/25">/</span>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Programs</h1>
            </header>

            <p className={SETTINGS_PAGE_INTRO_CLASS}>
                Define what programs your centers offer. Each location can have its own program
                offerings — programs appear in enrollment intake, rooms, and waitlists.
            </p>

            {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}{" "}
                    <button
                        onClick={() => setError(null)}
                        className="ml-2 text-red-500 underline"
                    >
                        Dismiss
                    </button>
                </div>
            ) : null}

            {loading ? (
                <p className="text-sm text-alloy-midnight/50">Loading programs…</p>
            ) : sites.length === 0 ? (
                <div className="rounded-xl border border-alloy-forge/12 bg-white/90 p-6 text-center">
                    <p className="text-sm text-alloy-midnight/60">
                        Add a site location first in{" "}
                        <Link href="/admin/settings/locations" className="text-alloy-pine underline">
                            Settings → Locations
                        </Link>{" "}
                        to configure programs.
                    </p>
                </div>
            ) : (
                <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
                    {/* Location selector */}
                    <div className="space-y-1">
                        <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            Location
                        </p>
                        {sites.map((site) => {
                            const catCount = categories.filter(
                                (c) => c.location_id === site.id && c.is_active !== false
                            ).length;
                            return (
                                <button
                                    key={site.id}
                                    type="button"
                                    onClick={() => setActiveSiteId(site.id)}
                                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                        activeSiteId === site.id
                                            ? "bg-alloy-midnight/8 font-medium text-alloy-midnight"
                                            : "text-alloy-midnight/65 hover:bg-alloy-midnight/4"
                                    }`}
                                >
                                    <span className="truncate">
                                        {(site.label ?? "Untitled site").trim() || "Untitled site"}
                                    </span>
                                    <span className="shrink-0 text-[10px] text-alloy-midnight/35">
                                        {catCount}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Programs canvas */}
                    {activeSiteId ? (
                        <div className="space-y-4">
                            {/* Section header */}
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-semibold text-alloy-midnight">
                                        {(
                                            sites.find((s) => s.id === activeSiteId)?.label ?? "Site"
                                        ).trim() || "Site"}
                                    </h2>
                                    <p className="text-xs text-alloy-midnight/50">
                                        {activeCategories.length} active program
                                        {activeCategories.length !== 1 ? "s" : ""}
                                        {siteCategories.length > activeCategories.length
                                            ? ` · ${siteCategories.length - activeCategories.length} inactive`
                                            : ""}
                                    </p>
                                </div>
                                <OwnershipBadge owner="location" />
                            </div>

                            {/* Add program — above the list */}
                            <div className="overflow-hidden rounded-xl border border-alloy-forge/12 bg-white/90 shadow-sm">
                                <div className="border-b border-alloy-forge/10 bg-alloy-stone/20 px-4 py-2.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                        Add program
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-end gap-2 px-4 py-3">
                                    <label className="flex min-w-[140px] flex-1 flex-col gap-0.5">
                                        <span className="text-[10px] text-alloy-midnight/50">Name</span>
                                        <input
                                            type="text"
                                            value={addDraft.label}
                                            disabled={creating}
                                            placeholder="e.g. Summer Camp"
                                            className={inputClass}
                                            onChange={(e) =>
                                                setAddDraft((d) => ({ ...d, label: e.target.value }))
                                            }
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") void createCategory();
                                            }}
                                        />
                                    </label>
                                    <label className="flex min-w-[120px] flex-col gap-0.5">
                                        <span className="text-[10px] text-alloy-midnight/50">
                                            Key <span className="text-alloy-midnight/30">(optional)</span>
                                        </span>
                                        <input
                                            type="text"
                                            value={addDraft.key}
                                            disabled={creating}
                                            placeholder="summer_camp"
                                            className={`${inputClass} font-mono text-[11px]`}
                                            onChange={(e) =>
                                                setAddDraft((d) => ({ ...d, key: e.target.value }))
                                            }
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        disabled={creating || !addDraft.label.trim()}
                                        onClick={() => void createCategory()}
                                        className="rounded-lg border border-alloy-pine/30 bg-alloy-pine/10 px-3 py-1.5 text-xs font-semibold text-alloy-pine hover:bg-alloy-pine/15 disabled:opacity-50"
                                    >
                                        {creating ? "Adding…" : "Add program"}
                                    </button>
                                </div>
                                <p className="border-t border-alloy-forge/6 px-4 py-2 text-[10px] text-alloy-midnight/35">
                                    Keys are stable identifiers used in enrollment data and the tuition grid.
                                    Auto-generated from name if left blank.
                                </p>
                            </div>

                            {/* Programs list */}
                            {siteCategories.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-alloy-forge/20 bg-alloy-stone/10 px-5 py-8 text-center">
                                    <p className="text-sm text-alloy-midnight/50">
                                        No programs yet — add one above.
                                    </p>
                                    <p className="mt-1 text-xs text-alloy-midnight/35">
                                        Programs appear in enrollment intake, rooms, and the tuition grid.
                                    </p>
                                </div>
                            ) : (
                                <div className="overflow-hidden rounded-xl border border-alloy-forge/12 bg-white/90 shadow-sm">
                                    <table className="w-full border-collapse text-sm">
                                        <thead>
                                            <tr className="border-b border-alloy-forge/10 bg-alloy-stone/20">
                                                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                                    Program
                                                </th>
                                                <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                                    Key
                                                </th>
                                                <th className="w-16 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                                    Order
                                                </th>
                                                <th className="w-20 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                                    Active
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {siteCategories.map((cat) => (
                                                <tr
                                                    key={cat.id}
                                                    className={`border-b border-alloy-forge/6 last:border-0 ${
                                                        cat.is_active === false ? "opacity-50" : ""
                                                    }`}
                                                >
                                                    <td className="px-4 py-2">
                                                        <input
                                                            type="text"
                                                            defaultValue={cat.label}
                                                            disabled={savingId === cat.id}
                                                            className={`${inputClass} w-full min-w-[120px]`}
                                                            onBlur={(e) => {
                                                                const next = e.target.value.trim();
                                                                if (!next || next === cat.label) return;
                                                                void patchCategory(cat.id, { label: next });
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/40">
                                                        {cat.key}
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <input
                                                            type="number"
                                                            defaultValue={cat.sort_order ?? 100}
                                                            disabled={savingId === cat.id}
                                                            min={1}
                                                            max={999}
                                                            className={`${inputClass} w-14`}
                                                            onBlur={(e) => {
                                                                const next = Number(e.target.value);
                                                                if (
                                                                    !Number.isFinite(next) ||
                                                                    next === (cat.sort_order ?? 100)
                                                                )
                                                                    return;
                                                                void patchCategory(cat.id, { sort_order: next });
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <button
                                                            type="button"
                                                            disabled={savingId === cat.id}
                                                            onClick={() =>
                                                                void patchCategory(cat.id, {
                                                                    is_active: cat.is_active === false,
                                                                })
                                                            }
                                                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                                                cat.is_active !== false
                                                                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                                                                    : "bg-alloy-stone/30 text-alloy-midnight/40 hover:bg-alloy-stone/50"
                                                            }`}
                                                        >
                                                            {cat.is_active !== false ? "Active" : "Inactive"}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="rounded-lg border border-alloy-forge/8 bg-alloy-stone/10 px-4 py-3">
                                <p className="text-xs text-alloy-midnight/50">
                                    Programs are configured per location. To set tuition rates, go to{" "}
                                    <Link href="/settings/commercial/tuition" className="text-alloy-pine underline">
                                        Tuition
                                    </Link>
                                    .
                                </p>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}
