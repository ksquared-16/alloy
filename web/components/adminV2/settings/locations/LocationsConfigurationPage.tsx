"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, MapPin } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    ConfigurationContext,
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationQueueItem,
    ConfigurationSecondaryButton,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigChildObjectMasterDetail,
    ConfigDetailRuntime,
    ConfigObjectHeader,
    ConfigScopeContextBar,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import LocationProgramDetailPanel from "@/components/adminV2/settings/locations/LocationProgramDetailPanel";
import LocationRoomCreatePanel from "@/components/adminV2/settings/locations/LocationRoomCreatePanel";
import LocationRoomDetailPanel from "@/components/adminV2/settings/locations/LocationRoomDetailPanel";
import LocationSchedulePatternCreatePanel from "@/components/adminV2/settings/locations/LocationSchedulePatternCreatePanel";
import LocationScheduleTemplateDetailPanel from "@/components/adminV2/settings/locations/LocationScheduleTemplateDetailPanel";
import LocationSiteCreatePanel from "@/components/adminV2/settings/locations/LocationSiteCreatePanel";
import LocationSiteDetailPanel from "@/components/adminV2/settings/locations/LocationSiteDetailPanel";
import {
    LocationAccessPanel,
    LocationPlacementPanel,
    LocationToursPanel,
} from "@/components/adminV2/settings/locations/LocationOwnedConcernPanels";
import { LocationIdentityFactsRow } from "@/components/adminV2/settings/locations/LocationIdentityFactsRow";
import { LocationOverviewSurface } from "@/components/adminV2/settings/locations/LocationOverviewSurface";
import { LocationsCommandRailActions } from "@/components/adminV2/settings/locations/LocationsCommandRailActions";
import { LocationsObjectSelector } from "@/components/adminV2/settings/locations/LocationsObjectSelector";
import { useLocationsConfigurationSettings } from "@/components/adminV2/settings/locations/useLocationsConfigurationSettings";
import LocationsLanding from "@/components/adminV2/settings/locations/LocationsLanding";
import { useConfigurationContinuityOptional } from "@/components/adminV2/settings/configurationRuntime/ConfigurationContinuityProvider";
import { canonicalLocationSettingsHref } from "@/lib/admin/canonicalLocationSettingsRoutes";
import { readLocationMetadataPresentation } from "@/lib/admin/location/locationMetadataFields";
import { buildLocationsRailActions } from "@/lib/locations/buildLocationsRailActions";
import {
    buildLocationWorkspaceModel,
    buildLocationProgramOperationalSummaries,
    buildLocationsCollectionModel,
    LOCATION_WORKSPACE_TABS,
    locationsLandingHref,
    type LocationWorkspaceTab,
} from "@/lib/locations/locationWorkspaceModel";
import {
    getLocationConcernDefinition,
    locationConcernHref,
    parseLocationConcernTab,
    resolveActiveLocationConcern,
} from "@/lib/locations/locationConcernContract";
import { resolveLocationsConcernState } from "@/lib/locations/locationsSelectionAdapter";
import {
    invalidateLocationConcernCaches,
    loadLocationOwnedSetup,
    loadLocationAccessMembers,
    loadLocationPlacementPolicy,
    peekLocationOwnedSetup,
} from "@/lib/locations/locationConcernCache";
import { invalidateLocationsCollection } from "@/lib/locations/locationsCollectionCache";
import { formatWeekdaySelection } from "@/lib/childcareOperational/fetchOperationalEnrollment";

