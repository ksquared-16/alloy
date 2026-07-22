"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { SchedulePatternRow } from "@/lib/childcareOperational/fetchOperationalEnrollment";
import { mergeLocationMetadataField } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import type { LocationSiteCreateInput } from "@/components/adminV2/settings/locations/LocationSiteCreatePanel";
import { mutationResponseContainsPatch } from "@/lib/locations/mutationPersistenceContract";
import {
    invalidateLocationsCollection,
    loadLocationsCollection,
    peekLocationsCollection,
} from "@/lib/locations/locationsCollectionCache";
import { invalidateProgramsCollection } from "@/lib/programs/programsCollectionCache";
import { resolveLocationsSelection } from "@/lib/locations/locationsSelectionAdapter";
import {
    publishConfigurationInvalidation,
    subscribeConfigurationInvalidation,
} from "@/lib/configRuntime/configurationInvalidation";
import { markConfigurationContinuity } from "@/lib/configRuntime/configurationContinuity";

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

export type LocationRoomCreateInput = {
    label: string;
    is_active: boolean;
    metadata: Record<string, unknown>;
};

export type LocationProgramCreateInput = {
    label: string;
    is_active: boolean;
    metadata: Record<string, unknown>;
};

function isSite(row: LocationHierarchyRow): boolean {
    return String(row.location_type ?? "").trim() === "site";
}

function isRoom(row: LocationHierarchyRow): boolean {
    return String(row.location_type ?? "").trim() === "unit";
}

