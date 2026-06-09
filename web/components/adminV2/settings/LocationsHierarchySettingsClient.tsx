"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import { SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";
import { fetchLocationProgramCategories } from "@/lib/admin/location/fetchLocationProgramCategories";
import {
    buildLocationHierarchyTree,
    buildLocationTableRows,
    isDemoLocation,
    LOCATIONS_EDITOR_AGE_RANGE_INPUT_CLASS,
    LOCATIONS_EDITOR_AGE_RANGE_UNIT_CLASS,
    LOCATIONS_EDITOR_TABLE_COLUMN_CLASS,
    LOCATIONS_EDITOR_TABLE_COLUMNS,
    mergeLocationMetadataField,
    type LocationHierarchyRow,
} from "@/lib/adminV2/locationsHierarchyTablePresentation";
import {
    fetchOptionSetItemsBySetKey,
    mapOptionItemsToSelectOptions,
} from "@/lib/admin/location/locationDrawerFieldOptions";
import {
    indexLocationProgramCategoriesBySite,
    resolveActiveProgramCategoriesForSite,
    type LocationProgramCategoryRow,
} from "@/lib/locations/locationProgramCategories";
import LocationProgramCategoriesSettingsPanel from "@/components/adminV2/settings/LocationProgramCategoriesSettingsPanel";

type DeletionEligibility = { allowed: boolean; reason?: string | null };

const METADATA_EDIT_KEYS = [
    "category",
    "age_range_from",
    "age_range_to",
    "age_range_unit",
    "capacity",
    "student_teacher_ratio",
] as const;

function metadataString(metadata: unknown, key: string): string {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return "";
    return String((metadata as Record<string, unknown>)[key] ?? "").trim();
}