export default function LocationsConfigurationPage({
    initialLocationId = null,
    initialTab = "overview",
    initialItemId = null,
}: {
    initialLocationId?: string | null;
    initialTab?: LocationWorkspaceTab;
    initialItemId?: string | null;
}) {
    const router = useRouter();
    const { canMutate, orgId: authOrgId } = useAdminAuth();
    const continuity = useConfigurationContinuityOptional();
    const orgId = continuity?.orgId || authOrgId || "";
    const retainedLocationId = continuity?.selection?.locationId ?? null;
    const retainedConcernTab = continuity?.selection?.locationTab ?? null;
    const retainedConcernItemId = continuity?.selection?.locationItemId ?? null;
    const [creatingSite, setCreatingSite] = useState(false);
    const [editingSite, setEditingSite] = useState(false);
    const [creatingRoom, setCreatingRoom] = useState(false);
    const [creatingSchedule, setCreatingSchedule] = useState(false);
    const [ownedConcernSetupByLocation, setOwnedConcernSetupByLocation] = useState<
        Record<string, Partial<Record<"tours" | "placement" | "access", boolean>>>
    >({});
    const ownedConcernRequestSeq = useRef(0);
    const [activeTab, setActiveTab] = useState<LocationWorkspaceTab>(initialTab);
    const [search, setSearch] = useState("");
    const [showInactive, setShowInactive] = useState(false);
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialTab === "rooms" ? initialItemId : null);
    const [selectedProgramId, setSelectedProgramId] = useState<string | null>(
        initialTab === "programs" ? initialItemId : null,
    );
    const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(
        initialTab === "schedule" ? initialItemId : null,
    );
    const [toursKeepAlive, setToursKeepAlive] = useState(initialTab === "tours");
    const [placementKeepAlive, setPlacementKeepAlive] = useState(initialTab === "placement");
    const [accessKeepAlive, setAccessKeepAlive] = useState(initialTab === "access");
    const {
        selectedId,
        setSelectedId,
        shouldSyncRoute,
        loading,
        error,
        setError,
        siteRows,
        roomRows,
        programCategories,
        schedulePatterns,
        siteLabelById,
        selectedSite,
        createSiteLocation,
        createRoomUnit,
        patchLocation,
        patchProgramCategory,
        roomCapacitySummaryForSite,
        programOptionsForSite,
        ageUnitSelectOptions,
        setSchedulePatterns,
    } = useLocationsConfigurationSettings({
        initialLocationId,
        orgId,
        retainedLocationId,
    });

    // Retained Continuity restore → replace-sync URL (location + concern, no history loop).
    useEffect(() => {
        if (!shouldSyncRoute || !selectedId) return;
        const retainedTab = parseLocationConcernTab(retainedConcernTab);
        const item =
            retainedTab === "rooms" || retainedTab === "programs" || retainedTab === "schedule"
                ? retainedConcernItemId
                : null;
        setActiveTab(retainedTab);
        if (retainedTab === "tours") setToursKeepAlive(true);
        if (retainedTab === "placement") setPlacementKeepAlive(true);
        if (retainedTab === "access") setAccessKeepAlive(true);
        if (retainedTab === "rooms") setSelectedRoomId(item);
        else if (retainedTab === "programs") setSelectedProgramId(item);
        else if (retainedTab === "schedule") setSelectedScheduleId(item);
        router.replace(locationConcernHref(selectedId, retainedTab, item));
    }, [
        shouldSyncRoute,
        selectedId,
        retainedConcernTab,
        retainedConcernItemId,
        router,
    ]);

    // Back/Forward + soft-nav query updates: URL props win via concern adapter.
    // Skip while retained Continuity restore is still projecting into the URL.
    useEffect(() => {
        if (shouldSyncRoute) return;
        const active = resolveActiveLocationConcern(initialTab);
        const localItemId =
            activeTab === "rooms" ? selectedRoomId
            : activeTab === "programs" ? selectedProgramId
            : activeTab === "schedule" ? selectedScheduleId
            : null;
        const projected = resolveLocationsConcernState({
            routeTab: active.concern,
            routeItemId: initialItemId,
            localTab: activeTab,
            localItemId,
            routeLocationId: initialLocationId,
            localLocationId: selectedId,
        });
        setActiveTab(projected.tab);
        if (projected.tab === "tours") setToursKeepAlive(true);
        if (projected.tab === "placement") setPlacementKeepAlive(true);
        if (projected.tab === "access") setAccessKeepAlive(true);
        setSelectedRoomId(projected.tab === "rooms" ? projected.itemId : null);
        setSelectedProgramId(projected.tab === "programs" ? projected.itemId : null);
        setSelectedScheduleId(projected.tab === "schedule" ? projected.itemId : null);
        if (active.normalized && selectedId) {
            router.replace(locationConcernHref(selectedId, projected.tab, projected.itemId));
        }
        // Route props are authoritative; omit local tab/item from deps to avoid loops.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Checkpoint C history projection
    }, [initialTab, initialItemId, initialLocationId, router, selectedId, shouldSyncRoute]);

    const visibleSites = useMemo(() => {
        const query = search.trim().toLowerCase();
        return siteRows.filter((site) => {
            if (!showInactive && site.is_active === false) return false;
            if (!query) return true;
            return [site.label, site.city, site.state]
                .map((value) => String(value ?? "").toLowerCase())
                .some((value) => value.includes(query));
        });
    }, [search, showInactive, siteRows]);

    const selectedPrograms = useMemo(
        () =>
            selectedSite ?
                programCategories
                    .filter((program) => program.location_id === selectedSite.id)
                    .sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || a.label.localeCompare(b.label))
            :   [],
        [programCategories, selectedSite],
    );

    const selectedRooms = useMemo(
        () =>
            selectedSite ?
                roomRows
                    .filter((room) => room.parent_location_id === selectedSite.id)
                    .sort((a, b) => String(a.label ?? "").localeCompare(String(b.label ?? "")))
            :   [],
        [roomRows, selectedSite],
    );

    const selectedSchedules = useMemo(
        () =>
            selectedSite ?
                schedulePatterns
                    .filter((pattern) => pattern.site_location_id === selectedSite.id)
                    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
            :   [],
        [schedulePatterns, selectedSite],
    );

    const effectiveRoomId =
        selectedRoomId && selectedRooms.some((room) => room.id === selectedRoomId) ?
            selectedRoomId
        :   (selectedRooms[0]?.id ?? null);
    const effectiveProgramId =
        selectedProgramId && selectedPrograms.some((program) => program.id === selectedProgramId) ?
            selectedProgramId
        :   (selectedPrograms[0]?.id ?? null);
    const effectiveScheduleId =
        selectedScheduleId && selectedSchedules.some((schedule) => schedule.id === selectedScheduleId) ?
            selectedScheduleId
        :   (selectedSchedules[0]?.id ?? null);
    const selectedRoom = selectedRooms.find((room) => room.id === effectiveRoomId) ?? null;
    const selectedProgram = selectedPrograms.find((program) => program.id === effectiveProgramId) ?? null;
    const selectedSchedule = selectedSchedules.find((schedule) => schedule.id === effectiveScheduleId) ?? null;
    const programSummaries = useMemo(
        () =>
            buildLocationProgramOperationalSummaries({
                programs: selectedPrograms,
                rooms: selectedRooms,
            }),
        [selectedPrograms, selectedRooms],
    );

    const refreshOwnedConcernSetup = useCallback(
        async (locationId: string) => {
            if (!orgId) return;
            const requestSeq = ++ownedConcernRequestSeq.current;
            const peeked = peekLocationOwnedSetup(orgId, locationId);
            if (peeked) {
                setOwnedConcernSetupByLocation((current) => ({
                    ...current,
                    [locationId]: {
                        tours: peeked.toursConfigured ?? undefined,
                        access: peeked.accessConfigured ?? undefined,
                    },
                }));
            }
            try {
                const { snapshot } = await loadLocationOwnedSetup(orgId, locationId, { force: !peeked });
                if (requestSeq !== ownedConcernRequestSeq.current) return;
                setOwnedConcernSetupByLocation((current) => ({
                    ...current,
                    [locationId]: {
                        tours: snapshot.toursConfigured ?? undefined,
                        access: snapshot.accessConfigured ?? undefined,
                    },
                }));
            } catch {
                /* overview setup badges degrade gracefully */
            }
        },
        [orgId],
    );

    const selectedSiteId = selectedSite?.id ?? null;
    useEffect(() => {
        if (!selectedSiteId) return;
        const timeout = window.setTimeout(() => {
            void refreshOwnedConcernSetup(selectedSiteId);
        }, 0);
        return () => window.clearTimeout(timeout);
    }, [refreshOwnedConcernSetup, selectedSiteId]);

    const ownedConcernSetup = selectedSite ? ownedConcernSetupByLocation[selectedSite.id] : undefined;
    const model =
        selectedSite ?
            buildLocationWorkspaceModel({
                site: selectedSite,
                rooms: selectedRooms,
                programs: selectedPrograms,
                schedules: selectedSchedules,
                ownedConcernSetup: {
                    ...ownedConcernSetup,
                    placement: selectedRooms.some((room) => room.is_active !== false),
                },
            })
        :   null;

    const locationsCollection = useMemo(
        () =>
            buildLocationsCollectionModel({
                sites: siteRows,
                rooms: roomRows,
                programs: programCategories,
                schedules: schedulePatterns,
            }),
        [programCategories, roomRows, schedulePatterns, siteRows],
    );

    const openLocation = (locationId: string, tab: LocationWorkspaceTab = "overview") => {
        setSelectedId(locationId);
        setEditingSite(false);
        setCreatingSite(false);
        setCreatingRoom(false);
        setCreatingSchedule(false);
        if (tab === "tours") setToursKeepAlive(true);
        if (tab === "placement") setPlacementKeepAlive(true);
        if (tab === "access") setAccessKeepAlive(true);
        setActiveTab(tab);
        continuity?.rememberLocationSelection({ locationId, tab, itemId: null });
        // Explicit operator selection — push so Back/Forward work across locations.
        router.push(locationConcernHref(locationId, tab));
    };

    const returnToLocations = () => {
        setSelectedId(null);
        setEditingSite(false);
        setCreatingRoom(false);
        setCreatingSchedule(false);
        setActiveTab("overview");
        continuity?.rememberLocationSelection({ locationId: null, tab: null, itemId: null });
        router.push(locationsLandingHref());
    };

    const navigate = useCallback(
        (tab: LocationWorkspaceTab, itemId?: string | null) => {
            if (!selectedSite) return;
            setActiveTab(tab);
            setEditingSite(false);
            setCreatingRoom(false);
            setCreatingSchedule(false);
            if (tab === "tours") setToursKeepAlive(true);
            if (tab === "placement") setPlacementKeepAlive(true);
            if (tab === "access") setAccessKeepAlive(true);
            continuity?.rememberLocationSelection({
                locationId: selectedSite.id,
                tab,
                itemId: itemId ?? null,
            });
            // Nested concern navigation — push for Back/Forward between concerns.
            router.push(locationConcernHref(selectedSite.id, tab, itemId));
        },
        [continuity, router, selectedSite],
    );

    const prefetchConcernIntent = useCallback(
        (tab: LocationWorkspaceTab) => {
            if (!selectedSite || !orgId) return;
            const def = getLocationConcernDefinition(tab);
            if (def.prefetch === "none") return;
            // Advisory route warm — never authoritative.
            void router.prefetch(locationConcernHref(selectedSite.id, tab));
            if (tab === "tours" || tab === "access") {
                void loadLocationOwnedSetup(orgId, selectedSite.id).catch(() => undefined);
            }
            if (tab === "access") {
                void loadLocationAccessMembers(orgId, selectedSite.id).catch(() => undefined);
            }
            if (tab === "placement") {
                void loadLocationPlacementPolicy(orgId).catch(() => undefined);
            }
        },
        [orgId, router, selectedSite],
    );

    const showSetupDestination = (tab: LocationWorkspaceTab | "general") => {
        if (tab === "general") {
            setEditingSite(true);
            return;
        }
        navigate(tab);
    };

    const beginAddLocation = useCallback(() => {
        setCreatingSite(true);
        setEditingSite(false);
        setError(null);
    }, [setError]);

    const addRoom = useCallback(() => {
        if (!selectedSite || !canMutate) return;
        setActiveTab("rooms");
        setEditingSite(false);
        setCreatingSchedule(false);
        setCreatingRoom(true);
        setError(null);
        router.replace(locationConcernHref(selectedSite.id, "rooms"));
    }, [canMutate, router, selectedSite, setError]);

    const addProgram = useCallback(() => {
        if (!selectedSite || !canMutate) return;
        router.push("/organization/programs");
    }, [canMutate, router, selectedSite]);

    const firstRoomNeedingCapacityId = useMemo(() => {
        const match = selectedRooms.find((room) => !readLocationMetadataPresentation(room.metadata).capacity);
        return match?.id ?? null;
    }, [selectedRooms]);

    const operatingSnapshot = useMemo(
        () => ({
            scheduleName: selectedSchedules[0]?.label?.trim() || null,
            hoursLabel:
                selectedSchedules.length > 0 ? formatWeekdaySelection(selectedSchedules[0]!.weekdays) : null,
            programNames: selectedPrograms
                .filter((program) => program.is_active !== false)
                .map((program) => program.label.trim())
                .filter(Boolean),
            activeRoomCount: model?.activeRoomCount ?? 0,
            configuredCapacity: model?.configuredCapacity ?? null,
        }),
        [model?.activeRoomCount, model?.configuredCapacity, selectedPrograms, selectedSchedules],
    );

    const railActions = useMemo(
        () =>
            buildLocationsRailActions({
                activeTab,
                canMutate,
                model,
                selectedSite: Boolean(selectedSite),
                scheduleCount: selectedSchedules.length,
                roomCount: selectedRooms.length,
                programCount: selectedPrograms.length,
                hasSelectedProgram: Boolean(effectiveProgramId),
                hasSelectedRoom: Boolean(effectiveRoomId),
                roomsNeedingCapacity: model?.roomsNeedingCapacity ?? 0,
                firstRoomNeedingCapacityId,
                onAddLocation: beginAddLocation,
                onEditLocation: () => setEditingSite(true),
                onAddRoom: addRoom,
                onAddProgram: addProgram,
                onNavigate: navigate,
                onCreateSchedule: () => {
                    if (!canMutate) return;
                    setCreatingSchedule(true);
                },
            }),
        [
            activeTab,
            addProgram,
            addRoom,
            beginAddLocation,
            canMutate,
            effectiveProgramId,
            effectiveRoomId,
            firstRoomNeedingCapacityId,
            model,
            navigate,
            selectedPrograms.length,
            selectedRooms.length,
            selectedSchedules.length,
            selectedSite,
        ],
    );

    const locationSummaryById = useMemo(() => {
        const map = new Map(locationsCollection.locations.map((location) => [location.id, location]));
        return map;
    }, [locationsCollection.locations]);

    const scheduleSummary =
        selectedSchedules.length > 0 ?
            formatWeekdaySelection(selectedSchedules[0]!.weekdays)
        :   "Not set up yet";

    const tabBody = (() => {
        if (!selectedSite) return null;
        if (editingSite) {
            return (
                <div className="space-y-3">
                    <button
                        type="button"
                        className="text-xs font-semibold text-[#007d68]"
                        onClick={() => setEditingSite(false)}
                    >
                        ← Back to {model?.displayName ?? "location"}
                    </button>
                    <LocationSiteDetailPanel
                        site={selectedSite}
                        capacitySummary={roomCapacitySummaryForSite(selectedSite.id)}
                        canMutate={canMutate}
                        onSave={patchLocation}
                    />
                </div>
            );
        }
        if (activeTab === "overview" && model) {
            return (
                <div className="space-y-3">
                    <LocationOverviewSurface
                        model={model}
                        scheduleSummary={scheduleSummary}
                        operatingSnapshot={operatingSnapshot}
                        onResolveAttention={showSetupDestination}
                        onSelectReadinessArea={showSetupDestination}
                        onOpenTab={navigate}
                    />
                </div>
            );
        }
        if (activeTab === "programs") {
            return (
                <LocationProgramDetailPanel
                    program={selectedProgram}
                    summary={programSummaries.find((summary) => summary.id === effectiveProgramId) ?? null}
                    summaries={programSummaries}
                    siteLabel={model?.displayName ?? ""}
                    locationHasSchedule={selectedSchedules.length > 0}
                    scheduleSummary={scheduleSummary}
                    canMutate={canMutate}
                    onSave={patchProgramCategory}
                    programs={selectedPrograms}
                    selectedProgramId={effectiveProgramId}
                    onSelectProgram={(programId) => {
                        setSelectedProgramId(programId);
                        navigate("programs", programId);
                    }}
                    onAddProgram={canMutate ? addProgram : undefined}
                    ageUnitSelectOptions={ageUnitSelectOptions}
                />
            );
        }
        if (activeTab === "rooms") {
            return (
                <LocationRoomDetailPanel
                    room={selectedRoom}
                    siteLabel={model?.displayName ?? ""}
                    programOptions={programOptionsForSite(selectedSite.id)}
                    ageUnitSelectOptions={ageUnitSelectOptions}
                    canMutate={canMutate}
                    onSave={patchLocation}
                    rooms={selectedRooms}
                    selectedRoomId={creatingRoom ? null : effectiveRoomId}
                    onSelectRoom={(roomId) => {
                        setSelectedRoomId(roomId);
                        navigate("rooms", roomId);
                    }}
                    onAddRoom={canMutate ? addRoom : undefined}
                    locationHasSchedule={selectedSchedules.length > 0}
                    scheduleSummary={scheduleSummary}
                    createDetail={
                        creatingRoom ?
                            <LocationRoomCreatePanel
                                siteLabel={model?.displayName ?? ""}
                                programOptions={programOptionsForSite(selectedSite.id)}
                                ageUnitSelectOptions={ageUnitSelectOptions}
                                onCancel={() => setCreatingRoom(false)}
                                onCreate={async (input) => {
                                    const newId = await createRoomUnit(selectedSite.id, input);
                                    setCreatingRoom(false);
                                    setSelectedRoomId(newId);
                                    navigate("rooms", newId);
                                }}
                            />
                        :   undefined
                    }
                />
            );
        }
        if (activeTab === "schedule") {
            return (
                <div className="space-y-3" data-testid="locations-schedule">
                    <ConfigChildObjectMasterDetail
                        listTitle="Schedule patterns"
                        listSummary={`${selectedSchedules.length} ${
                            selectedSchedules.length === 1 ? "pattern" : "patterns"
                        }`}
                        testId="locations-schedule-patterns"
                        listActions={
                            canMutate ?
                                <ConfigurationPrimaryButton
                                    className="px-2 py-1 text-[11px]"
                                    onClick={() => setCreatingSchedule(true)}
                                    data-testid="locations-schedule-add"
                                >
                                    + Add pattern
                                </ConfigurationPrimaryButton>
                            :   null
                        }
                        list={
                            selectedSchedules.length > 0 ?
                                selectedSchedules.map((schedule) => {
                                    const selected = schedule.id === effectiveScheduleId && !creatingSchedule;
                                    return (
                                        <ConfigurationQueueItem
                                            key={schedule.id}
                                            variant="rail"
                                            active={selected}
                                            muted={!schedule.is_active}
                                            title={schedule.label}
                                            subtitle={`${schedule.is_active ? "Active" : "Inactive"} · ${formatWeekdaySelection(schedule.weekdays)}`}
                                            leading={
                                                <span
                                                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
                                                        !schedule.is_active ?
                                                            "bg-alloy-midnight/[0.04] text-alloy-midnight/35"
                                                        : selected ?
                                                            "bg-alloy-bend-pine/[0.14] text-alloy-bend-pine"
                                                        :   "bg-alloy-midnight/[0.04] text-alloy-bend-pine"
                                                    }`}
                                                >
                                                    <CalendarDays className="h-4 w-4" strokeWidth={2} />
                                                </span>
                                            }
                                            onClick={() => {
                                                setCreatingSchedule(false);
                                                setSelectedScheduleId(schedule.id);
                                                navigate("schedule", schedule.id);
                                            }}
                                            testId={`locations-schedule-${schedule.id}`}
                                        />
                                    );
                                })
                            :   <p className="config-typo-sublabel">No recurring patterns yet.</p>
                        }
                        detail={
                            creatingSchedule ?
                                <LocationSchedulePatternCreatePanel
                                    locationId={selectedSite.id}
                                    onCancel={() => setCreatingSchedule(false)}
                                    onCreated={(created) => {
                                        setSchedulePatterns((current) => [...current, created]);
                                        if (orgId) {
                                            invalidateLocationsCollection(orgId, "schedule-pattern-created");
                                        }
                                        setSelectedScheduleId(created.id);
                                        setCreatingSchedule(false);
                                        navigate("schedule", created.id);
                                    }}
                                />
                            :   <LocationScheduleTemplateDetailPanel
                                    pattern={selectedSchedule}
                                    siteLabel={siteLabelById.get(selectedSite.id) ?? model?.displayName ?? ""}
                                    canMutate={canMutate}
                                    onUpdated={(row) => {
                                        setSchedulePatterns((prev) =>
                                            prev.map((pattern) => (pattern.id === row.id ? row : pattern)),
                                        );
                                        if (orgId) {
                                            invalidateLocationsCollection(orgId, "schedule-pattern-updated");
                                        }
                                    }}
                                    onError={setError}
                                />
                        }
                    />

                    <section className="process-config-setup-card p-4" data-testid="locations-schedule-closures">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="config-typo-workspace-title">Closures and exceptions</h3>
                                <p className="config-typo-sublabel mt-1">
                                    Date-specific changes stay distinct from recurring weekly patterns.
                                </p>
                            </div>
                            <ConfigurationSecondaryButton
                                disabled
                                title="Closure records are not available in the current schedule provider."
                                data-testid="locations-schedule-add-closure"
                            >
                                Add closure
                            </ConfigurationSecondaryButton>
                        </div>
                        <div className="mt-4 rounded-md border border-alloy-forge/10 bg-alloy-stone/[0.035] px-3 py-3">
                            <p className="text-sm font-medium text-alloy-midnight">No closure provider available</p>
                            <p className="config-typo-sublabel mt-1">
                                Add Closure is unavailable until date-specific exceptions have an authoritative
                                persistence source.
                            </p>
                        </div>
                    </section>
                </div>
            );
        }
        if (activeTab === "tours") {
            return null;
        }
        if (activeTab === "placement") {
            return null;
        }
        if (activeTab === "access") {
            return null;
        }
        return null;
    })();

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="locations-configuration-page">
            <LocationsCommandRailActions actions={railActions} />

            {!selectedSite && !initialLocationId ?
                <div className="w-full" data-testid="locations-content-column">
                    <ConfigurationContext
                        title="Locations"
                        titleIcon={<MapPin className="h-5 w-5" strokeWidth={2} />}
                        testId="locations-configuration-context"
                    >
                        {!loading ?
                            <div
                                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-alloy-stone/25 pt-2"
                                data-testid="locations-collection-posture"
                            >
                                <ConfigScopeContextBar
                                    mode="organization"
                                    organizationLabel="Organization"
                                    objectLabel="Location"
                                    ownershipHint="All locations"
                                    onModeChange={(mode) => {
                                        if (mode === "object" && siteRows[0]) openLocation(siteRows[0].id);
                                    }}
                                />
                                <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-alloy-midnight/52">
                                    <li>
                                        <strong className="font-semibold text-alloy-midnight">
                                            {locationsCollection.activeLocationCount}
                                        </strong>{" "}
                                        Active Locations
                                    </li>
                                    <li>
                                        <strong className="font-semibold text-alloy-midnight">
                                            {locationsCollection.averageSetupPercent}%
                                        </strong>{" "}
                                        Average Readiness
                                    </li>
                                    <li>
                                        <strong className="font-semibold text-alloy-midnight">
                                            {locationsCollection.locationsNeedingAttention}
                                        </strong>{" "}
                                        Need Attention
                                    </li>
                                </ul>
                            </div>
                        :   null}
                    </ConfigurationContext>
                </div>
            :   null}

            {error ?
                <p
                    className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                    role="alert"
                >
                    {error}
                </p>
            :   null}

            <ConfigurationShell testId="locations-configuration-shell">
                {loading ?
                    <ConfigurationEmptyState
                        testId="locations-loading"
                        title="Loading locations"
                        description="Fetching locations and their owned configuration."
                    />
                : creatingSite ?
                    <LocationSiteCreatePanel
                        canMutate={canMutate}
                        onCancel={() => {
                            setCreatingSite(false);
                            if (!selectedSite) router.replace(locationsLandingHref());
                        }}
                        onCreate={async (input) => {
                            const newId = await createSiteLocation(input);
                            setCreatingSite(false);
                            setSelectedId(newId);
                            setActiveTab("overview");
                            router.replace(canonicalLocationSettingsHref(newId));
                            return newId;
                        }}
                    />
                :   <div
                        className={`grid items-start gap-4 pb-4 ${
                            selectedSite ? "xl:grid-cols-[20.5rem_minmax(0,1fr)]" : ""
                        }`}
                    >
                        {selectedSite ?
                            <LocationsObjectSelector
                                sites={visibleSites}
                                selectedId={selectedId}
                                showInactive={showInactive}
                                onShowInactiveChange={setShowInactive}
                                search={search}
                                onSearchChange={setSearch}
                                canMutate={canMutate}
                                onAddLocation={beginAddLocation}
                                locationSummaryById={locationSummaryById}
                                onSelect={(locationId) => {
                                    setSelectedId(locationId);
                                    setEditingSite(false);
                                    continuity?.rememberLocationSelection({
                                        locationId,
                                        tab: activeTab,
                                        itemId: null,
                                    });
                                    router.push(locationConcernHref(locationId, activeTab));
                                }}
                            />
                        :   null}

                        <main
                            className="min-w-0 space-y-2.5"
                            data-testid={selectedSite ? "locations-selected-location" : "locations-composition"}
                        >
                            {selectedSite ?
                                <div className="xl:hidden">
                                    <label className="config-typo-field-label" htmlFor="locations-mobile-selector">
                                        Location
                                    </label>
                                    <select
                                        id="locations-mobile-selector"
                                        className="config-runtime-select mt-1"
                                        value={selectedSite.id}
                                        onChange={(event) => {
                                            setSelectedId(event.target.value);
                                            setEditingSite(false);
                                            continuity?.rememberLocationSelection({
                                                locationId: event.target.value,
                                                tab: activeTab,
                                                itemId: null,
                                            });
                                            router.push(locationConcernHref(event.target.value, activeTab));
                                        }}
                                    >
                                        {siteRows.map((site) => (
                                            <option key={site.id} value={site.id}>
                                                {String(site.label ?? "").trim() || "Untitled location"}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            :   null}

                            {!selectedSite ?
                                <LocationsLanding
                                    collection={locationsCollection}
                                    showInactive={showInactive}
                                    onShowInactiveChange={setShowInactive}
                                    search={search}
                                    onSearchChange={setSearch}
                                    onOpenLocation={(locationId, tab) =>
                                        openLocation(locationId, tab === "general" || tab == null ? "overview" : tab)
                                    }
                                    onAddLocation={beginAddLocation}
                                    canMutate={canMutate}
                                />
                            :   <ConfigDetailRuntime<LocationWorkspaceTab>
                                    header={
                                        <ConfigObjectHeader
                                            size="hero"
                                            name={model?.displayName ?? "Location"}
                                            status={{
                                                label: selectedSite.is_active === false ? "Inactive" : "Active",
                                                tone: selectedSite.is_active === false ? "inactive" : "active",
                                            }}
                                            breadcrumb={
                                                <nav
                                                    className="flex flex-wrap items-center gap-1.5 text-[11px] text-alloy-midnight/45"
                                                    aria-label="Location ownership"
                                                >
                                                    <button
                                                        type="button"
                                                        className="font-medium underline-offset-2 hover:text-alloy-midnight/70 hover:underline"
                                                        onClick={returnToLocations}
                                                        data-testid="locations-breadcrumb-collection"
                                                    >
                                                        Locations
                                                    </button>
                                                    <span aria-hidden="true">›</span>
                                                    <span className="font-semibold text-alloy-midnight/65">
                                                        {model?.displayName ?? "Location"}
                                                    </span>
                                                </nav>
                                            }
                                            factsContent={
                                                <LocationIdentityFactsRow
                                                    city={selectedSite.city}
                                                    state={selectedSite.state}
                                                    timezoneIana={model?.timezone}
                                                />
                                            }
                                            actions={
                                                canMutate && !editingSite ?
                                                    <button
                                                        type="button"
                                                        className="rounded-md border border-alloy-forge/15 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/10"
                                                        onClick={() => setEditingSite(true)}
                                                        data-testid="locations-edit-location"
                                                    >
                                                        Edit location
                                                    </button>
                                                :   undefined
                                            }
                                            testId="locations-object-header"
                                        />
                                    }
                                    tabs={LOCATION_WORKSPACE_TABS}
                                    activeSection={activeTab}
                                    onSectionChange={navigate}
                                    onSectionIntent={prefetchConcernIntent}
                                    testId="locations-detail-runtime"
                                    headerTestId="locations-hero"
                                    tabAriaLabel="Location configuration"
                                    tabTestIdPrefix="locations-tab"
                                >
                                    {tabBody}
                                    {toursKeepAlive && !editingSite ?
                                        <div
                                            className={activeTab === "tours" ? undefined : "hidden"}
                                            data-testid="locations-tours-keepalive"
                                        >
                                            <LocationToursPanel
                                                key={selectedSite.id}
                                                locationId={selectedSite.id}
                                                locationLabel={model?.displayName ?? ""}
                                                onMutationCommitted={() => {
                                                    invalidateLocationConcernCaches(orgId, "tours", {
                                                        locationId: selectedSite.id,
                                                        reason: "tours-mutated",
                                                    });
                                                    return refreshOwnedConcernSetup(selectedSite.id);
                                                }}
                                            />
                                        </div>
                                    :   null}
                                    {placementKeepAlive && !editingSite ?
                                        <div
                                            className={activeTab === "placement" ? undefined : "hidden"}
                                            data-testid="locations-placement-keepalive"
                                        >
                                            <LocationPlacementPanel
                                                orgId={orgId}
                                                rooms={selectedRooms}
                                                onReviewRooms={() => navigate("rooms")}
                                                canMutate={canMutate}
                                                onMutationCommitted={() => refreshOwnedConcernSetup(selectedSite.id)}
                                            />
                                        </div>
                                    :   null}
                                    {accessKeepAlive && !editingSite ?
                                        <div
                                            className={activeTab === "access" ? undefined : "hidden"}
                                            data-testid="locations-access-keepalive"
                                        >
                                            <LocationAccessPanel
                                                key={selectedSite.id}
                                                orgId={orgId}
                                                locationId={selectedSite.id}
                                                onMutationCommitted={() => refreshOwnedConcernSetup(selectedSite.id)}
                                            />
                                        </div>
                                    :   null}
                                </ConfigDetailRuntime>
                            }
                        </main>
                    </div>
                }
            </ConfigurationShell>

        </div>
    );
}
