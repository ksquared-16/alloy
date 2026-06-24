"use client";

import {
    resolveActiveProgramCategoriesForSite,
    type LocationProgramCategoryRow,
} from "@/lib/locations/locationProgramCategories";
import LocationProgramCategoriesSettingsPanel from "@/components/adminV2/settings/LocationProgramCategoriesSettingsPanel";
import LocationSchedulePatternsSettingsPanel from "@/components/adminV2/settings/LocationSchedulePatternsSettingsPanel";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

function roomLabel(row: LocationHierarchyRow): string {
    return (row.label ?? "Room").trim() || "Room";
}

type SiteRow = { id: string; label?: string | null };

type Props = {
    site: SiteRow;
    roomRows: LocationHierarchyRow[];
    categoriesBySite: Map<string, LocationProgramCategoryRow[]>;
    programCategories: LocationProgramCategoryRow[];
    onCategoriesChange: (next: LocationProgramCategoryRow[]) => void;
    onError: (message: string) => void;
    onOpenSite: (siteId: string) => void;
    onOpenRoom: (roomId: string) => void;
    inputClass: string;
};

function OfferingList({ items, empty }: { items: string[]; empty: string }) {
    if (!items.length) {
        return <p className="text-[11px] text-alloy-midnight/50">{empty}</p>;
    }
    return (
        <ul className="flex flex-wrap gap-1.5">
            {items.map((label) => (
                <li
                    key={label}
                    className="rounded-md border border-alloy-forge/12 bg-alloy-stone/[0.04] px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/80"
                >
                    {label}
                </li>
            ))}
        </ul>
    );
}

/** Site-centric configuration workspace — Programs, Rooms, Schedules. */
export default function LocationSiteConfigurationWorkspace({
    site,
    roomRows,
    categoriesBySite,
    programCategories,
    onCategoriesChange,
    onError,
    onOpenSite,
    onOpenRoom,
    inputClass,
}: Props) {
    const siteLabel = (site.label ?? "").trim() || "Untitled site";
    const programs = resolveActiveProgramCategoriesForSite(
        categoriesBySite.get(site.id) ?? [],
        site.id
    ).map((c) => c.label);

    const activeRooms = roomRows.filter((r) => r.is_active !== false);
    const rooms = activeRooms.map((r) => roomLabel(r)).filter(Boolean);

    return (
        <div className="space-y-4" data-testid="location-site-configuration-workspace" data-site-id={site.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-alloy-midnight">{siteLabel}</h2>
                <button
                    type="button"
                    onClick={() => onOpenSite(site.id)}
                    className="text-xs font-medium text-alloy-pine hover:underline"
                >
                    Open site details
                </button>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
                <section
                    className="rounded-xl border border-alloy-forge/12 bg-white/90 p-3.5 shadow-sm"
                    data-testid="location-site-programs"
                >
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine">Programs</h3>
                    <p className="mt-1 text-[11px] text-alloy-midnight/55">Program offerings for this location.</p>
                    <div className="mt-2">
                        <OfferingList items={programs} empty="No programs yet — add below." />
                    </div>
                </section>

                <section
                    className="rounded-xl border border-alloy-forge/12 bg-white/90 p-3.5 shadow-sm"
                    data-testid="location-site-rooms"
                >
                    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine">Rooms</h3>
                    <p className="mt-1 text-[11px] text-alloy-midnight/55">Classrooms under this site.</p>
                    <div className="mt-2">
                        <OfferingList items={rooms} empty="No rooms yet — add in room table below." />
                    </div>
                    {rooms.length > 0 ?
                        <ul className="mt-2 space-y-0.5">
                            {activeRooms.slice(0, 6).map((r) => (
                                    <li key={r.id}>
                                        <button
                                            type="button"
                                            onClick={() => onOpenRoom(r.id)}
                                            className="text-[11px] text-alloy-blue hover:underline"
                                        >
                                            Edit {roomLabel(r)}
                                        </button>
                                    </li>
                                ))}
                        </ul>
                    :   null}
                </section>
            </div>

            <section className="rounded-xl border border-alloy-forge/12 bg-white/90 px-4 py-3.5 shadow-sm">
                <h3 className="text-xs font-semibold text-alloy-midnight">Edit programs</h3>
                <div className="mt-2">
                    <LocationProgramCategoriesSettingsPanel
                        sites={[site]}
                        categoriesBySite={categoriesBySite}
                        programCategories={programCategories}
                        onCategoriesChange={onCategoriesChange}
                        onError={onError}
                        inputClass={inputClass}
                    />
                </div>
            </section>

            <section className="rounded-xl border border-alloy-forge/12 bg-white/90 px-4 py-3.5 shadow-sm">
                <LocationSchedulePatternsSettingsPanel
                    siteId={site.id}
                    onError={onError}
                    inputClass={inputClass}
                />
            </section>
        </div>
    );
}