export default function LocationsHierarchySettingsClient() {
    const { openDrawer } = useAdminDrawer();
    const [rows, setRows] = useState<LocationHierarchyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [collapsedSites, setCollapsedSites] = useState<Set<string>>(new Set());
    const [savingId, setSavingId] = useState<string | null>(null);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [deleteReasonById, setDeleteReasonById] = useState<Record<string, string>>({});
    const [programCategories, setProgramCategories] = useState<LocationProgramCategoryRow[]>([]);
    const [ageUnitSelectOptions, setAgeUnitSelectOptions] = useState<{ value: string; label: string }[]>([]);

    const categoriesBySite = useMemo(
        () => indexLocationProgramCategoriesBySite(programCategories),
        [programCategories]
    );

    const siteRows = useMemo(
        () => rows.filter((r) => String(r.location_type ?? "").trim() === "site"),
        [rows]
    );

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const init = { credentials: "include" as const };
            const [categories, unitItems] = await Promise.all([
                fetchLocationProgramCategories(init, { includeInactive: true }),
                fetchOptionSetItemsBySetKey("location_age_range_unit", init),
            ]);
            if (cancelled) return;
            setProgramCategories(categories);
            setAgeUnitSelectOptions(mapOptionItemsToSelectOptions(unitItems));
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const fetchRows = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/locations?include_inactive=true&hierarchy=1");
            const json = (await res.json()) as { locations?: LocationHierarchyRow[]; error?: string };
            if (!res.ok) {
                setError(json.error ?? `Failed (${res.status})`);
                setRows([]);
                return;
            }
            setRows(json.locations ?? []);
        } catch (e) {
            setError((e as Error).message);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchRows();
    }, [fetchRows]);

    useEffect(() => {
        const onSaved = (e: Event) => {
            const d = (e as CustomEvent<{ type: string }>)?.detail;
            if (d?.type === "locations") void fetchRows();
        };
        window.addEventListener("admin-entity-saved", onSaved);
        return () => window.removeEventListener("admin-entity-saved", onSaved);
    }, [fetchRows]);

    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) => {
            const label = (r.label ?? "").toLowerCase();
            const city = (r.city ?? "").toLowerCase();
            const state = (r.state ?? "").toLowerCase();
            const type = (r.location_type ?? "").toLowerCase();
            return label.includes(q) || city.includes(q) || state.includes(q) || type.includes(q);
        });
    }, [rows, search]);

    const tree = useMemo(() => buildLocationHierarchyTree(filteredRows), [filteredRows]);
    const tableRows = useMemo(() => buildLocationTableRows(tree.roots, tree.byParent), [tree]);

    const visibleTableRows = useMemo(() => {
        const hiddenRoomParentIds = collapsedSites;
        return tableRows.filter((row) => {
            if (row.isSite) return true;
            if (!row.parentSiteId) return true;
            return !hiddenRoomParentIds.has(row.parentSiteId);
        });
    }, [tableRows, collapsedSites]);

    useEffect(() => {
        const demoRows = rows.filter(isDemoLocation);
        if (demoRows.length === 0) return;
        let cancelled = false;
        void (async () => {
            const next: Record<string, string> = {};
            for (const row of demoRows) {
                try {
                    const res = await fetch(
                        `/api/admin/deletion-eligibility?entity_type=locations&id=${encodeURIComponent(row.id)}`
                    );
                    const json = (await res.json()) as DeletionEligibility;
                    if (!json.allowed && json.reason) next[row.id] = json.reason;
                } catch {
                    /* ignore */
                }
            }
            if (!cancelled) setDeleteReasonById(next);
        })();
        return () => {
            cancelled = true;
        };
    }, [rows]);

    const patchLocation = async (id: string, body: Record<string, unknown>) => {
        setSavingId(id);
        try {
            const res = await fetch(`/api/admin/locations/${encodeURIComponent(id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
            await fetchRows();
        } catch (e) {
            window.alert((e as Error).message);
        } finally {
            setSavingId(null);
        }
    };

    const patchMetadataField = async (row: LocationHierarchyRow, fieldKey: string, value: string) => {
        const metadata = mergeLocationMetadataField(row.metadata, fieldKey, value.trim() || null);
        await patchLocation(row.id, { metadata });
    };

    const deactivateLocation = async (row: LocationHierarchyRow) => {
        if (!isDemoLocation(row)) {
            const reason = deleteReasonById[row.id];
            window.alert(reason ?? "This location cannot be removed from the active list.");
            return;
        }
        const label = row.label ?? "this location";
        if (!window.confirm(`Deactivate ${label}? This hides it from active lists.`)) return;
        setRemovingId(row.id);
        try {
            await patchLocation(row.id, { is_active: false });
        } finally {
            setRemovingId(null);
        }
    };

    const toggleSite = (siteId: string) => {
        setCollapsedSites((prev) => {
            const next = new Set(prev);
            if (next.has(siteId)) next.delete(siteId);
            else next.add(siteId);
            return next;
        });
    };

    const inputClass =
        "w-full min-w-0 rounded border border-alloy-forge/15 bg-white px-1.5 py-1 text-xs text-alloy-midnight/85 disabled:opacity-60";

    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS}>
            <SettingsPageHeader
                title="Locations"
                subtitle="Sites and rooms for org configuration. Edit room metadata inline; open a row for full site or room details."
                actions={
                    <button
                        type="button"
                        onClick={() => openDrawer({ type: "locations", id: "new" })}
                        className="rounded-md border border-alloy-pine/30 bg-alloy-pine/10 px-3 py-1.5 text-xs font-semibold text-alloy-pine hover:bg-alloy-pine/15"
                    >
                        Add location
                    </button>
                }
            />

            <div className="mb-3">
                <label className="sr-only" htmlFor="locations-search">
                    Search locations
                </label>
                <input
                    id="locations-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, city, or type…"
                    className="w-full max-w-md rounded-md border border-alloy-forge/15 bg-white px-3 py-2 text-sm text-alloy-midnight/85 placeholder:text-alloy-midnight/35"
                />
            </div>

            {loading ? (
                <p className="text-sm text-alloy-midnight/50">Loading locations…</p>
            ) : error ? (
                <p className="text-sm text-red-700">{error}</p>
            ) : visibleTableRows.length === 0 ? (
                <p className="text-sm text-alloy-midnight/50">
                    {search.trim() ? "No locations match your search." : "No org locations yet."}
                </p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-alloy-forge/12 bg-white/80">
                    <table
                        className="w-full table-fixed border-collapse text-sm"
                        data-locations-editor-table="true"
                    >
                        <thead>
                            <tr className="divide-x divide-alloy-stone/15 border-b border-alloy-stone/20 bg-alloy-stone/[0.05] text-left text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                {LOCATIONS_EDITOR_TABLE_COLUMNS.map((col) => (
                                    <th
                                        key={col}
                                        className={["px-2 py-2", LOCATIONS_EDITOR_TABLE_COLUMN_CLASS[col]].filter(Boolean).join(" ")}
                                    >
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-alloy-stone/12">
                            {visibleTableRows.map((row) => {
                                const source = rows.find((r) => r.id === row.id);
                                const demo = source ? isDemoLocation(source) : false;
                                const saving = savingId === row.id;
                                const removing = removingId === row.id;
                                const blockedReason = deleteReasonById[row.id];
                                const siteCollapsed = row.isSite && collapsedSites.has(row.id);
                                const childCount = tree.byParent.get(row.id)?.length ?? 0;
                                return (
                                    <tr key={row.id} className="divide-x divide-alloy-stone/15 align-middle">
                                        <td className="px-2 py-2">
                                            {row.isSite ? (
                                                <div className="flex items-center gap-1">
                                                    {childCount > 0 ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleSite(row.id)}
                                                            className="text-alloy-midnight/45 hover:text-alloy-midnight/70"
                                                            aria-label={siteCollapsed ? "Expand rooms" : "Collapse rooms"}
                                                        >
                                                            {siteCollapsed ? "▸" : "▾"}
                                                        </button>
                                                    ) : (
                                                        <span className="w-3" />
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => openDrawer({ type: "locations", id: row.id })}
                                                        className="text-left font-medium text-alloy-blue hover:underline"
                                                    >
                                                        {row.siteLabel ?? "Untitled site"}
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-alloy-midnight/35">—</span>
                                            )}
                                        </td>
                                        <td className="px-2 py-2">
                                            {row.isRoom ? (
                                                <button
                                                    type="button"
                                                    onClick={() => openDrawer({ type: "locations", id: row.id })}
                                                    className="text-left font-medium text-alloy-blue hover:underline"
                                                >
                                                    {row.roomLabel ?? "Untitled room"}
                                                </button>
                                            ) : (
                                                <span className="text-alloy-midnight/35">—</span>
                                            )}
                                        </td>
                                        <td className="px-2 py-2 text-xs text-alloy-midnight/70">{row.typeLabel}</td>
                                        <td className={["px-2 py-2", LOCATIONS_EDITOR_TABLE_COLUMN_CLASS.Category].filter(Boolean).join(" ")}>
                                            {row.isRoom && source ? (
                                                <select
                                                    defaultValue={row.category ?? ""}
                                                    disabled={saving}
                                                    className={`${inputClass} w-full max-w-full`}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        if ((row.category ?? "") === v) return;
                                                        void patchMetadataField(source, "category", v);
                                                    }}
                                                >
                                                    <option value="">—</option>
                                                    {resolveActiveProgramCategoriesForSite(
                                                        categoriesBySite.get(row.parentSiteId ?? "") ?? [],
                                                        row.parentSiteId
                                                    ).map((c) => (
                                                        <option key={c.id} value={c.key}>
                                                            {c.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className="text-alloy-midnight/35">—</span>
                                            )}
                                        </td>
                                        <td className={["px-2 py-2", LOCATIONS_EDITOR_TABLE_COLUMN_CLASS["Age Range"]].filter(Boolean).join(" ")}>
                                            {row.isRoom && source ? (
                                                <div className="flex flex-nowrap items-center gap-1">
                                                    <input
                                                        defaultValue={metadataString(source.metadata, "age_range_from")}
                                                        disabled={saving}
                                                        className={`${inputClass} ${LOCATIONS_EDITOR_AGE_RANGE_INPUT_CLASS}`}
                                                        placeholder="From"
                                                        onBlur={(e) => {
                                                            void patchMetadataField(source, "age_range_from", e.target.value);
                                                        }}
                                                    />
                                                    <span className="text-alloy-midnight/30">–</span>
                                                    <input
                                                        defaultValue={metadataString(source.metadata, "age_range_to")}
                                                        disabled={saving}
                                                        className={`${inputClass} ${LOCATIONS_EDITOR_AGE_RANGE_INPUT_CLASS}`}
                                                        placeholder="To"
                                                        onBlur={(e) => {
                                                            void patchMetadataField(source, "age_range_to", e.target.value);
                                                        }}
                                                    />
                                                    <select
                                                        defaultValue={metadataString(source.metadata, "age_range_unit")}
                                                        disabled={saving}
                                                        className={`${inputClass} ${LOCATIONS_EDITOR_AGE_RANGE_UNIT_CLASS}`}
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            if (metadataString(source.metadata, "age_range_unit") === v) return;
                                                            void patchMetadataField(source, "age_range_unit", v);
                                                        }}
                                                    >
                                                        <option value="">Unit</option>
                                                        {ageUnitSelectOptions.map((o) => (
                                                            <option key={o.value} value={o.value}>
                                                                {o.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ) : (
                                                <span className="text-alloy-midnight/35">—</span>
                                            )}
                                        </td>
                                        <td className={["px-2 py-2", LOCATIONS_EDITOR_TABLE_COLUMN_CLASS.Capacity].filter(Boolean).join(" ")}>
                                            {row.isRoom && source ? (
                                                <input
                                                    defaultValue={row.capacity ?? ""}
                                                    disabled={saving}
                                                    className={`${inputClass} w-full max-w-full`}
                                                    onBlur={(e) => {
                                                        void patchMetadataField(source, "capacity", e.target.value);
                                                    }}
                                                />
                                            ) : (
                                                <span className="text-alloy-midnight/35">—</span>
                                            )}
                                        </td>
                                        <td
                                            className={[
                                                "px-2 py-2",
                                                LOCATIONS_EDITOR_TABLE_COLUMN_CLASS["Student:Teacher Ratio"],
                                            ]
                                                .filter(Boolean)
                                                .join(" ")}
                                        >
                                            {row.isRoom && source ? (
                                                <input
                                                    defaultValue={row.studentTeacherRatio ?? ""}
                                                    disabled={saving}
                                                    className={`${inputClass} w-full max-w-full`}
                                                    onBlur={(e) => {
                                                        void patchMetadataField(source, "student_teacher_ratio", e.target.value);
                                                    }}
                                                />
                                            ) : (
                                                <span className="text-alloy-midnight/35">—</span>
                                            )}
                                        </td>
                                        <td className="px-2 py-2 text-xs">
                                            <span className={row.isActive ? "text-alloy-midnight/75" : "text-amber-800/80"}>
                                                {row.statusLabel ?? (row.isActive ? "Active" : "Inactive")}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => openDrawer({ type: "locations", id: row.id })}
                                                    className="text-[11px] font-medium text-alloy-blue hover:underline"
                                                >
                                                    Open
                                                </button>
                                                {demo && row.isActive ? (
                                                    blockedReason && !isDemoLocation(source!) ? (
                                                        <span
                                                            className="max-w-[8rem] truncate text-[10px] text-alloy-midnight/50"
                                                            title={blockedReason}
                                                        >
                                                            {blockedReason}
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            disabled={removing || saving}
                                                            onClick={() => source && void deactivateLocation(source)}
                                                            className="text-[11px] font-medium text-red-700/80 hover:text-red-800 disabled:opacity-50"
                                                        >
                                                            {removing ? "Removing…" : "Remove"}
                                                        </button>
                                                    )
                                                ) : demo && !row.isActive && blockedReason ? (
                                                    <span
                                                        className="max-w-[8rem] truncate text-[10px] text-alloy-midnight/50"
                                                        title={blockedReason}
                                                    >
                                                        {blockedReason}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <section className="mt-6 rounded-lg border border-alloy-forge/10 bg-white/70 px-3 py-3">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                    Programs / offerings (per site)
                </h3>
                <p className="mb-3 text-xs text-alloy-midnight/55">
                    Each site owns its program list. Add or edit programs here — lead intake, room categories,
                    waitlists, and layouts read labels from this configuration via{" "}
                    <span className="font-mono text-[10px]">inquiry_child.desired_program_type</span>.
                </p>
                <LocationProgramCategoriesSettingsPanel
                    sites={siteRows}
                    categoriesBySite={categoriesBySite}
                    programCategories={programCategories}
                    onCategoriesChange={setProgramCategories}
                    onError={setError}
                    inputClass={inputClass}
                />
            </section>
        </div>
    );
}
