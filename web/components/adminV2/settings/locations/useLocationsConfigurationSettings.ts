"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchLocationProgramCategories } from "@/lib/admin/location/fetchLocationProgramCategories";
import {
    fetchOptionSetItemsBySetKey,
    mapOptionItemsToSelectOptions,
} from "@/lib/admin/location/locationDrawerFieldOptions";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import {
    indexLocationProgramCategoriesBySite,
    resolveActiveProgramCategoriesForSite,
    type LocationProgramCategoryRow,
} from "@/lib/locations/locationProgramCategories";
import {
    fetchSchedulePatternsForSite,
    type SchedulePatternRow,
} from "@/lib/childcareOperational/fetchOperationalEnrollment";
import { mergeLocationMetadataField } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import type { LocationSiteCreateInput } from "@/components/adminV2/settings/locations/LocationSiteCreatePanel";

export type LocationConfigSection =
    | "locations"
    | "programs"
    | "rooms"
    | "schedule_templates"
    | "operational_rules";

export const LOCATION_CONFIG_SECTIONS: { key: LocationConfigSection; label: string }[] = [
    { key: "locations", label: "Locations" },
    { key: "programs", label: "Programs" },
    { key: "rooms", label: "Rooms" },
    { key: "schedule_templates", label: "Schedule Templates" },
    { key: "operational_rules", label: "Operational Rules" },
];

function isSite(row: LocationHierarchyRow): boolean {
    return String(row.location_type ?? "").trim() === "site";
}

function isRoom(row: LocationHierarchyRow): boolean {
    return String(row.location_type ?? "").trim() === "unit";
}

