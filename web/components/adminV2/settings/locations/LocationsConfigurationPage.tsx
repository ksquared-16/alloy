"use client";

import { useMemo, useState, type ReactNode } from "react";
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
import LocationScheduleTemplateDetailPanel from "@/components/adminV2/settings/locations/LocationScheduleTemplateDetailPanel";
import LocationSiteCreatePanel from "@/components/adminV2/settings/locations/LocationSiteCreatePanel";
import LocationSiteDetailPanel from "@/components/adminV2/settings/locations/LocationSiteDetailPanel";
import { useLocationsConfigurationSettings } from "@/components/adminV2/settings/locations/useLocationsConfigurationSettings";
import {
    buildLocationWorkspaceModel,
    LOCATION_WORKSPACE_TABS,
    locationWorkspaceHref,
    readLocationMetadataString,
    type LocationWorkspaceTab,
} from "@/lib/locations/locationWorkspaceModel";
import { formatWeekdaySelection } from "@/lib/childcareOperational/fetchOperationalEnrollment";

const LOCATIONS_SUBTITLE = "Choose a location, understand what needs attention, and manage everything it owns.";

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
                {description ? <p className="config-typo-sublabel mt-1">{description}</p> : null}
            </div>
            {children}
        </section>
    );
}

function ConcernLink({
    title,
    description,
    href,
    action,
}: {
    title: string;
    description: string;
    href: string;
    action: string;
}) {
    return (
        <WorkspaceCard title={title} description={description}>
            <a
                href={href}
                className="inline-flex rounded-md border border-alloy-forge/15 px-3 py-2 text-xs font-semibold text-[#007d68] hover:bg-[#00a283]/5"
            >
                {action}
            </a>
        </WorkspaceCard>
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
    const [activeTab, setActiveTab] = useState<LocationWorkspaceTab>(initialTab);
    const [search, setSearch] = useState("");
    const [showInactive, setShowInactive] = useState(false);
    const [selectedProgramId, setSelectedProgramId] = useState<string | null>(
        initialTab === "programs" ? initialItemId : null,
    );
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(
        initialTab === "rooms" ? initialItemId : null,
    );
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

    const effectiveProgramId =
        selectedProgramId && selectedPrograms.some((program) => program.id === selectedProgramId) ?
            selectedProgramId
        :   selectedPrograms[0]?.id ?? null;
    const effectiveRoomId =
        selectedRoomId && selectedRooms.some((room) => room.id === selectedRoomId) ?
            selectedRoomId
        :   selectedRooms[0]?.id ?? null;
    const effectiveScheduleId =
        selectedScheduleId && selectedSchedules.some((schedule) => schedule.id === selectedScheduleId) ?
            selectedScheduleId
        :   selectedSchedules[0]?.id ?? null;
    const selectedProgram = selectedPrograms.find((program) => program.id === effectiveProgramId) ?? null;
    const selectedRoom = selectedRooms.find((room) => room.id === effectiveRoomId) ?? null;
    const selectedSchedule = selectedSchedules.find((schedule) => schedule.id === effectiveScheduleId) ?? null;
    const model =
        selectedSite ?
            buildLocationWorkspaceModel({
                site: selectedSite,
                rooms: selectedRooms,
                programs: selectedPrograms,
                schedules: selectedSchedules,
            })
        :   null;

    const navigate = (tab: LocationWorkspaceTab, itemId?: string | null) => {
        if (!selectedSite) return;
        setActiveTab(tab);
        setEditingSite(false);
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
            <div className="space-y-4" data-testid="locations-overview">
                <WorkspaceCard
                    title="At a glance"
                    description="Utilization comes first; inventory stays secondary."
                    testId="locations-at-a-glance"
                >
                    <button
                        type="button"
                        className="w-full rounded-xl border border-alloy-forge/10 bg-[#00a283]/[0.035] p-4 text-left"
                        onClick={() => navigate("rooms")}
                    >
                        <span className="config-typo-field-label">Configured capacity</span>
                        <span className="mt-1 block text-xl font-semibold text-alloy-midnight">
                            {model.configuredCapacity == null ?
                                "Not set up yet"
                            :   `${model.configuredCapacity} children`}
                        </span>
                        <span className="config-typo-sublabel mt-1 block">
                            {model.roomsNeedingCapacity > 0 ?
                                `${model.roomsNeedingCapacity} ${model.roomsNeedingCapacity === 1 ? "room needs" : "rooms need"} setup before the location total is complete.`
                            : model.configuredCapacity == null ?
                                "Add room capacity to make utilization visible."
                            :   "Enrollment and open seats need current enrollment data; unknown values are not shown as zero."}
                        </span>
                    </button>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <button
                            type="button"
                            className="rounded-lg border border-alloy-forge/10 p-3 text-left hover:bg-alloy-stone/10"
                            onClick={() => navigate("programs")}
                        >
                            <span className="text-lg font-semibold text-alloy-midnight">{model.activeProgramCount}</span>
                            <span className="config-typo-sublabel ml-2">active programs</span>
                        </button>
                        <button
                            type="button"
                            className="rounded-lg border border-alloy-forge/10 p-3 text-left hover:bg-alloy-stone/10"
                            onClick={() => navigate("rooms")}
                        >
                            <span className="text-lg font-semibold text-alloy-midnight">{model.activeRoomCount}</span>
                            <span className="config-typo-sublabel ml-2">active rooms</span>
                        </button>
                    </div>
                </WorkspaceCard>

                <WorkspaceCard
                    title="Attention"
                    description="What is incomplete or worth improving right now."
                    testId="locations-attention"
                >
                    <ul className="divide-y divide-alloy-forge/10">
                        {model.attention.map((item) => (
                            <li key={item.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                                <span
                                    className={
                                        item.grade === "fix" ? "text-amber-700"
                                        : item.grade === "improve" ? "text-blue-700"
                                        : "text-[#007d68]"
                                    }
                                    aria-hidden="true"
                                >
                                    {item.grade === "fix" ? "⚠" : item.grade === "improve" ? "ⓘ" : "✓"}
                                </span>
                                <span className="min-w-0 flex-1 text-sm text-alloy-midnight/80">{item.label}</span>
                                {item.grade !== "good" ?
                                    <button
                                        type="button"
                                        className="shrink-0 text-xs font-semibold text-[#007d68]"
                                        onClick={() => showSetupDestination(item.tab)}
                                    >
                                        View
                                    </button>
                                :   null}
                            </li>
                        ))}
                    </ul>
                </WorkspaceCard>

                <div className="grid gap-4 lg:grid-cols-2">
                    <WorkspaceCard title="Operating schedule" description="Weekly hours for this location.">
                        <p className="text-sm font-medium text-alloy-midnight/80">
                            {selectedSchedules.length > 0 ?
                                formatWeekdaySelection(selectedSchedules[0]!.weekdays)
                            :   "Not set up yet"}
                        </p>
                        <button
                            type="button"
                            className="mt-3 text-xs font-semibold text-[#007d68]"
                            onClick={() => navigate("schedule")}
                        >
                            View schedule
                        </button>
                    </WorkspaceCard>
                    <WorkspaceCard title="Closed days & exceptions" description="Schedule changes belong together.">
                        <p className="text-sm text-alloy-midnight/70">
                            Review location schedule patterns before adding one-off changes.
                        </p>
                        <button
                            type="button"
                            className="mt-3 text-xs font-semibold text-[#007d68]"
                            onClick={() => navigate("schedule")}
                        >
                            Manage schedule
                        </button>
                    </WorkspaceCard>
                </div>
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
                <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]" data-testid="locations-programs">
                    <ConfigurationQueue title="Programs" summary="Offered at this location">
                        {selectedPrograms.length > 0 ?
                            selectedPrograms.map((program) => (
                                <ConfigurationQueueItem
                                    key={program.id}
                                    active={program.id === effectiveProgramId}
                                    title={program.label}
                                    subtitle={program.is_active === false ? "Inactive" : "Active"}
                                    onClick={() => {
                                        setSelectedProgramId(program.id);
                                        navigate("programs", program.id);
                                    }}
                                    testId={`locations-program-${program.id}`}
                                />
                            ))
                        :   <p className="config-typo-sublabel">
                                This location does not offer any programs yet.
                            </p>}
                    </ConfigurationQueue>
                    <LocationProgramDetailPanel
                        program={selectedProgram}
                        siteLabel={model?.displayName ?? ""}
                        canMutate={canMutate}
                        onSave={patchProgramCategory}
                    />
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
                        :   <p className="config-typo-sublabel">
                                No rooms yet. Add a room to begin capacity setup.
                            </p>}
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
                <div className="space-y-4" data-testid="locations-schedule">
                    <WorkspaceCard
                        title="Weekly hours, closed days & exceptions"
                        description="This location owns its schedule. Rooms only show a difference when they keep their own hours."
                    >
                        <p className="text-sm text-alloy-midnight/70">
                            Manage recurring schedule patterns below. Unknown hours remain “not set up yet” until saved.
                        </p>
                    </WorkspaceCard>
                    <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
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
                            :   <p className="config-typo-sublabel">
                                    Set weekly hours to get started.
                                </p>}
                        </ConfigurationQueue>
                        <LocationScheduleTemplateDetailPanel
                            pattern={selectedSchedule}
                            siteLabel={siteLabelById.get(selectedSite.id) ?? model?.displayName ?? ""}
                            canMutate={canMutate}
                            onUpdated={(row) => {
                                setSchedulePatterns((prev) => prev.map((p) => (p.id === row.id ? row : p)));
                            }}
                            onError={setError}
                        />
                    </div>
                </div>
            );
        }
        if (activeTab === "tours") {
            return (
                <ConcernLink
                    title="Tour availability"
                    description="Set when families can visit, then manage booking rules in the existing tour availability settings."
                    href="/settings/tours/availability"
                    action="Open tour availability"
                />
            );
        }
        if (activeTab === "placement") {
            return (
                <ConcernLink
                    title="Placement"
                    description="Choose how children are prioritized and which rooms participate."
                    href="/settings/placement-priority"
                    action="Open placement priority"
                />
            );
        }
        if (activeTab === "communications") {
            return (
                <ConcernLink
                    title="Communications"
                    description="Manage sender identity and the communication defaults families receive."
                    href="/settings/communications"
                    action="Open communications settings"
                />
            );
        }
        return (
            <ConcernLink
                title="Access"
                description="Manage the team members and roles that can operate this location."
                href="/settings/users-roles"
                action="Open users & roles"
            />
        );
    })();

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="locations-configuration-page">
            <ConfigurationContext
                title="Locations"
                subtitle={LOCATIONS_SUBTITLE}
                actions={
                    canMutate && !creatingSite ?
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
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
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
                        onCancel={() => setCreatingSite(false)}
                        onCreate={async (input) => {
                            const newId = await createSiteLocation(input);
                            setCreatingSite(false);
                            setSelectedId(newId);
                            setActiveTab("overview");
                            router.replace(locationWorkspaceHref(newId));
                            return newId;
                        }}
                    />
                : !selectedSite ?
                    <ConfigurationEmptyState
                        testId="locations-site-workspace-empty"
                        title="No location selected"
                        description="Choose a location or add one to begin."
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
                                            : [site.city, site.state].filter(Boolean).join(", ") || "Active"
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
                                        ["Add a room", "rooms"],
                                        ["Offer a program", "programs"],
                                        ["Add a closed day", "schedule"],
                                    ].map(([label, tab]) => (
                                        <button
                                            key={tab}
                                            type="button"
                                            className="block w-full rounded-md px-2 py-2 text-left text-xs font-semibold text-[#007d68] hover:bg-[#00a283]/5"
                                            onClick={() => navigate(tab as LocationWorkspaceTab)}
                                        >
                                            + {label}
                                        </button>
                                    ))}
                                </div>
                            </WorkspaceCard>

                            <WorkspaceCard title="Setup progress" testId="locations-setup-progress">
                                {model?.setupComplete ?
                                    <p className="text-sm font-semibold text-[#007d68]">Setup complete ✓</p>
                                :   <>
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="grid h-11 w-11 place-items-center rounded-full text-[11px] font-bold text-[#007d68]"
                                                style={{
                                                    background: `conic-gradient(#00a283 ${model?.setupPercent ?? 0}%, rgba(89, 103, 139, 0.12) 0)`,
                                                }}
                                                aria-label={`${model?.setupPercent ?? 0}% complete`}
                                            >
                                                <span className="grid h-8 w-8 place-items-center rounded-full bg-white">
                                                    {model?.setupPercent ?? 0}%
                                                </span>
                                            </div>
                                            <p className="config-typo-sublabel">Finish the location basics.</p>
                                        </div>
                                        <ul className="mt-3 space-y-1">
                                            {model?.setupItems.map((item) => (
                                                <li key={item.key}>
                                                    <button
                                                        type="button"
                                                        className="flex w-full items-center justify-between rounded px-1 py-1 text-xs hover:bg-alloy-stone/10"
                                                        onClick={() => showSetupDestination(item.tab)}
                                                    >
                                                        <span className="text-alloy-midnight/65">{item.label}</span>
                                                        <span
                                                            className={
                                                                item.complete ? "text-[#007d68]" : "text-alloy-midnight/35"
                                                            }
                                                        >
                                                            {item.complete == null ? "Review" : item.complete ? "✓" : "○"}
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                }
                            </WorkspaceCard>
                        </aside>
                    </div>
                }
            </ConfigurationShell>
        </div>
    );
}
