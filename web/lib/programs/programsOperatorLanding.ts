/**
 * Programs landing orientation model — org Program counts + Location availability roll-ups.
 */

import type { ProgramPublicationSnapshot } from "@/lib/programs/publication/programPublicationService";
import {
    buildLocationProgramAvailabilityView,
    todayYmd,
} from "@/lib/programs/locationProgramAvailability";

export type ProgramsLandingLocationRow = {
    locationId: string;
    locationLabel: string;
    activeProgramCount: number;
};

export type ProgramsLandingUpcomingItem = {
    programId: string;
    programName: string;
    availableFrom: string;
    locationLabels: string[];
    summaryLine: string;
};

export type ProgramsLandingModel = {
    activeProgramCount: number;
    archivedProgramCount: number;
    locationsOfferingCount: number;
    locationRows: ProgramsLandingLocationRow[];
    upcoming: ProgramsLandingUpcomingItem[];
};

function formatShortDate(ymd: string): string {
    const [y, m, d] = ymd.split("-").map(Number);
    if (!y || !m || !d) return ymd;
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
    });
}

function upcomingSummaryLine(locationLabels: string[]): string {
    if (locationLabels.length === 0) return "";
    if (locationLabels.length === 1) return `at ${locationLabels[0]}`;
    if (locationLabels.length === 2) return `at ${locationLabels[0]} and ${locationLabels[1]}`;
    const extra = locationLabels.length - 1;
    return `at ${locationLabels[0]} and ${extra} more Locations`;
}

/**
 * Build the Programs landing surface from the authoritative Programs snapshot.
 * Organization Program lifecycle and Location availability stay separate domains.
 */
export function buildProgramsLandingModel(
    snapshot: ProgramPublicationSnapshot,
    asOfYmd = todayYmd(),
): ProgramsLandingModel {
    let activeProgramCount = 0;
    let archivedProgramCount = 0;
    const activeProgramIds = new Set<string>();
    const programNameById = new Map<string, string>();

    for (const program of snapshot.programs) {
        const name = String(program.draft.label ?? "").trim() || "Untitled Program";
        programNameById.set(program.id, name);
        if (program.lifecycleStatus === "retired") {
            archivedProgramCount += 1;
        } else {
            activeProgramCount += 1;
            activeProgramIds.add(program.id);
        }
    }

    const activeCountByLocation = new Map<string, number>();
    const upcomingByKey = new Map<string, ProgramsLandingUpcomingItem>();

    for (const row of snapshot.availability) {
        const programId = row.programId;
        if (!programId || !activeProgramIds.has(programId)) continue;
        const organizationProgramName = programNameById.get(programId) ?? "Program";
        const view = buildLocationProgramAvailabilityView({
            locationId: row.locationId,
            locationLabel: row.locationLabel,
            organizationProgramName,
            localDisplayName: row.localDisplayName,
            availableFrom: row.availableFrom,
            availableThrough: row.availableThrough,
            offered: row.offered !== false,
            asOfYmd,
        });
        if (view.status === "active") {
            activeCountByLocation.set(
                view.locationId,
                (activeCountByLocation.get(view.locationId) ?? 0) + 1,
            );
        } else if (view.status === "scheduled" && view.availableFrom) {
            const key = `${programId}:${view.availableFrom}`;
            const existing = upcomingByKey.get(key);
            if (existing) {
                if (!existing.locationLabels.includes(view.locationLabel)) {
                    existing.locationLabels.push(view.locationLabel);
                    existing.locationLabels.sort((a, b) =>
                        a.localeCompare(b, undefined, { sensitivity: "base" }),
                    );
                    existing.summaryLine = `Begins ${formatShortDate(view.availableFrom)} ${upcomingSummaryLine(existing.locationLabels)}`;
                }
            } else {
                const locationLabels = [view.locationLabel];
                upcomingByKey.set(key, {
                    programId,
                    programName: organizationProgramName,
                    availableFrom: view.availableFrom,
                    locationLabels,
                    summaryLine: `Begins ${formatShortDate(view.availableFrom)} ${upcomingSummaryLine(locationLabels)}`,
                });
            }
        }
    }

    // Preserve snapshot Location order (canonical query order), then append any extras alphabetically.
    const locationRows: ProgramsLandingLocationRow[] = [];
    const seen = new Set<string>();
    for (const location of snapshot.locations) {
        const count = activeCountByLocation.get(location.id) ?? 0;
        if (count <= 0) continue;
        seen.add(location.id);
        locationRows.push({
            locationId: location.id,
            locationLabel: location.label,
            activeProgramCount: count,
        });
    }
    for (const [locationId, count] of activeCountByLocation) {
        if (seen.has(locationId) || count <= 0) continue;
        const label =
            snapshot.availability.find((row) => row.locationId === locationId)?.locationLabel
            ?? "Location";
        locationRows.push({
            locationId,
            locationLabel: label,
            activeProgramCount: count,
        });
    }

    const upcoming = [...upcomingByKey.values()]
        .sort((a, b) => {
            const byDate = a.availableFrom.localeCompare(b.availableFrom);
            if (byDate !== 0) return byDate;
            return a.programName.localeCompare(b.programName, undefined, { sensitivity: "base" });
        })
        .slice(0, 3);

    return {
        activeProgramCount,
        archivedProgramCount,
        locationsOfferingCount: locationRows.length,
        locationRows,
        upcoming,
    };
}
