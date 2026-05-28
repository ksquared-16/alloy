"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import { SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";
import { listOrgProgramCategoriesForSettings } from "@/lib/orchestration/placement/orgProgramCategoryRegistry";

type LocationHierarchyRow = {
    id: string;
    label: string | null;
    location_type: string | null;
    parent_location_id: string | null;
    is_active: boolean;
    city: string | null;
    state: string | null;
    metadata?: unknown;
};

function typeLabel(type: string | null): string {
    switch ((type ?? "").trim()) {
        case "site":
            return "Physical site";
        case "unit":
            return "Classroom / room";
        case "address":
            return "Address / campus";
        default:
            return type ?? "Location";
    }
}

function isDemoLocation(row: LocationHierarchyRow): boolean {
    const label = (row.label ?? "").trim().toLowerCase();
    if (label.startsWith("waitlist demo —") || label.startsWith("placement demo —")) return true;
    const md = row.metadata;
    if (md != null && typeof md === "object" && !Array.isArray(md)) {
        const m = md as Record<string, unknown>;
        return m.demo_batch_key != null || m.is_demo_data === true;
    }
    return false;
}

export default function LocationsHierarchySettingsClient() {
    const { openDrawer } = useAdminDrawer();
    const [rows, setRows] = useState<LocationHierarchyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [archivingId, setArchivingId] = useState<string | null>(null);

    const orgCategories = useMemo(() => listOrgProgramCategoriesForSettings(), []);

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

    const tree = useMemo(() => {
        const byParent = new Map<string | null, LocationHierarchyRow[]>();
        for (const row of filteredRows) {
            const key = row.parent_location_id ?? null;
            const list = byParent.get(key) ?? [];
            list.push(row);
            byParent.set(key, list);
        }
        for (const list of byParent.values()) {
            list.sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
        }
        const roots = (byParent.get(null) ?? []).filter((r) => r.location_type !== "unit");
        return { roots, byParent };
    }, [filteredRows]);

    const archiveLocation = async (row: LocationHierarchyRow) => {
        if (!isDemoLocation(row)) {
            window.alert("Archive is limited to demo-tagged or legacy demo-named locations in this pilot.");
            return;
        }
        const label = row.label ?? "this location";
        if (!window.confirm(`Archive (deactivate) ${label}? This hides it from active lists.`)) return;
        setArchivingId(row.id);
        try {
            const res = await fetch(`/api/admin/locations/${encodeURIComponent(row.id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: false }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
            await fetchRows();
        } catch (e) {
            window.alert((e as Error).message);
        } finally {
            setArchivingId(null);
        }
    };

    const renderNode = (row: LocationHierarchyRow, depth: number) => {
        const children = tree.byParent.get(row.id) ?? [];
        const demo = isDemoLocation(row);
        return (
            <li key={row.id} className="space-y-1">
                <div
                    className="flex flex-wrap items-center gap-2 rounded-md border border-alloy-forge/10 bg-white/70 px-3 py-2"
                    style={{ marginLeft: depth * 16 }}
                >
                    <button
                        type="button"
                        onClick={() => openDrawer({ type: "locations", id: row.id })}
                        className="text-left text-sm font-medium text-alloy-blue hover:underline"
                    >
                        {row.label ?? "Untitled location"}
                    </button>
                    <span className="rounded bg-alloy-stone/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                        {typeLabel(row.location_type)}
                    </span>
                    {!row.is_active ? (
                        <span className="text-[10px] font-medium text-alloy-midnight/45">Inactive</span>
                    ) : null}
                    {demo ? (
                        <span className="text-[10px] font-medium text-alloy-midnight/45">Demo</span>
                    ) : null}
                    {(row.city || row.state) && (
                        <span className="text-xs text-alloy-midnight/45">
                            {[row.city, row.state].filter(Boolean).join(", ")}
                        </span>
                    )}
                    {row.is_active && demo ? (
                        <button
                            type="button"
                            disabled={archivingId === row.id}
                            onClick={() => void archiveLocation(row)}
                            className="ml-auto text-[11px] font-medium text-red-700/80 hover:text-red-800 disabled:opacity-50"
                        >
                            {archivingId === row.id ? "Archiving…" : "Archive demo"}
                        </button>
                    ) : null}
                </div>
                {children.length > 0 ? (
                    <ul className="space-y-1">{children.map((c) => renderNode(c, depth + 1))}</ul>
                ) : null}
            </li>
        );
    };

    return (
        <div className={SETTINGS_PAGE_SHELL_CLASS}>
            <SettingsPageHeader
                title="Locations & hierarchy"
                subtitle="Physical sites and classroom/room units. Waitlist queue sections group by org-level program/category — rooms belong under sites for future capacity and rates, not for waitlist section headers."
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

            <div className="mb-4 rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.06] px-3 py-2 text-xs leading-relaxed text-alloy-midnight/60">
                <strong className="font-semibold text-alloy-midnight/75">Hierarchy model:</strong>{" "}
                <span className="text-alloy-midnight/55">address/campus</span> →{" "}
                <span className="text-alloy-midnight/55">site</span> (physical campus) →{" "}
                <span className="text-alloy-midnight/55">unit</span> (classroom/room under a site).{" "}
                <strong className="font-semibold text-alloy-midnight/75">Waitlist grouping</strong> uses org-level
                program categories below. Header location filter narrows candidates inside those sections. Rates and
                classroom assignment are out of scope.
            </div>

            <section className="mb-4 rounded-lg border border-alloy-forge/10 bg-white/70 px-3 py-2.5">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">
                    Org program categories
                </h3>
                <ul className="flex flex-wrap gap-2">
                    {orgCategories.map((c) => (
                        <li
                            key={c.key}
                            className="rounded-md border border-alloy-forge/10 bg-alloy-stone/20 px-2 py-1 text-xs text-alloy-midnight/75"
                        >
                            {c.label}
                        </li>
                    ))}
                </ul>
                <p className="mt-2 text-[11px] text-alloy-midnight/45">
                    Pilot: platform defaults. Full org configuration is a follow-up.
                </p>
            </section>

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
            ) : tree.roots.length === 0 ? (
                <p className="text-sm text-alloy-midnight/50">
                    {search.trim()
                        ? "No locations match your search."
                        : "No org locations yet. Add a site or run npm run dev:seed:waitlist-demo for demo campuses."}
                </p>
            ) : (
                <ul className="space-y-2">{tree.roots.map((r) => renderNode(r, 0))}</ul>
            )}
        </div>
    );
}
