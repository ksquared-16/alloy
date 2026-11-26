"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rowsBelongingToSite } from "@/lib/location/canonicalRoomProvider";
import type { CanonicalUnitRole } from "@/lib/location/canonicalLocationModel";
import { TopologyRefusalError } from "@/lib/locations/topologyRefusalError";
import { presentRoomTopology } from "@/lib/locations/topologyPresentation";
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
import {
    mergeLocationMetadataField,
    withCanonicalUnitRole,
} from "@/lib/adminV2/locationsHierarchyTablePresentation";
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
    { key: "rooms", label: "Spaces" },
    { key: "schedule_templates", label: "Schedule Templates" },
    { key: "operational_rules", label: "Operational Rules" },
];

export type LocationRoomCreateInput = {
    label: string;
    is_active: boolean;
    metadata: Record<string, unknown>;
    /**
     * Ordinary capacity, in seats, or null when left blank. It is NOT part of
     * the locations payload — the caller writes it as a canonical rule once the
     * new space has an id.
     */
    capacity?: number | null;
    /** Canonical topology role the operator chose through the Type control. */
    unit_role: CanonicalUnitRole;
    /**
     * The physical room the operator chose through Inside, or null for "directly
     * at the site". The hook turns this into `parent_location_id`; the form never
     * handles a raw parent id.
     */
    inside_location_id: string | null;
};

export type LocationProgramCreateInput = {
    label: string;
    is_active: boolean;
    metadata: Record<string, unknown>;
};

/**
 * The POST body for a new room, from the operator's Type + Inside choices.
 *
 * Exported because this IS the create contract: the form expresses intent, this
 * turns it into canonical topology, and the server decides legality. Keeping it
 * a pure function lets the contract be proven against the real route rather than
 * asserted about in prose.
 *
 * Role-aware parent, not a hard-coded site: a classroom the operator placed
 * Inside a physical room is parented to THAT room.
 */
export function buildRoomCreatePayload(
    siteId: string,
    input: LocationRoomCreateInput
): Record<string, unknown> {
    return {
        location_type: "unit",
        unit_role: input.unit_role,
        parent_location_id: input.inside_location_id ?? siteId,
        label: input.label.trim() || "New room",
        is_active: input.is_active,
        metadata: input.metadata,
    };
}

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
        orgId ? (peekLocationsCollection(orgId)?.rows ?? []).map(withCanonicalUnitRole) : [],
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
            // Every row entering the model is folded once, so `unit_role` on a
            // LocationHierarchyRow means the same thing wherever it came from.
            setRows(snapshot.rows.map(withCanonicalUnitRole));
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
            // Topology through the ONE presentation authority. The old expression
            // looked the room's PARENT up in a sites-only map, which is right only
            // for a room hanging straight off the site — a nested classroom's parent
            // is a physical room, so it missed and the row rendered with no subtitle
            // at all. Sorting used the same broken lookup, so those rooms also sorted
            // under an empty key.
            return roomRows
                .map((room) => {
                    const topology = presentRoomTopology(room, rows);
                    return {
                        id: room.id,
                        title: (room.label ?? "").trim() || "Untitled room",
                        subtitle: topology.subtitle || undefined,
                        sortSite: topology.siteLabel ?? "",
                    };
                })
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
    }, [section, siteRows, programCategories, roomRows, rows, schedulePatterns, siteLabelById]);

    // Deterministic selection projection (route → retained → none).
    // Locations landing: never auto-open the first location. Do not invent a default.
    useEffect(() => {
        if (loading && !hasDataRef.current) return;
        const resolution = resolveLocationsSelection({
            routeLocationId: initialLocationId,
            retainedLocationId,
            validSiteIds: siteRows.map((s) => s.id),
            // URL owns selection — empty locationId is a legitimate portfolio landing (Programs parity).
            allowRetainedRestore: false,
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
            setRows((prev) =>
                prev.some((row) => row.id === newId) ? prev : [...prev, withCanonicalUnitRole(json)],
            );
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
            const payload = buildRoomCreatePayload(siteId, input);
            const res = await fetch("/api/admin/locations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
            });
            const json = (await res.json().catch(() => ({}))) as LocationHierarchyRow & {
                error?: string;
                code?: string;
            };
            if (!res.ok) {
                // Carry the NAMED code to the form. The form explains the refusal from
                // the code; nothing downstream reads the server's English.
                throw new TopologyRefusalError(json.error ?? `Failed (${res.status})`, json.code ?? null);
            }
            const newId = String(json.id ?? "").trim();
            if (!newId || !mutationResponseContainsPatch(json as Record<string, unknown>, payload)) {
                throw new Error("Room creation was not confirmed by the authoritative response.");
            }
            setRows((prev) =>
                prev.some((row) => row.id === newId) ? prev : [...prev, withCanonicalUnitRole(json)],
            );
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
            const json = (await res.json().catch(() => ({}))) as LocationHierarchyRow & {
                error?: string;
                code?: string;
            };
            if (!res.ok) {
                // Same contract as create: the NAMED code travels to the form, which
                // explains the refusal from the code rather than the sentence.
                throw new TopologyRefusalError(json.error ?? `Failed (${res.status})`, json.code ?? null);
            }
            if (!json.id || !mutationResponseContainsPatch(json as Record<string, unknown>, body)) {
                throw new Error("Location save was not confirmed by the authoritative response.");
            }
            // Apply the PATCH row into local state. Do not await a full hierarchy GET on the
            // save critical path — that was blocking "Saving…" for the entire org reload.
            setRows((prev) =>
                prev.map((row) =>
                    row.id === id ? withCanonicalUnitRole({ ...row, ...json, id: row.id }) : row,
                ),
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
            // Capacity is a property of the site's rooms wherever they sit in the
            // hierarchy; a direct-parent filter under-counted every nested group.
            return rowsBelongingToSite(roomRows, siteId)
                .filter((r) => r.is_active !== false)
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
        /** Every site + room row, for surfaces that must resolve topology context. */
        rows,
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
