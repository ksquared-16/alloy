"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchLocationProgramCategories } from "@/lib/admin/location/fetchLocationProgramCategories";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import type { ScopeOptions } from "@/components/adminV2/settings/configurationRuntime/ScopePicker";

/**
 * Loads org-scoped scope options — sites, programs, rooms — with human labels,
 * for the Operational Configuration scope picker (Phase 4). Shared by Financials
 * (rate plans) and Locations (operational rules) so both author scope the same
 * way. Read-only: it issues GETs only.
 *
 * Provides three things:
 *  - `options`: labeled, site-disambiguated dropdown options for the ScopePicker.
 *  - `labelFor(id)`: short id→label resolver for scope badges ("Program: Toddler").
 *  - `ageGroupOptions`: program-category keys as labeled age-group choices
 *    (age groups are program categories, not a free-text taxonomy).
 */

function siteName(label: string | null): string {
    return (label ?? "").trim() || "Untitled location";
}

export type ScopeOptionsState = {
    loading: boolean;
    error: string | null;
    options: ScopeOptions;
    /** Short label for a site/program/room id (for scope badges); undefined if unknown. */
    labelFor: (id: string) => string | undefined;
    /** Distinct program-category keys as age-group options (with an "All ages" blank). */
    ageGroupOptions: { value: string; label: string }[];
    refresh: () => Promise<void>;
};

export function useScopeOptions(): ScopeOptionsState {
    const [sites, setSites] = useState<LocationHierarchyRow[]>([]);
    const [rooms, setRooms] = useState<LocationHierarchyRow[]>([]);
    const [programs, setPrograms] = useState<LocationProgramCategoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [locRes, categories] = await Promise.all([
                fetch("/api/admin/locations?include_inactive=true&hierarchy=1", { credentials: "include" }),
                fetchLocationProgramCategories({ credentials: "include" }, { includeInactive: true }),
            ]);
            const locJson = (await locRes.json()) as { locations?: LocationHierarchyRow[]; error?: string };
            if (!locRes.ok) throw new Error(locJson.error ?? `Locations failed (${locRes.status})`);
            const all = locJson.locations ?? [];
            setSites(all.filter((l) => String(l.location_type ?? "").trim() === "site"));
            setRooms(all.filter((l) => String(l.location_type ?? "").trim() === "unit"));
            setPrograms(categories);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load scope options");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const siteLabelById = useMemo(() => {
        const m = new Map<string, string>();
        for (const s of sites) m.set(s.id, siteName(s.label));
        return m;
    }, [sites]);

    const options: ScopeOptions = useMemo(() => {
        const siteOpts = sites
            .map((s) => ({ id: s.id, label: siteName(s.label) }))
            .sort((a, b) => a.label.localeCompare(b.label));
        const programOpts = programs
            .map((p) => ({
                id: p.id,
                label: `${p.label} · ${siteLabelById.get(p.location_id) ?? "—"}`,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
        const roomOpts = rooms
            .map((r) => ({
                id: r.id,
                label: `${(r.label ?? "").trim() || "Untitled room"} · ${r.parent_location_id ? siteLabelById.get(r.parent_location_id) ?? "—" : "—"}`,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
        return { sites: siteOpts, programs: programOpts, rooms: roomOpts };
    }, [sites, programs, rooms, siteLabelById]);

    // Short labels (no site suffix) for scope badges.
    const shortLabelById = useMemo(() => {
        const m = new Map<string, string>();
        for (const s of sites) m.set(s.id, siteName(s.label));
        for (const p of programs) m.set(p.id, p.label);
        for (const r of rooms) m.set(r.id, (r.label ?? "").trim() || "Untitled room");
        return m;
    }, [sites, programs, rooms]);

    const labelFor = useCallback((id: string) => shortLabelById.get(id), [shortLabelById]);

    const ageGroupOptions = useMemo(() => {
        const byKey = new Map<string, string>();
        for (const p of programs) {
            if (p.key && !byKey.has(p.key)) byKey.set(p.key, p.label);
        }
        const opts = [...byKey.entries()].map(([value, label]) => ({ value, label }));
        opts.sort((a, b) => a.label.localeCompare(b.label));
        return [{ value: "", label: "All ages" }, ...opts];
    }, [programs]);

    return { loading, error, options, labelFor, ageGroupOptions, refresh };
}
