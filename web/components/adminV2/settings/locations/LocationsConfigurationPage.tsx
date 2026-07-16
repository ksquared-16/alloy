"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    ConfigurationContext,
    ConfigurationEmptyState,
    ConfigurationQueue,
    ConfigurationQueueItem,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigApplyToDialog,
    ConfigObjectHeader,
    ConfigScopeContextBar,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import LocationProgramDetailPanel from "@/components/adminV2/settings/locations/LocationProgramDetailPanel";
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
import { LocationOverviewSurface } from "@/components/adminV2/settings/locations/LocationOverviewSurface";
import { LocationsCommandRailActions } from "@/components/adminV2/settings/locations/LocationsCommandRailActions";
import { useLocationsConfigurationSettings } from "@/components/adminV2/settings/locations/useLocationsConfigurationSettings";
import LocationsFleetLanding from "@/components/adminV2/settings/locations/LocationsFleetLanding";
import { canonicalLocationSettingsHref } from "@/lib/admin/canonicalLocationSettingsRoutes";
import { readLocationMetadataPresentation } from "@/lib/admin/location/locationMetadataFields";
import { buildLocationsRailActions } from "@/lib/locations/buildLocationsRailActions";
import {
    buildLocationIdentityFacts,
    formatLocationLocality,
} from "@/lib/locations/locationIdentityPresentation";
import {
    buildLocationWorkspaceModel,
    buildLocationProgramOperationalSummaries,
    buildLocationsFleetModel,
    LOCATION_WORKSPACE_TABS,
    locationsFleetHref,
    locationWorkspaceHref,
    type LocationWorkspaceTab,
} from "@/lib/locations/locationWorkspaceModel";
import { formatWeekdaySelection } from "@/lib/childcareOperational/fetchOperationalEnrollment";

