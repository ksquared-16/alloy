"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import SettingsPageHeader from "@/components/adminV2/settings/SettingsPageHeader";
import { SETTINGS_PAGE_SHELL_CLASS } from "@/lib/adminV2/settingsPageLayout";

type LocationHierarchyRow = {
    id: string;
    label: string | null;
    location_type: string | null;
    parent_location_id: string | null;
    is_active: boolean;
    city: string | null;
    state: string | null;
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

export default function LocationsHierarchySettingsClient() {
    const { openDrawer } = useAdminDrawer();
    const [rows, setRows] = useState<LocationHierarchyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    const tree = useMemo(() => {
        const byParent = new Map<string | null, LocationHierarchyRow[]>();
        for (const row of rows) {
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
    }, [rows]);

    const renderNode = (row: LocationHierarchyRow, depth: number) => {
        const children = tree.byParent.get(row.id) ?? [];
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
                    {(row.city || row.state) && (
                        <span className="text-xs text-alloy-midnight/45">
                            {[row.city, row.state].filter(Boolean).join(", ")}
                        </span>
                    )}
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
                subtitle="Physical sites and classroom/room units for waitlist child-site testing. Org-level program/cohort keys are unchanged — site-scoped rates and billing are deferred."
                actions={
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => openDrawer({ type: "locations", id: "new" })}
                            className="rounded-md border border-alloy-pine/30 bg-alloy-pine/10 px-3 py-1.5 text-xs font-semibold text-alloy-pine hover:bg-alloy-pine/15"
                        >
                            Add location
                        </button>
                        <Link
                            href="/admin/locations"
                            className="rounded-md border border-alloy-forge/15 bg-white/60 px-3 py-1.5 text-xs font-medium text-alloy-midnight/70 hover:bg-white"
                        >
                            Full location list
                        </Link>
                    </div>
                }
            />

            <div className="mb-4 rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.06] px-3 py-2 text-xs leading-relaxed text-alloy-midnight/60">
                <strong className="font-semibold text-alloy-midnight/75">Hierarchy model:</strong>{" "}
                <span className="text-alloy-midnight/55">address/campus</span> →{" "}
                <span className="text-alloy-midnight/55">site</span> (physical campus) →{" "}
                <span className="text-alloy-midnight/55">unit</span> (classroom/room under a site). Child inquiry site
                dropdowns use active <code className="text-[11px]">location_type=site</code> rows. Tuition rates and
                capacity are not configured here.
            </div>

            {loading ? (
                <p className="text-sm text-alloy-midnight/50">Loading locations…</p>
            ) : error ? (
                <p className="text-sm text-red-700">{error}</p>
            ) : tree.roots.length === 0 ? (
                <p className="text-sm text-alloy-midnight/50">
                    No org locations yet. Add a site or run{" "}
                    <code className="text-xs">npm run dev:seed:waitlist-demo</code> for demo campuses.
                </p>
            ) : (
                <ul className="space-y-2">{tree.roots.map((r) => renderNode(r, 0))}</ul>
            )}
        </div>
    );
}
