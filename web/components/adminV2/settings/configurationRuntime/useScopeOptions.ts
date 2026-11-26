"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchLocationProgramCategories } from "@/lib/admin/location/fetchLocationProgramCategories";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import { scopeOptionLabel } from "@/lib/locations/topologyPresentation";
import { rowsBelongingToSite } from "@/lib/location/canonicalRoomProvider";
import type { ScopeOptions } from "@/components/adminV2/settings/configurationRuntime/ScopePicker";

/**
 * Loads scope options — sites, programs, rooms — with human labels, for the
 * Operational Configuration scope picker (Phase 4). Shared by Financials (rate
 * plans) and Locations (operational rules) so both author scope the same way.
 * Read-only: it issues GETs only.
 *
 * SCOPE IS DECLARED BY THE CALLER, never guessed from route state here. Passing
 * `{ siteId }` narrows the OPTIONS to that campus, for a surface mounted inside
 * one — Locations → North Campus → Operational Rules should not casually offer
 * South Campus rooms. Omitting it leaves the org-wide behaviour every other
 * caller relies on exactly as it was.
 *
 * Two things deliberately stay org-wide even when narrowed:
 *  - `labelFor`, because a rule already scoped to another site or to the org
 *    still needs its badge to read as something other than an opaque id.
 *  - `ageGroupOptions`, because an age group is a program-category KEY — a shared
 *    vocabulary rather than a scope target.
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

export type UseScopeOptionsInput = {
    /**
     * Narrow `options` to one campus. Membership is resolved by CANONICAL
     * ANCESTRY, so a classroom nested inside a physical room still belongs to its
     * site — comparing a room's direct parent against the site id instead would
     * drop exactly the rooms this workstream exists to support.
     */
    siteId?: string | null;
};

export function useScopeOptions(input: UseScopeOptionsInput = {}): ScopeOptionsState {
    const siteId = String(input.siteId ?? "").trim() || null;
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
        // Site-level rule authoring survives narrowing: the ACTIVE site stays
        // selectable, other campuses do not. Organization scope is not in these
        // options at all — the picker offers it independently — so a canonical
        // org-wide rule remains authorable from here.
        const scopedSites = siteId ? sites.filter((s) => s.id === siteId) : sites;
        // Programs are owned by a site through `location_program_categories.location_id`.
        // Site is read from that relation, never inferred from a label or a room.
        const scopedPrograms = siteId ? programs.filter((p) => p.location_id === siteId) : programs;
        // Rooms by canonical ancestry, through the shared walk.
        const scopedRooms = siteId ? rowsBelongingToSite(rooms, siteId) : rooms;

        const siteOpts = scopedSites
            .map((s) => ({ id: s.id, label: siteName(s.label) }))
            .sort((a, b) => a.label.localeCompare(b.label));
        const programOpts = scopedPrograms
            .map((p) => ({
                id: p.id,
                label: `${p.label} · ${siteLabelById.get(p.location_id) ?? "—"}`,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
        // Site by canonical ancestry, not by "the parent is the site". A nested
        // classroom used to render `Toddler 1 · —` here, because its parent is a
        // physical room and the map only holds sites. This surface keeps its own
        // smaller `name · site` grammar on purpose — the repair is the resolution,
        // not the shape.
        const roomOpts = scopedRooms
            // Labels still resolve against the FULL set, so a room's campus is
            // named by canonical ancestry rather than by whatever survived the filter.
            .map((r) => ({ id: r.id, label: scopeOptionLabel(r, [...sites, ...rooms]) }))
            .sort((a, b) => a.label.localeCompare(b.label));
        return { sites: siteOpts, programs: programOpts, rooms: roomOpts };
    }, [sites, programs, rooms, siteLabelById, siteId]);

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
