"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    canonicalLocationSettingsHref,
    LOCATION_SETTINGS_PATH,
} from "@/lib/admin/canonicalLocationSettingsRoutes";
import {
    ConfigurationContext,
    ConfigurationEmptyState,
    ConfigurationPrimaryButton,
    ConfigurationQueue,
    ConfigurationQueueItem,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import LocationOperationalRulesPanel from "@/components/adminV2/settings/locations/LocationOperationalRulesPanel";
import LocationProgramDetailPanel from "@/components/adminV2/settings/locations/LocationProgramDetailPanel";
import LocationRoomDetailPanel from "@/components/adminV2/settings/locations/LocationRoomDetailPanel";
import LocationScheduleTemplateDetailPanel from "@/components/adminV2/settings/locations/LocationScheduleTemplateDetailPanel";
import LocationSiteCreatePanel from "@/components/adminV2/settings/locations/LocationSiteCreatePanel";
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
    if (section === "operational_rules") return "Operational Rules";
    return "Schedule Templates";
}

function sectionEmptyListCopy(section: (typeof LOCATION_CONFIG_SECTIONS)[number]["key"]): string {
    if (section === "locations") return "No locations yet. Add a campus to get started.";
    if (section === "programs") return "No programs yet. Programs are configured per location.";
    if (section === "rooms") return "No rooms yet. Add classrooms under a location.";
    if (section === "operational_rules") return "Operational rules are shown in the workspace.";
    return "No schedule templates yet.";
}

export default function LocationsConfigurationPage({
    initialLocationId = null,
}: {
    initialLocationId?: string | null;
}) {
    const router = useRouter();
    const { canMutate } = useAdminAuth();
    const [creatingSite, setCreatingSite] = useState(false);
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
        createSiteLocation,
        patchLocation,
        patchProgramCategory,
        roomCapacitySummaryForSite,
        programOptionsForSite,
        ageUnitSelectOptions,
        setSchedulePatterns,
    } = useLocationsConfigurationSettings({ initialLocationId });

    const contextActions =
        canMutate && section === "locations" && !creatingSite ?
            <ConfigurationPrimaryButton
                className="config-primary-btn--sm"
                data-testid="locations-add-location"
                onClick={() => {
                    setCreatingSite(true);
                    setError(null);
                }}
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
                        setCreatingSite(false);
                        if (s.key !== "locations") {
                            router.replace(LOCATION_SETTINGS_PATH);
                        }
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
                        active={item.id === selectedId && !creatingSite}
                        title={item.title}
                        subtitle={item.subtitle}
                        onClick={() => {
                            setCreatingSite(false);
                            setSelectedId(item.id);
                            if (section === "locations") {
                                router.replace(canonicalLocationSettingsHref(item.id));
                            }
                        }}
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
        if (section === "locations" && creatingSite) {
            return (
                <LocationSiteCreatePanel
                    canMutate={canMutate}
                    onCancel={() => setCreatingSite(false)}
                    onCreate={async (input) => {
                        const newId = await createSiteLocation(input);
                        setCreatingSite(false);
                        setSelectedId(newId);
                        router.replace(canonicalLocationSettingsHref(newId));
                        return newId;
                    }}
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
        if (section === "operational_rules") {
            return <LocationOperationalRulesPanel siteLabelById={siteLabelById} canMutate={canMutate} />;
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

            <ConfigurationShell
                testId="locations-configuration-shell"
                queueColumn={sectionQueue}
                listColumn={section === "operational_rules" ? undefined : itemList}
            >
                {workspace}
            </ConfigurationShell>
        </div>
    );
}
