"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { useLocationsConfigurationSettings } from "@/components/adminV2/settings/locations/useLocationsConfigurationSettings";
import LocationsFleetLanding from "@/components/adminV2/settings/locations/LocationsFleetLanding";
import { canonicalLocationSettingsHref } from "@/lib/admin/canonicalLocationSettingsRoutes";
import {
    buildLocationWorkspaceModel,
    buildLocationProgramOperationalSummaries,
    buildLocationsFleetModel,
    LOCATION_WORKSPACE_TABS,
    locationsFleetHref,
    locationWorkspaceHref,
    readLocationMetadataString,
    type LocationWorkspaceTab,
} from "@/lib/locations/locationWorkspaceModel";
import { formatWeekdaySelection } from "@/lib/childcareOperational/fetchOperationalEnrollment";

function WorkspaceCard({
    title,
    description,
    children,
    testId,
}: {
    title: string;
    description?: string;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <section className="process-config-setup-card p-4" data-testid={testId}>
            <div className="mb-3">
                <h2 className="config-typo-workspace-title">{title}</h2>
                {description ?
                    <p className="config-typo-sublabel mt-1">{description}</p>
                :   null}
            </div>
            {children}
        </section>
    );
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
    const [showSetupDetails, setShowSetupDetails] = useState(false);
    const [ownedConcernSetupByLocation, setOwnedConcernSetupByLocation] = useState<
        Record<string, Partial<Record<"tours" | "placement" | "access", boolean>>>
    >({});
    const [activeTab, setActiveTab] = useState<LocationWorkspaceTab>(initialTab);
    const [search, setSearch] = useState("");
    const [showInactive, setShowInactive] = useState(false);
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(initialTab === "rooms" ? initialItemId : null);
    const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(
        initialTab === "schedule" ? initialItemId : null,
    );
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
    const effectiveScheduleId =
        selectedScheduleId && selectedSchedules.some((schedule) => schedule.id === selectedScheduleId) ?
            selectedScheduleId
        :   (selectedSchedules[0]?.id ?? null);
    const selectedRoom = selectedRooms.find((room) => room.id === effectiveRoomId) ?? null;
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

    const overview =
        selectedSite && model ?
            <div className="space-y-7" data-testid="locations-overview">
                <section className="space-y-3" data-testid="locations-overview-health">
                    <div>
                        <p className="config-typo-meta uppercase tracking-[0.16em]">Health</p>
                        <h2 className="mt-1 text-base font-medium text-alloy-midnight">What needs you now</h2>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <WorkspaceCard
                            title="Attention"
                            description="Current issues and improvements, ranked by impact."
                            testId="locations-attention"
                        >
                            <ul className="divide-y divide-alloy-forge/10">
                                {model.attention.map((item) => (
                                    <li key={item.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                                        <span
                                            className={
                                                item.grade === "fix" ? "text-amber-700"
                                                : item.grade === "improve" ?
                                                    "text-blue-700"
                                                :   "text-[#007d68]"
                                            }
                                            aria-hidden="true"
                                        >
                                            {item.grade === "fix" ?
                                                "⚠"
                                            : item.grade === "improve" ?
                                                "ⓘ"
                                            :   "✓"}
                                        </span>
                                        <span className="min-w-0 flex-1 text-sm text-alloy-midnight/80">
                                            {item.label}
                                        </span>
                                        {item.grade !== "good" ?
                                            <button
                                                type="button"
                                                className="shrink-0 text-xs font-medium text-[#007d68]"
                                                onClick={() => showSetupDestination(item.tab)}
                                            >
                                                Resolve
                                            </button>
                                        :   null}
                                    </li>
                                ))}
                            </ul>
                        </WorkspaceCard>
                        <WorkspaceCard
                            title="Setup progress"
                            description="Operational readiness, not a mechanical checklist."
                            testId="locations-setup-progress"
                        >
                            <div className="flex items-end gap-4">
                                <p className="text-3xl font-medium tracking-tight text-alloy-midnight">
                                    {model.setupPercent}%
                                </p>
                                <div className="pb-0.5 text-xs">
                                    <p className="font-medium text-amber-700">{model.criticalCount} Critical</p>
                                    <p className="mt-0.5 text-alloy-midnight/50">
                                        {model.recommendedCount} Recommended
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-alloy-forge/10">
                                <div
                                    className="h-full rounded-full bg-[#00a283]"
                                    style={{ width: `${model.setupPercent}%` }}
                                />
                            </div>
                            {model.setupComplete ?
                                <p className="config-typo-sublabel mt-3 text-[#007d68]">Setup complete ✓</p>
                            :   <button
                                    type="button"
                                    className="mt-3 text-xs font-medium text-[#007d68]"
                                    onClick={() => setShowSetupDetails((current) => !current)}
                                    aria-expanded={showSetupDetails}
                                >
                                    {showSetupDetails ? "Hide setup details" : "Review setup"}
                                </button>
                            }
                            {showSetupDetails ?
                                <ul className="mt-3 divide-y divide-alloy-forge/10 border-t border-alloy-forge/10">
                                    {model.setupItems.map((item) => (
                                        <li key={item.key}>
                                            <button
                                                type="button"
                                                className="flex w-full items-center justify-between py-2 text-xs"
                                                onClick={() => showSetupDestination(item.tab)}
                                            >
                                                <span className="text-alloy-midnight/65">{item.label}</span>
                                                <span
                                                    className={
                                                        item.complete ? "text-[#007d68]" : "text-alloy-midnight/40"
                                                    }
                                                >
                                                    {item.complete ?
                                                        "Ready"
                                                    : item.complete == null ?
                                                        "Review"
                                                    :   "Finish"}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            :   null}
                        </WorkspaceCard>
                    </div>
                </section>

                <section className="space-y-3" data-testid="locations-overview-capacity">
                    <div>
                        <p className="config-typo-meta uppercase tracking-[0.16em]">Capacity</p>
                        <h2 className="mt-1 text-base font-medium text-alloy-midnight">What this location can serve</h2>
                    </div>
                    <WorkspaceCard
                        title="Capacity summary"
                        description="Room capacity is the operational source; inventory follows."
                        testId="locations-at-a-glance"
                    >
                        <button
                            type="button"
                            className="w-full rounded-xl border border-alloy-forge/10 bg-[#00a283]/[0.035] p-4 text-left"
                            onClick={() => navigate("rooms")}
                        >
                            <span className="config-typo-field-label">Configured capacity</span>
                            <span className="mt-1 block text-2xl font-medium tracking-tight text-alloy-midnight">
                                {model.configuredCapacity == null ?
                                    "Not set up yet"
                                :   `${model.configuredCapacity} children`}
                            </span>
                            <span className="config-typo-sublabel mt-1 block">
                                {model.roomsNeedingCapacity > 0 ?
                                    `${model.roomsNeedingCapacity} ${model.roomsNeedingCapacity === 1 ? "room needs" : "rooms need"} capacity setup.`
                                :   "Review the rooms and staffing thresholds behind this total."}
                            </span>
                        </button>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {[
                                {
                                    label: "Programs",
                                    value: model.activeProgramCount,
                                    tab: "programs" as const,
                                },
                                {
                                    label: "Rooms",
                                    value: model.activeRoomCount,
                                    tab: "rooms" as const,
                                },
                            ].map((item) => (
                                <button
                                    key={item.label}
                                    type="button"
                                    className="rounded-lg border border-alloy-forge/10 p-3 text-left hover:bg-alloy-stone/10"
                                    onClick={() => navigate(item.tab)}
                                >
                                    <span className="text-lg font-medium text-alloy-midnight">{item.value}</span>
                                    <span className="config-typo-sublabel ml-2">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    </WorkspaceCard>
                </section>

                <section className="space-y-3" data-testid="locations-overview-operations">
                    <div>
                        <p className="config-typo-meta uppercase tracking-[0.16em]">Operations</p>
                        <h2 className="mt-1 text-base font-medium text-alloy-midnight">How this location runs</h2>
                    </div>
                    <div className="process-config-setup-card divide-y divide-alloy-forge/10 px-4">
                        {[
                            {
                                label: "Schedule",
                                value:
                                    selectedSchedules.length > 0 ?
                                        formatWeekdaySelection(selectedSchedules[0]!.weekdays)
                                    :   "Not set up yet",
                                tab: "schedule" as const,
                            },
                            {
                                label: "Tours",
                                value: "Availability and booking rules",
                                tab: "tours" as const,
                            },
                            {
                                label: "Placement",
                                value: `${model.activeRoomCount} active rooms`,
                                tab: "placement" as const,
                            },
                            {
                                label: "Access",
                                value: "Team and location permissions",
                                tab: "access" as const,
                            },
                        ].map((item) => (
                            <button
                                key={item.label}
                                type="button"
                                className="flex w-full items-center justify-between gap-4 py-3 text-left"
                                onClick={() => navigate(item.tab)}
                            >
                                <span className="text-sm font-medium text-alloy-midnight/80">{item.label}</span>
                                <span className="config-typo-sublabel text-right">{item.value} →</span>
                            </button>
                        ))}
                    </div>
                </section>
            </div>
        :   null;

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
        if (activeTab === "overview") return overview;
        if (activeTab === "programs") {
            return (
                <div className="space-y-2" data-testid="locations-programs">
                    {selectedPrograms.length > 0 ?
                        <div className="space-y-2">
                            {selectedPrograms.map((program) => (
                                <LocationProgramDetailPanel
                                    key={program.id}
                                    program={program}
                                    summary={programSummaries.find((summary) => summary.id === program.id) ?? null}
                                    siteLabel={model?.displayName ?? ""}
                                    canMutate={canMutate}
                                    onSave={patchProgramCategory}
                                />
                            ))}
                        </div>
                    :   <ConfigurationEmptyState
                            title="No programs offered yet"
                            description="Offer a program to connect rooms, age ranges, and capacity at this location."
                        />
                    }
                </div>
            );
        }
        if (activeTab === "rooms") {
            return (
                <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]" data-testid="locations-rooms">
                    <ConfigurationQueue title="Rooms" summary="Capacity and ratios live on each room">
                        {selectedRooms.length > 0 ?
                            selectedRooms.map((room) => (
                                <ConfigurationQueueItem
                                    key={room.id}
                                    active={room.id === effectiveRoomId}
                                    title={String(room.label ?? "").trim() || "Untitled room"}
                                    subtitle={
                                        readLocationMetadataString(room.metadata, "capacity") ?
                                            `${readLocationMetadataString(room.metadata, "capacity")} children`
                                        :   "Needs capacity setup"
                                    }
                                    onClick={() => {
                                        setSelectedRoomId(room.id);
                                        navigate("rooms", room.id);
                                    }}
                                    testId={`locations-room-${room.id}`}
                                />
                            ))
                        :   <p className="config-typo-sublabel">No rooms yet. Add a room to begin capacity setup.</p>}
                    </ConfigurationQueue>
                    <LocationRoomDetailPanel
                        room={selectedRoom}
                        siteLabel={model?.displayName ?? ""}
                        programOptions={programOptionsForSite(selectedSite.id)}
                        ageUnitSelectOptions={ageUnitSelectOptions}
                        canMutate={canMutate}
                        onSave={patchLocation}
                    />
                </div>
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
            return (
                <LocationToursPanel
                    key={selectedSite.id}
                    locationId={selectedSite.id}
                    locationLabel={model?.displayName ?? ""}
                />
            );
        }
        if (activeTab === "placement") {
            return (
                <LocationPlacementPanel
                    key={selectedSite.id}
                    rooms={selectedRooms}
                    onReviewRooms={() => navigate("rooms")}
                    canMutate={canMutate}
                />
            );
        }
        return <LocationAccessPanel key={selectedSite.id} locationId={selectedSite.id} />;
    })();

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="locations-configuration-page">
            <ConfigurationContext
                title="Locations"
                actions={
                    canMutate && !creatingSite && selectedSite ?
                        <ConfigurationPrimaryButton
                            className="config-primary-btn--sm"
                            data-testid="locations-add-location"
                            onClick={() => {
                                setCreatingSite(true);
                                setEditingSite(false);
                                setError(null);
                            }}
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
                    <LocationsFleetLanding
                        fleet={fleet}
                        showInactive={showInactive}
                        onShowInactiveChange={setShowInactive}
                        search={search}
                        onSearchChange={setSearch}
                        onOpenLocation={(locationId) => openLocation(locationId)}
                        onAddLocation={() => {
                            setCreatingSite(true);
                            setEditingSite(false);
                            setError(null);
                        }}
                        canMutate={canMutate}
                    />
                :   <div className="grid min-h-full gap-4 xl:grid-cols-[15rem_minmax(0,1fr)_14rem]">
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
                            <div className="mb-4 xl:hidden">
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

                            <header className="mb-4 border-b border-alloy-forge/10 pb-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h1 className="text-2xl font-semibold tracking-tight text-alloy-midnight">
                                                {model?.displayName}
                                            </h1>
                                            <span
                                                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                                    selectedSite.is_active === false ?
                                                        "border-alloy-forge/15 bg-alloy-stone/15 text-alloy-midnight/55"
                                                    :   "border-[#00a283]/25 bg-[#00a283]/10 text-[#007d68]"
                                                }`}
                                            >
                                                {selectedSite.is_active === false ? "○ Inactive" : "● Active"}
                                            </span>
                                        </div>
                                        <p className="config-typo-sublabel mt-1">
                                            {model?.address ?? "Address not set up yet"}
                                            {" · "}
                                            {model?.phone ?? "Phone not set up yet"}
                                            {" · "}
                                            {model?.timezone ?? "Time zone not set up yet"}
                                        </p>
                                    </div>
                                    {canMutate ?
                                        <button
                                            type="button"
                                            className="rounded-md border border-alloy-forge/15 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/10"
                                            onClick={() => setEditingSite(true)}
                                            data-testid="locations-edit-location"
                                        >
                                            Edit Location
                                        </button>
                                    :   null}
                                </div>
                            </header>

                            <div
                                className="mb-4 flex overflow-x-auto border-b border-alloy-forge/10"
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
                        </main>

                        <aside className="space-y-4" aria-label="Location actions and setup">
                            <WorkspaceCard title="Quick actions">
                                <div className="space-y-1">
                                    {[
                                        [
                                            model?.roomsNeedingCapacity || model?.configuredCapacity == null ?
                                                "Configure Capacity"
                                            :   "Review Capacity",
                                            "rooms",
                                        ],
                                        [model?.timezone ? "Edit Location Details" : "Resolve Time Zone", "general"],
                                        ["Create Tour", "tours"],
                                    ].map(([label, tab]) => (
                                        <button
                                            key={`${tab}-${label}`}
                                            type="button"
                                            className="block w-full rounded-md px-2 py-2 text-left text-xs font-medium text-[#007d68] hover:bg-[#00a283]/5"
                                            onClick={() =>
                                                showSetupDestination(tab as LocationWorkspaceTab | "general")
                                            }
                                        >
                                            {label} →
                                        </button>
                                    ))}
                                </div>
                            </WorkspaceCard>
                        </aside>
                    </div>
                }
            </ConfigurationShell>
        </div>
    );
}
