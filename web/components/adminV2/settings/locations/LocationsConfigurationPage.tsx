"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    ConfigurationContext,
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
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
import {
    LocationsCommandRailActions,
    type LocationsRailAction,
} from "@/components/adminV2/settings/locations/LocationsCommandRailActions";
import { useLocationsConfigurationSettings } from "@/components/adminV2/settings/locations/useLocationsConfigurationSettings";
import LocationsFleetLanding from "@/components/adminV2/settings/locations/LocationsFleetLanding";
import { canonicalLocationSettingsHref } from "@/lib/admin/canonicalLocationSettingsRoutes";
import { buildLocationIdentityFacts } from "@/lib/locations/locationIdentityPresentation";
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

    const railActions = useMemo((): LocationsRailAction[] => {
        const actions: LocationsRailAction[] = [];

        if (!selectedSite) {
            if (canMutate) {
                actions.push({
                    id: "add-location",
                    label: "Add Location",
                    group: "manage",
                    onClick: beginAddLocation,
                });
            }
            return actions;
        }

        if (!model) return actions;

        const applyDisabled = !canMutate || siteRows.length < 2;
        const applyReason =
            !canMutate ? "You do not have permission to apply configuration"
            : siteRows.length < 2 ? "Need at least two locations"
            : undefined;

        if (activeTab === "overview") {
            if (!model.timezone) {
                actions.push({
                    id: "resolve-timezone",
                    label: "Set time zone",
                    group: "fix",
                    reason: "Required for schedules and tours",
                    onClick: () => setEditingSite(true),
                });
            }
            if (model.roomsNeedingCapacity > 0 || model.configuredCapacity == null) {
                actions.push({
                    id: "configure-capacity",
                    label: "Configure capacity",
                    group: "fix",
                    reason:
                        model.roomsNeedingCapacity > 0 ?
                            `${model.roomsNeedingCapacity} rooms need setup`
                        :   "No capacity configured yet",
                    onClick: () => navigate("rooms"),
                });
            }
            if (selectedSchedules.length === 0) {
                actions.push({
                    id: "set-schedule",
                    label: "Set weekly schedule",
                    group: "fix",
                    reason: "Hours this location operates",
                    onClick: () => navigate("schedule"),
                });
            }
            if (model.setupItems.find((item) => item.key === "tours")?.complete === false) {
                actions.push({
                    id: "fix-tours",
                    label: "Set up tour availability",
                    group: "fix",
                    reason: "Tours are not configured yet",
                    onClick: () => navigate("tours"),
                });
            }

            if (canMutate) {
                actions.push({
                    id: "add-room",
                    label: "Add room",
                    group: "manage",
                    onClick: addRoom,
                });
            }
            actions.push({
                id: "apply-to",
                label: "Apply to other locations",
                group: "manage",
                disabled: applyDisabled,
                reason: applyReason,
                onClick: () => setApplyToOpen(true),
            });
            actions.push({
                id: "edit-details",
                label: "Edit location",
                group: "manage",
                onClick: () => setEditingSite(true),
            });
            actions.push({
                id: "duplicate-location",
                label: "Duplicate location",
                group: "manage",
                disabled: true,
                reason: "Coming soon",
                onClick: () => undefined,
            });
            actions.push(
                {
                    id: "manage-rooms",
                    label: "Manage rooms",
                    group: "manage",
                    onClick: () => navigate("rooms"),
                },
                {
                    id: "manage-programs",
                    label: "Manage programs",
                    group: "manage",
                    onClick: () => navigate("programs"),
                },
            );
            return actions;
        }

        if (activeTab === "programs") {
            actions.push({
                id: "add-program",
                label: "Add program",
                group: "manage",
                disabled: !canMutate,
                reason: canMutate ? undefined : "You do not have permission to add programs",
                onClick: () => navigate("programs"),
            });
            if (effectiveProgramId) {
                actions.push({
                    id: "edit-program",
                    label: "Edit selected program",
                    group: "manage",
                    disabled: !canMutate,
                    onClick: () => navigate("programs", effectiveProgramId),
                });
            }
            actions.push({
                id: "apply-programs",
                label: "Apply programs",
                group: "manage",
                disabled: applyDisabled,
                reason: applyReason,
                onClick: () => setApplyToOpen(true),
            });
            return actions;
        }

        if (activeTab === "rooms") {
            if (canMutate) {
                actions.push({
                    id: "add-room",
                    label: "Add room",
                    group: "manage",
                    onClick: addRoom,
                });
            }
            actions.push({
                id: "configure-capacity",
                label: "Configure capacity",
                group: model.roomsNeedingCapacity > 0 || model.configuredCapacity == null ? "fix" : "manage",
                reason:
                    model.roomsNeedingCapacity > 0 ?
                        `${model.roomsNeedingCapacity} rooms need setup`
                    :   undefined,
                onClick: () => navigate("rooms", effectiveRoomId),
            });
            if (effectiveRoomId) {
                actions.push({
                    id: "adjust-room",
                    label: "Adjust selected room",
                    group: "manage",
                    onClick: () => navigate("rooms", effectiveRoomId),
                });
            }
            return actions;
        }

        if (activeTab === "schedule") {
            actions.push({
                id: "add-schedule-pattern",
                label: "Add schedule pattern",
                group: "manage",
                disabled: !canMutate,
                onClick: () => {
                    if (!canMutate) return;
                    setCreatingSchedule(true);
                    navigate("schedule");
                },
            });
            actions.push({
                id: "add-closure",
                label: "Add closure",
                group: "manage",
                disabled: true,
                reason: "Date-specific closure authoring is not available yet",
                onClick: () => undefined,
            });
            actions.push({
                id: "apply-schedule",
                label: "Apply schedule",
                group: "manage",
                disabled: applyDisabled,
                reason: applyReason,
                onClick: () => setApplyToOpen(true),
            });
            return actions;
        }

        if (activeTab === "tours") {
            actions.push({
                id: "review-availability",
                label: "Review availability",
                group: "manage",
                onClick: () => navigate("tours"),
            });
            return actions;
        }

        if (activeTab === "placement") {
            actions.push({
                id: "configure-ranking",
                label: "Configure ranking",
                group: "manage",
                onClick: () => navigate("placement"),
            });
            return actions;
        }

        if (activeTab === "access") {
            actions.push({
                id: "manage-access",
                label: "Manage access",
                group: "manage",
                onClick: () => navigate("access"),
            });
        }

        return actions;
    }, [
        activeTab,
        canMutate,
        createRoomUnit,
        effectiveProgramId,
        effectiveRoomId,
        model,
        selectedRooms.length,
        selectedSchedules.length,
        selectedSite,
        siteRows.length,
    ]);

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
                    siteLabel={model?.displayName ?? ""}
                    canMutate={canMutate}
                    onSave={patchProgramCategory}
                    programs={selectedPrograms}
                    selectedProgramId={effectiveProgramId}
                    onSelectProgram={(programId) => {
                        setSelectedProgramId(programId);
                        navigate("programs", programId);
                    }}
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
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h3 className="config-typo-workspace-title">Schedule Patterns</h3>
                                <p className="config-typo-sublabel mt-1">
                                    Reusable weekly attendance patterns offered by this location.
                                </p>
                            </div>
                            {canMutate && !creatingSchedule ?
                                <button
                                    type="button"
                                    className="rounded-md border border-[#00a283]/25 px-3 py-2 text-xs font-semibold text-[#007d68] hover:bg-[#00a283]/5"
                                    onClick={() => setCreatingSchedule(true)}
                                    data-testid="locations-schedule-add"
                                >
                                    + Add Schedule Pattern
                                </button>
                            :   null}
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
                                        {selectedSchedules.length > 0 ?
                                            selectedSchedules.map((schedule) => (
                                                <ConfigurationQueueItem
                                                    key={schedule.id}
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
                                        :   <p className="config-typo-sublabel">Set weekly hours to get started.</p>}
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
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h3 className="config-typo-workspace-title">Closures / Holidays</h3>
                                <p className="config-typo-sublabel mt-1">
                                    Full-day closures and holiday exceptions belong to this location.
                                </p>
                            </div>
                            {canMutate ?
                                <button
                                    type="button"
                                    className="rounded-md border border-alloy-forge/15 px-3 py-2 text-xs font-semibold text-alloy-midnight/45"
                                    disabled
                                    title="Date-specific closure authoring is not available in the current schedule substrate."
                                    data-testid="locations-closure-add"
                                >
                                    + Add Closure
                                </button>
                            :   null}
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
                actions={
                    canMutate && !creatingSite && selectedSite ?
                        <ConfigurationPrimaryButton
                            className="config-primary-btn--sm"
                            data-testid="locations-add-location"
                            onClick={beginAddLocation}
                        >
                            Add Location
                        </ConfigurationPrimaryButton>
                    :   null
                }
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
                : !selectedSite ?
                    <>
                        <ConfigScopeContextBar
                            mode="organization"
                            organizationLabel="Organization"
                            objectLabel="Location"
                            onModeChange={(mode) => {
                                if (mode === "object" && siteRows[0]) openLocation(siteRows[0].id);
                            }}
                            ownershipHint="Organization view — configuration health across locations"
                        />
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
                    </>
                :   <div className="grid min-h-full gap-3 xl:grid-cols-[14rem_minmax(0,1fr)]">
                        <aside className="hidden xl:block" aria-label="Location selector">
                            <ConfigurationQueue
                                title="Locations"
                                summary={`${visibleSites.length} shown`}
                                actions={
                                    <label className="flex items-center gap-1.5 text-[11px] text-alloy-midnight/55">
                                        <input
                                            type="checkbox"
                                            checked={showInactive}
                                            onChange={(event) => setShowInactive(event.target.checked)}
                                        />
                                        Inactive
                                    </label>
                                }
                                testId="locations-object-selector"
                            >
                                <button
                                    type="button"
                                    className="mb-1 w-full rounded-md px-2 py-1.5 text-left text-[11px] font-semibold text-[#007d68] hover:bg-[#00a283]/5"
                                    onClick={returnToFleet}
                                    data-testid="locations-back-to-fleet"
                                >
                                    ← All locations
                                </button>
                                <label className="sr-only" htmlFor="locations-search">
                                    Search locations
                                </label>
                                <input
                                    id="locations-search"
                                    type="search"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search locations"
                                    className="config-runtime-input"
                                />
                                {visibleSites.map((site) => (
                                    <ConfigurationQueueItem
                                        key={site.id}
                                        active={site.id === selectedId}
                                        title={String(site.label ?? "").trim() || "Untitled location"}
                                        subtitle={
                                            site.is_active === false ?
                                                "Inactive"
                                            :   [site.city, site.state].filter(Boolean).join(", ") || "Active"
                                        }
                                        onClick={() => {
                                            setSelectedId(site.id);
                                            setEditingSite(false);
                                            router.replace(locationWorkspaceHref(site.id, activeTab));
                                        }}
                                        testId={`locations-location-${site.id}`}
                                    />
                                ))}
                            </ConfigurationQueue>
                        </aside>

                        <main className="min-w-0" data-testid="locations-selected-location">
                            <div className="mb-3 xl:hidden">
                                <button
                                    type="button"
                                    className="mb-2 text-[11px] font-semibold text-[#007d68]"
                                    onClick={returnToFleet}
                                    data-testid="locations-back-to-fleet-mobile"
                                >
                                    ← All locations
                                </button>
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

                            <ConfigScopeContextBar
                                mode="object"
                                organizationLabel="Organization"
                                objectLabel={model?.displayName ?? "Location"}
                                onModeChange={(mode) => {
                                    if (mode === "organization") returnToFleet();
                                }}
                                ownershipHint="Configured at this location"
                            />

                            <ConfigObjectHeader
                                name={model?.displayName ?? "Location"}
                                status={{
                                    label: selectedSite.is_active === false ? "Inactive" : "Active",
                                    tone: selectedSite.is_active === false ? "inactive" : "active",
                                }}
                                facts={identityFacts}
                                actions={
                                    canMutate ?
                                        <button
                                            type="button"
                                            className="rounded-md border border-alloy-forge/15 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/10"
                                            onClick={() => setEditingSite(true)}
                                            data-testid="locations-edit-location"
                                        >
                                            Edit Location
                                        </button>
                                    :   null
                                }
                                testId="locations-object-header"
                            />

                            <div
                                className="mb-3 flex overflow-x-auto border-b border-alloy-forge/10"
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
                            {tabBody}
                            {selectedSite && toursKeepAlive && !editingSite ?
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
                            {selectedSite && placementKeepAlive && !editingSite ?
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
