"use client";

import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
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
import LocationSiteDetailPanel from "@/components/adminV2/settings/locations/LocationSiteDetailPanel";
import {
    LOCATION_CONFIG_SECTIONS,
    useLocationsConfigurationSettings,
} from "@/components/adminV2/settings/locations/useLocationsConfigurationSettings";

const LOCATIONS_SUBTITLE = "Configure campuses, programs, classrooms, and scheduling resources.";

function sectionListTitle(section: (typeof LOCATION_CONFIG_SECTIONS)[number]["key"]): string {
    if (section === "locations") return "Locations";
    if (section === "programs") return "Programs";
    if (section === "rooms") return "Rooms";
    return "Schedule Templates";
}

function sectionEmptyListCopy(section: (typeof LOCATION_CONFIG_SECTIONS)[number]["key"]): string {
    if (section === "locations") return "No locations yet. Add a campus to get started.";
    if (section === "programs") return "No programs yet. Programs are configured per location.";
    if (section === "rooms") return "No rooms yet. Add classrooms under a location.";
    return "No schedule templates yet.";
}

export default function LocationsConfigurationPage() {
    const { canMutate } = useAdminAuth();
    const { openDrawer } = useAdminDrawer();
    const {
        section,
        setSection,
        selectedId,
        setSelectedId,
        loading,
        error,
        setError,
        listItems,
        siteLabelById,
        selectedSite,
        selectedProgram,
        selectedRoom,
        selectedSchedulePattern,
        patchLocation,
        patchProgramCategory,
        roomCapacitySummaryForSite,
        programOptionsForSite,
        ageUnitSelectOptions,
        setSchedulePatterns,
    } = useLocationsConfigurationSettings();

    const contextActions =
        canMutate ?
            <ConfigurationPrimaryButton
                className="config-primary-btn--sm"
                data-testid="locations-add-location"
                onClick={() => openDrawer({ type: "locations", id: "new" })}
            >
                Add Location
            </ConfigurationPrimaryButton>
        :   null;

    const sectionQueue = (
        <ConfigurationQueue testId="locations-section-queue" title="Sections">
            {LOCATION_CONFIG_SECTIONS.map((s) => (
                <ConfigurationQueueItem
                    key={s.key}
                    active={s.key === section}
                    title={s.label}
                    onClick={() => {
                        setSection(s.key);
                        setSelectedId(null);
                    }}
                    testId={`locations-section-${s.key}`}
                />
            ))}
        </ConfigurationQueue>
    );

    const itemList = (
        <ConfigurationQueue testId="locations-item-queue" title={sectionListTitle(section)}>
            {listItems.length === 0 ?
                <p className="config-typo-sublabel">{sectionEmptyListCopy(section)}</p>
            :   listItems.map((item) => (
                    <ConfigurationQueueItem
                        key={item.id}
                        active={item.id === selectedId}
                        title={item.title}
                        subtitle={item.subtitle}
                        onClick={() => setSelectedId(item.id)}
                        testId={`locations-item-${item.id}`}
                    />
                ))
            }
        </ConfigurationQueue>
    );

    const workspace = (() => {
        if (loading) {
            return (
                <ConfigurationEmptyState
                    testId="locations-loading"
                    title="Loading locations"
                    description="Fetching campuses, programs, rooms, and schedule templates."
                />
            );
        }
        if (section === "locations") {
            return (
                <LocationSiteDetailPanel
                    site={selectedSite}
                    capacitySummary={selectedSite ? roomCapacitySummaryForSite(selectedSite.id) : 0}
                    canMutate={canMutate}
                    onSave={patchLocation}
                />
            );
        }
        if (section === "programs") {
            return (
                <LocationProgramDetailPanel
                    program={selectedProgram}
                    siteLabel={
                        selectedProgram ?
                            siteLabelById.get(selectedProgram.location_id) ?? "Unknown location"
                        :   ""
                    }
                    canMutate={canMutate}
                    onSave={patchProgramCategory}
                />
            );
        }
        if (section === "rooms") {
            const parentSiteId = selectedRoom?.parent_location_id ?? "";
            return (
                <LocationRoomDetailPanel
                    room={selectedRoom}
                    siteLabel={parentSiteId ? siteLabelById.get(parentSiteId) ?? "Unknown location" : ""}
                    programOptions={parentSiteId ? programOptionsForSite(parentSiteId) : []}
                    ageUnitSelectOptions={ageUnitSelectOptions}
                    canMutate={canMutate}
                    onSave={patchLocation}
                />
            );
        }
        return (
            <LocationScheduleTemplateDetailPanel
                pattern={selectedSchedulePattern}
                siteLabel={
                    selectedSchedulePattern ?
                        siteLabelById.get(selectedSchedulePattern.site_location_id) ?? "Unknown location"
                    :   ""
                }
                canMutate={canMutate}
                onUpdated={(row) => {
                    setSchedulePatterns((prev) => prev.map((p) => (p.id === row.id ? row : p)));
                }}
                onError={setError}
            />
        );
    })();

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="locations-configuration-page">
            <ConfigurationContext
                title="Locations"
                subtitle={LOCATIONS_SUBTITLE}
                actions={contextActions}
                testId="locations-configuration-context"
            />

            {error ?
                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            <ConfigurationShell testId="locations-configuration-shell" queueColumn={sectionQueue} listColumn={itemList}>
                {workspace}
            </ConfigurationShell>
        </div>
    );
}