export function useLocationsConfigurationSettings(options?: {
    initialLocationId?: string | null;
    orgId?: string | null;
    retainedLocationId?: string | null;
}) {
    const initialLocationId = String(options?.initialLocationId ?? "").trim() || null;
    const orgId = String(options?.orgId ?? "").trim();
    const retainedLocationId = String(options?.retainedLocationId ?? "").trim() || null;
    const [section, setSection] = useState<LocationConfigSection>("locations");
    const [rows, setRows] = useState<LocationHierarchyRow[]>(() =>
        orgId ? (peekLocationsCollection(orgId)?.rows ?? []) : [],
    );
    const [programCategories, setProgramCategories] = useState<LocationProgramCategoryRow[]>(() =>
        orgId ? (peekLocationsCollection(orgId)?.programCategories ?? []) : [],
    );
    const [schedulePatterns, setSchedulePatterns] = useState<SchedulePatternRow[]>(() =>
        orgId ? (peekLocationsCollection(orgId)?.schedulePatterns ?? []) : [],
    );
    const [ageUnitSelectOptions, setAgeUnitSelectOptions] = useState<{ value: string; label: string }[]>([]);
    const hasDataRef = useRef(rows.length > 0);
    const [loading, setLoading] = useState(!hasDataRef.current);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectionSource, setSelectionSource] = useState<"route" | "retained" | "none">("none");
    const [shouldSyncRoute, setShouldSyncRoute] = useState(false);

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

    const applySnapshot = useCallback(
        (snapshot: {
            rows: LocationHierarchyRow[];
            programCategories: LocationProgramCategoryRow[];
            schedulePatterns: SchedulePatternRow[];
        }) => {
            setRows(snapshot.rows);
            setProgramCategories(snapshot.programCategories);
            setSchedulePatterns(snapshot.schedulePatterns);
            hasDataRef.current = snapshot.rows.length > 0 || snapshot.programCategories.length > 0;
        },
        [],
    );

    const refresh = useCallback(
        async (opts?: { force?: boolean }) => {
            if (!orgId) {
                setLoading(false);
                setError("Organization context is required.");
                return;
            }
            const hadData = hasDataRef.current;
            if (hadData) setRefreshing(true);
            else setLoading(true);
            setError(null);
            try {
                const { snapshot, meta } = await loadLocationsCollection(orgId, {
                    force: opts?.force === true,
                });
                applySnapshot(snapshot);
                markConfigurationContinuity("reveal", {
                    domain: "locations",
                    cache_hit: meta.cacheHit,
                    inflight_join: meta.inflightJoin,
                    stale_reuse: meta.staleReuse,
                });
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to load locations");
                if (!hadData) {
                    setRows([]);
                    setProgramCategories([]);
                    setSchedulePatterns([]);
                }
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [applySnapshot, orgId],
    );

    const refreshPrograms = useCallback(async () => {
        await refresh({ force: true });
    }, [refresh]);

    const refreshSchedulePatterns = useCallback(async () => {
        await refresh({ force: true });
    }, [refresh]);

    useEffect(() => {
        if (!orgId) return;
        // Re-hydrate from Continuity collection cache when org context arrives / remounts.
        const peeked = peekLocationsCollection(orgId);
        if (peeked) {
            applySnapshot(peeked);
            setLoading(false);
        }
        void refresh();
    }, [applySnapshot, orgId, refresh]);

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
            if (d?.type === "locations" && orgId) {
                invalidateLocationsCollection(orgId, "admin-entity-saved", { publishBus: false });
                void refresh({ force: true });
            }
        };
        window.addEventListener("admin-entity-saved", onSaved);
        return () => window.removeEventListener("admin-entity-saved", onSaved);
    }, [orgId, refresh]);

    useEffect(() => {
        if (!orgId) return;
        return subscribeConfigurationInvalidation((event) => {
            if (event.scope !== "locations" && event.scope !== "all") return;
            invalidateLocationsCollection(orgId, event.reason, { publishBus: false });
            void refresh({ force: true });
        });
    }, [orgId, refresh]);

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

    // Deterministic selection projection (route → retained → none).
    // Locations landing: never auto-open the first location. Do not invent a default.
    useEffect(() => {
        if (loading && !hasDataRef.current) return;
        const resolution = resolveLocationsSelection({
            routeLocationId: initialLocationId,
            retainedLocationId,
            validSiteIds: siteRows.map((s) => s.id),
        });
        setSelectedId(resolution.locationId);
        setSelectionSource(resolution.source);
        setShouldSyncRoute(resolution.shouldSyncRoute);
        setError(resolution.error);
    }, [initialLocationId, retainedLocationId, loading, siteRows]);

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

    const bumpCollectionAfterMutation = useCallback(
        (reason: string) => {
            if (orgId) {
                invalidateLocationsCollection(orgId, reason, { publishBus: true });
            } else {
                publishConfigurationInvalidation("locations", reason);
            }
        },
        [orgId],
    );

    const createSiteLocation = useCallback(
        async (input: LocationSiteCreateInput): Promise<string> => {
            let metadata = mergeLocationMetadataField(null, "site_phone", input.phone.trim() || null);
            metadata = mergeLocationMetadataField(metadata, "timezone", input.timezone.trim() || null);
            const payload = {
                location_type: "site",
                label: input.label.trim() || null,
                address1: input.address1.trim() || null,
                city: input.city.trim() || null,
                state: input.state.trim() || null,
                postal_code: input.postal_code.trim() || null,
                is_active: input.is_active,
                metadata,
            };
            const res = await fetch("/api/admin/locations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            });
            const json = (await res.json().catch(() => ({}))) as LocationHierarchyRow & { error?: string };
            if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
            const newId = String(json.id ?? "").trim();
            if (!newId || !mutationResponseContainsPatch(json as Record<string, unknown>, payload)) {
                throw new Error("Location creation was not confirmed by the authoritative response.");
            }
            setRows((prev) => (prev.some((row) => row.id === newId) ? prev : [...prev, json]));
            bumpCollectionAfterMutation("location-site-created");
            window.dispatchEvent(
                new CustomEvent("admin-entity-saved", { detail: { type: "locations", id: newId } }),
            );
            return newId;
        },
        [bumpCollectionAfterMutation],
    );

    const createRoomUnit = useCallback(
        async (siteId: string, input: LocationRoomCreateInput): Promise<string> => {
            const payload = {
                location_type: "unit",
                parent_location_id: siteId,
                label: input.label.trim() || "New room",
                is_active: input.is_active,
                metadata: input.metadata,
            };
            const res = await fetch("/api/admin/locations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            });
            const json = (await res.json().catch(() => ({}))) as LocationHierarchyRow & { error?: string };
            if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
            const newId = String(json.id ?? "").trim();
            if (!newId || !mutationResponseContainsPatch(json as Record<string, unknown>, payload)) {
                throw new Error("Room creation was not confirmed by the authoritative response.");
            }
            setRows((prev) => (prev.some((row) => row.id === newId) ? prev : [...prev, json]));
            bumpCollectionAfterMutation("location-room-created");
            window.dispatchEvent(
                new CustomEvent("admin-entity-saved", { detail: { type: "locations", id: newId } }),
            );
            return newId;
        },
        [bumpCollectionAfterMutation],
    );

    const createProgramCategory = useCallback(
        async (siteId: string, input: LocationProgramCreateInput): Promise<string> => {
            const payload = {
                location_id: siteId,
                label: input.label.trim(),
                is_active: input.is_active,
                metadata: input.metadata,
            };
            const res = await fetch("/api/admin/location-program-categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            });
            const json = (await res.json().catch(() => ({}))) as {
                category?: LocationProgramCategoryRow;
                error?: string;
            };
            if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
            const created = json.category;
            const newId = String(created?.id ?? "").trim();
            if (
                !newId ||
                !created ||
                !mutationResponseContainsPatch(created as unknown as Record<string, unknown>, payload)
            ) {
                throw new Error("Program creation was not confirmed by the authoritative response.");
            }
            setProgramCategories((prev) => [...prev, created]);
            bumpCollectionAfterMutation("location-program-created");
            return newId;
        },
        [bumpCollectionAfterMutation],
    );

    const patchLocation = useCallback(
        async (id: string, body: Record<string, unknown>) => {
            const res = await fetch(`/api/admin/locations/${encodeURIComponent(id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => ({}))) as LocationHierarchyRow & { error?: string };
            if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
            if (!json.id || !mutationResponseContainsPatch(json as Record<string, unknown>, body)) {
                throw new Error("Location save was not confirmed by the authoritative response.");
            }
            // Apply the PATCH row into local state. Do not await a full hierarchy GET on the
            // save critical path — that was blocking "Saving…" for the entire org reload.
            setRows((prev) =>
                prev.map((row) => (row.id === id ? { ...row, ...json, id: row.id } : row)),
            );
            bumpCollectionAfterMutation("location-patched");
        },
        [bumpCollectionAfterMutation],
    );

    const patchProgramCategory = useCallback(
        async (
            categoryId: string,
            patch: {
                label?: string;
                is_active?: boolean;
                sort_order?: number;
                metadata?: Record<string, unknown>;
                local_description_override?: string | null;
                local_authorization_evidence?: string | null;
                local_display_name?: string | null;
                available_from?: string | null;
                available_through?: string | null;
            },
        ) => {
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
            if (
                !updated ||
                updated.id !== categoryId ||
                !mutationResponseContainsPatch(
                    updated as unknown as Record<string, unknown>,
                    patch as Record<string, unknown>,
                )
            ) {
                throw new Error("Program save was not confirmed by the authoritative response.");
            }
            setProgramCategories((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
            bumpCollectionAfterMutation("location-program-patched");
            if (orgId) {
                invalidateProgramsCollection(orgId, "location-program-patched", { publishBus: true });
            }
        },
        [bumpCollectionAfterMutation, orgId],
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
        selectionSource,
        shouldSyncRoute,
        loading,
        refreshing,
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
        createProgramCategory,
        patchLocation,
        patchProgramCategory,
        refresh,
        refreshPrograms,
        refreshSchedulePatterns,
        roomCapacitySummaryForSite,
        programOptionsForSite,
    };
}