export function useLocationsConfigurationSettings(options?: { initialLocationId?: string | null }) {
    const initialLocationId = String(options?.initialLocationId ?? "").trim() || null;
    const [section, setSection] = useState<LocationConfigSection>("locations");
    const [rows, setRows] = useState<LocationHierarchyRow[]>([]);
    const [programCategories, setProgramCategories] = useState<LocationProgramCategoryRow[]>([]);
    const [schedulePatterns, setSchedulePatterns] = useState<SchedulePatternRow[]>([]);
    const [ageUnitSelectOptions, setAgeUnitSelectOptions] = useState<{ value: string; label: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const siteRows = useMemo(() => rows.filter(isSite), [rows]);
    const roomRows = useMemo(() => rows.filter(isRoom), [rows]);

    const siteLabelById = useMemo(() => {
        const map = new Map<string, string>();
        for (const site of siteRows) {
            map.set(site.id, (site.label ?? "").trim() || "Untitled location");
        }
        return map;
    }, [siteRows]);

    const categoriesBySite = useMemo(
        () => indexLocationProgramCategoriesBySite(programCategories),
        [programCategories],
    );

    const refreshLocations = useCallback(async () => {
        const res = await fetch("/api/admin/locations?include_inactive=true&hierarchy=1", {
            credentials: "include",
        });
        const json = (await res.json()) as { locations?: LocationHierarchyRow[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
        setRows(json.locations ?? []);
    }, []);

    const refreshPrograms = useCallback(async () => {
        const categories = await fetchLocationProgramCategories({ credentials: "include" }, { includeInactive: true });
        setProgramCategories(categories);
    }, []);

    const refreshSchedulePatterns = useCallback(async () => {
        const sites = rows.filter(isSite);
        if (!sites.length) {
            setSchedulePatterns([]);
            return;
        }
        const batches = await Promise.all(sites.map((s) => fetchSchedulePatternsForSite(s.id).catch(() => [])));
        setSchedulePatterns(batches.flat());
    }, [rows]);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            await refreshLocations();
            await refreshPrograms();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load locations");
            setRows([]);
            setProgramCategories([]);
        } finally {
            setLoading(false);
        }
    }, [refreshLocations, refreshPrograms]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        if (!loading) void refreshSchedulePatterns();
    }, [loading, refreshSchedulePatterns]);

    useEffect(() => {
        let cancelled = false;
        void fetchOptionSetItemsBySetKey("location_age_range_unit", { credentials: "include" }).then((items) => {
            if (!cancelled) setAgeUnitSelectOptions(mapOptionItemsToSelectOptions(items));
        });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const onSaved = (e: Event) => {
            const d = (e as CustomEvent<{ type: string }>)?.detail;
            if (d?.type === "locations") {
                void refresh();
            }
        };
        window.addEventListener("admin-entity-saved", onSaved);
        return () => window.removeEventListener("admin-entity-saved", onSaved);
    }, [refresh]);

    const listItems = useMemo(() => {
        if (section === "locations") {
            return siteRows.map((site) => ({
                id: site.id,
                title: (site.label ?? "").trim() || "Untitled location",
                subtitle: site.is_active === false ? "Inactive" : undefined,
            }));
        }
        if (section === "programs") {
            return [...programCategories]
                .sort((a, b) => {
                    const siteA = siteLabelById.get(a.location_id) ?? "";
                    const siteB = siteLabelById.get(b.location_id) ?? "";
                    const siteCmp = siteA.localeCompare(siteB);
                    if (siteCmp !== 0) return siteCmp;
                    return a.label.localeCompare(b.label);
                })
                .map((program) => ({
                    id: program.id,
                    title: program.label,
                    subtitle: siteLabelById.get(program.location_id) ?? undefined,
                }));
        }
        if (section === "operational_rules") {
            return [];
        }
        if (section === "rooms") {
            return roomRows
                .map((room) => ({
                    id: room.id,
                    title: (room.label ?? "").trim() || "Untitled room",
                    subtitle: room.parent_location_id ? siteLabelById.get(room.parent_location_id) : undefined,
                    sortSite: room.parent_location_id ? siteLabelById.get(room.parent_location_id) ?? "" : "",
                }))
                .sort((a, b) => a.sortSite.localeCompare(b.sortSite) || a.title.localeCompare(b.title));
        }
        return schedulePatterns
            .map((pattern) => ({
                id: pattern.id,
                title: pattern.label,
                subtitle: siteLabelById.get(pattern.site_location_id) ?? undefined,
                sortSite: siteLabelById.get(pattern.site_location_id) ?? "",
            }))
            .sort((a, b) => a.sortSite.localeCompare(b.sortSite) || a.title.localeCompare(b.title));
    }, [section, siteRows, programCategories, roomRows, schedulePatterns, siteLabelById]);

    // URL is the source of truth for fleet vs object workspace.
    useEffect(() => {
        if (loading) return;
        if (!initialLocationId) {
            setSelectedId(null);
            setError(null);
        }
    }, [initialLocationId, loading]);

    useEffect(() => {
        if (loading || !initialLocationId) return;
        if (section !== "locations") {
            setSection("locations");
            return;
        }
        const siteMatch = siteRows.some((site) => site.id === initialLocationId);
        if (siteMatch) {
            setSelectedId(initialLocationId);
            setError(null);
            return;
        }
        if (siteRows.length > 0) {
            setError("Location not found or unavailable.");
            setSelectedId(null);
        }
    }, [initialLocationId, loading, siteRows, section]);

    // Fleet landing: never auto-open the first location. Drop stale ids only.
    useEffect(() => {
        if (!selectedId || !listItems.length) return;
        if (initialLocationId && section === "locations") return;
        if (!listItems.some((item) => item.id === selectedId)) {
            setSelectedId(null);
        }
    }, [listItems, selectedId, initialLocationId, section]);

    const selectedSite = useMemo(
        () => (section === "locations" ? siteRows.find((s) => s.id === selectedId) ?? null : null),
        [section, siteRows, selectedId],
    );

    const selectedProgram = useMemo(
        () => (section === "programs" ? programCategories.find((p) => p.id === selectedId) ?? null : null),
        [section, programCategories, selectedId],
    );

    const selectedRoom = useMemo(
        () => (section === "rooms" ? roomRows.find((r) => r.id === selectedId) ?? null : null),
        [section, roomRows, selectedId],
    );

    const selectedSchedulePattern = useMemo(
        () =>
            section === "schedule_templates" ?
                schedulePatterns.find((p) => p.id === selectedId) ?? null
            :   null,
        [section, schedulePatterns, selectedId],
    );

    const createSiteLocation = useCallback(
        async (input: LocationSiteCreateInput): Promise<string> => {
            let metadata = mergeLocationMetadataField(null, "site_phone", input.phone.trim() || null);
            metadata = mergeLocationMetadataField(metadata, "timezone", input.timezone.trim() || null);
            const res = await fetch("/api/admin/locations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    location_type: "site",
                    label: input.label.trim() || null,
                    address1: input.address1.trim() || null,
                    city: input.city.trim() || null,
                    state: input.state.trim() || null,
                    postal_code: input.postal_code.trim() || null,
                    is_active: input.is_active,
                    metadata,
                }),
            });
            const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
            if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
            const newId = String(json.id ?? "").trim();
            if (!newId) throw new Error("Create failed: missing location id");
            window.dispatchEvent(
                new CustomEvent("admin-entity-saved", { detail: { type: "locations", id: newId } }),
            );
            await refreshLocations();
            return newId;
        },
        [refreshLocations],
    );

    const createRoomUnit = useCallback(
        async (siteId: string, label: string): Promise<string> => {
            const res = await fetch("/api/admin/locations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    location_type: "unit",
                    parent_location_id: siteId,
                    label: label.trim() || "New room",
                    is_active: true,
                }),
            });
            const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
            if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
            const newId = String(json.id ?? "").trim();
            if (!newId) throw new Error("Create failed: missing room id");
            window.dispatchEvent(
                new CustomEvent("admin-entity-saved", { detail: { type: "locations", id: newId } }),
            );
            await refreshLocations();
            return newId;
        },
        [refreshLocations],
    );

    const patchLocation = useCallback(
        async (id: string, body: Record<string, unknown>) => {
            const res = await fetch(`/api/admin/locations/${encodeURIComponent(id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
            await refreshLocations();
        },
        [refreshLocations],
    );

    const patchProgramCategory = useCallback(
        async (categoryId: string, patch: { label?: string; is_active?: boolean; sort_order?: number; metadata?: Record<string, unknown> }) => {
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
                setProgramCategories((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
            } else {
                await refreshPrograms();
            }
        },
        [refreshPrograms],
    );

    const roomCapacitySummaryForSite = useCallback(
        (siteId: string): number => {
            return roomRows
                .filter((r) => r.parent_location_id === siteId && r.is_active !== false)
                .reduce((sum, room) => {
                    const md = room.metadata;
                    if (md == null || typeof md !== "object" || Array.isArray(md)) return sum;
                    const cap = Number((md as Record<string, unknown>).capacity);
                    return sum + (Number.isFinite(cap) ? cap : 0);
                }, 0);
        },
        [roomRows],
    );

    const programOptionsForSite = useCallback(
        (siteId: string) => resolveActiveProgramCategoriesForSite(categoriesBySite.get(siteId) ?? [], siteId),
        [categoriesBySite],
    );

    return {
        section,
        setSection,
        selectedId,
        setSelectedId,
        loading,
        error,
        setError,
        listItems,
        siteRows,
        roomRows,
        programCategories,
        setProgramCategories,
        schedulePatterns,
        setSchedulePatterns,
        ageUnitSelectOptions,
        siteLabelById,
        categoriesBySite,
        selectedSite,
        selectedProgram,
        selectedRoom,
        selectedSchedulePattern,
        createSiteLocation,
        createRoomUnit,
        patchLocation,
        patchProgramCategory,
        refresh,
        refreshPrograms,
        refreshSchedulePatterns,
        roomCapacitySummaryForSite,
        programOptionsForSite,
    };
}