function locationSelectorSignal(location: {
    criticalCount: number;
    improveCount: number;
    setupPercent: number;
    locality: string | null;
    isActive: boolean;
}): string {
    if (!location.isActive) return "Inactive";
    if (location.criticalCount > 0) return `${location.criticalCount} issues`;
    if (location.setupPercent < 100) return `${location.setupPercent}% ready`;
    if (location.locality) return location.locality;
    return "Ready";
}

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
    const { canMutate } = useAdminAuth();
    const [creatingSite, setCreatingSite] = useState(false);
    const [editingSite, setEditingSite] = useState(false);
    const [creatingSchedule, setCreatingSchedule] = useState(false);
    const [applyToOpen, setApplyToOpen] = useState(false);
    const [applyNotice, setApplyNotice] = useState<string | null>(null);
    const [ownedConcernSetupByLocation, setOwnedConcernSetupByLocation] = useState<
        Record<string, Partial<Record<"tours" | "placement" | "access", boolean>>>
    >({});
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

    useEffect(() => {
        if (activeTab === "tours") setToursKeepAlive(true);
        if (activeTab === "placement") setPlacementKeepAlive(true);
    }, [activeTab]);
    const {
        selectedId,
        setSelectedId,
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
        createProgramCategory,
        patchLocation,
        patchProgramCategory,
        roomCapacitySummaryForSite,
        programOptionsForSite,
        ageUnitSelectOptions,
        setSchedulePatterns,
    } = useLocationsConfigurationSettings({ initialLocationId });

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

    useEffect(() => {
        if (!selectedSite) return;
        let cancelled = false;
        const locationId = selectedSite.id;
        void Promise.all([
            fetch(`/api/admin/tours/availability-rules?location_id=${encodeURIComponent(locationId)}`, {
                credentials: "include",
            })
                .then(async (response) => {
                    if (!response.ok) return null;
                    const json = (await response.json().catch(() => ({}))) as {
                        rules?: { location_id?: string | null; is_active?: boolean }[];
                    };
                    return (json.rules ?? []).some(
                        (rule) => rule.location_id === locationId && rule.is_active !== false,
                    );
                })
                .catch(() => null),
            fetch("/api/admin/settings/users-roles/members", { credentials: "include" })
                .then(async (response) => {
                    if (!response.ok) return null;
                    const json = (await response.json().catch(() => ({}))) as {
                        members?: {
                            role_keys?: string[];
                            site_scope?: string;
                            site_location_ids?: string[];
                        }[];
                    };
                    return (json.members ?? []).some(
                        (member) =>
                            member.role_keys?.includes("admin") &&
                            (member.site_scope === "all" || member.site_location_ids?.includes(locationId)),
                    );
                })
                .catch(() => null),
        ]).then(([tours, access]) => {
            if (cancelled) return;
            setOwnedConcernSetupByLocation((current) => ({
                ...current,
                [locationId]: {
                    tours: tours ?? undefined,
                    access: access ?? undefined,
                },
            }));
        });
        return () => {
            cancelled = true;
        };
    }, [selectedSite]);

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

    const fleet = useMemo(
        () =>
            buildLocationsFleetModel({
                sites: siteRows,
                rooms: roomRows,
                programs: programCategories,
                schedules: schedulePatterns,
            }),
        [programCategories, roomRows, schedulePatterns, siteRows],
    );

    const identityFacts = useMemo(
        () =>
            selectedSite ?
                buildLocationIdentityFacts({
                    city: selectedSite.city,
                    state: selectedSite.state,
                    timezoneIana: model?.timezone,
                })
            :   [],
        [model?.timezone, selectedSite],
    );

    const openLocation = (locationId: string, tab: LocationWorkspaceTab = "overview") => {
        setSelectedId(locationId);
        setEditingSite(false);
        setCreatingSite(false);
        setActiveTab(tab);
        router.replace(locationWorkspaceHref(locationId, tab));
    };

    const returnToFleet = () => {
        setSelectedId(null);
        setEditingSite(false);
        setCreatingSchedule(false);
        setActiveTab("overview");
        router.replace(locationsFleetHref());
    };

    const navigate = (tab: LocationWorkspaceTab, itemId?: string | null) => {
        if (!selectedSite) return;
        setActiveTab(tab);
        setEditingSite(false);
        setCreatingSchedule(false);
        router.replace(locationWorkspaceHref(selectedSite.id, tab, itemId));
    };

    const showSetupDestination = (tab: LocationWorkspaceTab | "general") => {
        if (tab === "general") {
            setEditingSite(true);
            return;
        }
        navigate(tab);
    };

    const beginAddLocation = () => {
        setCreatingSite(true);
        setEditingSite(false);
        setError(null);
    };

    const addRoom = () => {
        if (!selectedSite || !canMutate) return;
        void (async () => {
            try {
                const newId = await createRoomUnit(
                    selectedSite.id,
                    `Room ${(selectedRooms.length + 1).toString()}`,
                );
                setSelectedRoomId(newId);
                navigate("rooms", newId);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to add room");
            }
        })();
    };

    const addProgram = () => {
        if (!selectedSite || !canMutate) return;
        void (async () => {
            try {
                const newId = await createProgramCategory(
                    selectedSite.id,
                    `Program ${(selectedPrograms.length + 1).toString()}`,
                );
                setSelectedProgramId(newId);
                navigate("programs", newId);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to add program");
            }
        })();
    };

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
                siteCount: siteRows.length,
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
                onApply: () => setApplyToOpen(true),
                onCreateSchedule: () => {
                    if (!canMutate) return;
                    setCreatingSchedule(true);
                    navigate("schedule");
                },
            }),
        [
            activeTab,
            canMutate,
            effectiveProgramId,
            effectiveRoomId,
            firstRoomNeedingCapacityId,
            model,
            selectedPrograms.length,
            selectedRooms.length,
            selectedSchedules.length,
            selectedSite,
            siteRows.length,
        ],
    );

    const fleetById = useMemo(() => {
        const map = new Map(fleet.locations.map((location) => [location.id, location]));
        return map;
    }, [fleet.locations]);

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
                    {applyNotice ?
                        <p className="rounded-md border border-[#00a283]/20 bg-[#00a283]/5 px-3 py-2 text-xs text-[#007d68]">
                            {applyNotice}
                        </p>
                    :   null}
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
                    selectedRoomId={effectiveRoomId}
                    onSelectRoom={(roomId) => {
                        setSelectedRoomId(roomId);
                        navigate("rooms", roomId);
                    }}
                    onAddRoom={canMutate ? addRoom : undefined}
                />
            );
        }
        if (activeTab === "schedule") {
            return (
                <div className="space-y-3" data-testid="locations-schedule">
                    <section className="process-config-setup-card p-4" data-testid="locations-schedule-patterns">
                        <div>
                            <h3 className="config-typo-workspace-title">Schedule Patterns</h3>
                            <p className="config-typo-sublabel mt-1">
                                Reusable weekly attendance patterns offered by this location. Use Actions to add a
                                pattern.
                            </p>
                        </div>
                        <div className="mt-4">
                            {creatingSchedule ?
                                <LocationSchedulePatternCreatePanel
                                    locationId={selectedSite.id}
                                    onCancel={() => setCreatingSchedule(false)}
                                    onCreated={(created) => {
                                        setSchedulePatterns((current) => [...current, created]);
                                        setSelectedScheduleId(created.id);
                                        setCreatingSchedule(false);
                                        navigate("schedule", created.id);
                                    }}
                                />
                            :   <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
                                    <ConfigurationQueue title="Schedule patterns">
                                        <div className="divide-y divide-alloy-stone/18 border-t border-alloy-stone/20">
                                            {selectedSchedules.length > 0 ?
                                                selectedSchedules.map((schedule) => (
                                                    <ConfigurationQueueItem
                                                        key={schedule.id}
                                                        variant="rail"
                                                        active={schedule.id === effectiveScheduleId}
                                                        title={schedule.label}
                                                        subtitle={formatWeekdaySelection(schedule.weekdays)}
                                                        onClick={() => {
                                                            setSelectedScheduleId(schedule.id);
                                                            navigate("schedule", schedule.id);
                                                        }}
                                                        testId={`locations-schedule-${schedule.id}`}
                                                    />
                                                ))
                                            :   <p className="config-typo-sublabel px-2 py-3">
                                                    Set weekly hours to get started.
                                                </p>}
                                        </div>
                                    </ConfigurationQueue>
                                    <LocationScheduleTemplateDetailPanel
                                        pattern={selectedSchedule}
                                        siteLabel={siteLabelById.get(selectedSite.id) ?? model?.displayName ?? ""}
                                        canMutate={canMutate}
                                        onUpdated={(row) => {
                                            setSchedulePatterns((prev) =>
                                                prev.map((p) => (p.id === row.id ? row : p)),
                                            );
                                        }}
                                        onError={setError}
                                    />
                                </div>
                            }
                        </div>
                    </section>

                    <section className="process-config-setup-card p-4" data-testid="locations-schedule-closures">
                        <div>
                            <h3 className="config-typo-workspace-title">Closures / Holidays</h3>
                            <p className="config-typo-sublabel mt-1">
                                Full-day closures and holiday exceptions belong to this location.
                            </p>
                        </div>
                        <p className="config-typo-sublabel mt-4">
                            No date-specific closure records are available in the current schedule configuration.
                        </p>
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
        return <LocationAccessPanel key={selectedSite.id} locationId={selectedSite.id} />;
    })();

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="locations-configuration-page">
            <LocationsCommandRailActions actions={railActions} />

            <ConfigurationContext
                title="Locations"
                titleIcon={<MapPin className="h-5 w-5" strokeWidth={2} />}
                testId="locations-configuration-context"
            />

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
                            if (!selectedSite) router.replace(locationsFleetHref());
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
                            selectedSite ? "xl:grid-cols-[16rem_minmax(0,1fr)]" : ""
                        }`}
                    >
                        {selectedSite ?
                            <aside
                                className="process-config-setup-card hidden self-start p-0 xl:block"
                                aria-label="Location selector"
                                data-testid="locations-object-selector"
                            >
                                <div className="flex items-start justify-between gap-2 px-3 pb-2 pt-3">
                                    <div>
                                        <p className="config-typo-queue-section-label">Locations</p>
                                        <p className="config-typo-sublabel mt-0.5">{visibleSites.length} shown</p>
                                    </div>
                                    <label className="flex items-center gap-1.5 text-[11px] text-alloy-midnight/55">
                                        <input
                                            type="checkbox"
                                            checked={showInactive}
                                            onChange={(event) => setShowInactive(event.target.checked)}
                                        />
                                        Inactive
                                    </label>
                                </div>
                                <label className="sr-only" htmlFor="locations-search">
                                    Search locations
                                </label>
                                <input
                                    id="locations-search"
                                    type="search"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search locations"
                                    className="config-runtime-input mx-2.5 mb-2 w-[calc(100%-1.25rem)]"
                                />
                                <div className="space-y-1 px-2 pb-3">
                                    {visibleSites.map((site) => {
                                        const summary = fleetById.get(site.id);
                                        const locality =
                                            formatLocationLocality({ city: site.city, state: site.state }) ??
                                            summary?.locality ??
                                            null;
                                        return (
                                            <ConfigurationQueueItem
                                                key={site.id}
                                                variant="rail"
                                                active={site.id === selectedId}
                                                title={String(site.label ?? "").trim() || "Untitled location"}
                                                subtitle={
                                                    summary ?
                                                        locationSelectorSignal({ ...summary, locality })
                                                    :   site.is_active === false ?
                                                        "Inactive"
                                                    :   "Active"
                                                }
                                                onClick={() => {
                                                    setSelectedId(site.id);
                                                    setEditingSite(false);
                                                    router.replace(locationWorkspaceHref(site.id, activeTab));
                                                }}
                                                testId={`locations-location-${site.id}`}
                                            />
                                        );
                                    })}
                                </div>
                            </aside>
                        :   null}

                        <main
                            className="min-w-0 space-y-3"
                            data-testid={selectedSite ? "locations-selected-location" : "locations-fleet-composition"}
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
                                            router.replace(locationWorkspaceHref(event.target.value, activeTab));
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

                            <ConfigScopeContextBar
                                mode={selectedSite ? "object" : "organization"}
                                organizationLabel="Organization"
                                objectLabel={model?.displayName ?? "Location"}
                                ownershipHint={selectedSite ? "This location" : "All locations"}
                                onModeChange={(mode) => {
                                    if (mode === "organization") returnToFleet();
                                    else if (siteRows[0]) openLocation(siteRows[0].id);
                                }}
                            />

                            {!selectedSite ?
                                <LocationsFleetLanding
                                    fleet={fleet}
                                    showInactive={showInactive}
                                    onShowInactiveChange={setShowInactive}
                                    search={search}
                                    onSearchChange={setSearch}
                                    onOpenLocation={(locationId) => openLocation(locationId)}
                                    onAddLocation={beginAddLocation}
                                    canMutate={canMutate}
                                />
                            :   <>
                                    <section
                                        className="process-config-setup-card px-5 pt-3"
                                        data-testid="locations-hero"
                                    >
                                        <ConfigObjectHeader
                                            size="hero"
                                            name={model?.displayName ?? "Location"}
                                            status={{
                                                label: selectedSite.is_active === false ? "Inactive" : "Active",
                                                tone: selectedSite.is_active === false ? "inactive" : "active",
                                            }}
                                            facts={identityFacts}
                                            testId="locations-object-header"
                                        />

                                        <div
                                            className="mt-2.5 flex overflow-x-auto border-t border-alloy-stone/25"
                                            role="tablist"
                                            aria-label="Location settings"
                                        >
                                            {LOCATION_WORKSPACE_TABS.map((tab) => (
                                                <button
                                                    key={tab.key}
                                                    type="button"
                                                    role="tab"
                                                    aria-selected={activeTab === tab.key && !editingSite}
                                                    className={`shrink-0 border-b-2 px-3 py-2 text-xs font-semibold ${
                                                        activeTab === tab.key && !editingSite ?
                                                            "border-[#00a283] text-[#007d68]"
                                                        :   "border-transparent text-alloy-midnight/50 hover:text-alloy-midnight/75"
                                                    }`}
                                                    onClick={() => navigate(tab.key)}
                                                    data-testid={`locations-tab-${tab.key}`}
                                                >
                                                    {tab.label}
                                                </button>
                                            ))}
                                        </div>
                                    </section>

                                    {tabBody}
                                    {toursKeepAlive && !editingSite ?
                                        <div
                                            className={activeTab === "tours" ? undefined : "hidden"}
                                            data-testid="locations-tours-keepalive"
                                        >
                                            <LocationToursPanel
                                                locationId={selectedSite.id}
                                                locationLabel={model?.displayName ?? ""}
                                            />
                                        </div>
                                    :   null}
                                    {placementKeepAlive && !editingSite ?
                                        <div
                                            className={activeTab === "placement" ? undefined : "hidden"}
                                            data-testid="locations-placement-keepalive"
                                        >
                                            <LocationPlacementPanel
                                                rooms={selectedRooms}
                                                onReviewRooms={() => navigate("rooms")}
                                                canMutate={canMutate}
                                            />
                                        </div>
                                    :   null}
                                </>
                            }
                        </main>
                    </div>
                }
            </ConfigurationShell>

            <ConfigApplyToDialog
                open={applyToOpen}
                title="Apply configuration to…"
                description="Choose other locations that should receive configuration from this location."
                targets={siteRows
                    .filter((site) => site.id !== selectedSite?.id)
                    .map((site) => ({
                        id: site.id,
                        label: String(site.label ?? "").trim() || "Untitled location",
                        subtitle: [site.city, site.state].filter(Boolean).join(", ") || undefined,
                    }))}
                confirmLabel="Apply"
                onClose={() => setApplyToOpen(false)}
                onApply={async (targetIds) => {
                    // Substrate push is deferred; establish the reusable Apply To interaction now.
                    setApplyNotice(
                        `Ready to apply to ${targetIds.length} ${targetIds.length === 1 ? "location" : "locations"}. Configuration push connects next without changing this interaction.`,
                    );
                }}
            />
        </div>
    );
}
