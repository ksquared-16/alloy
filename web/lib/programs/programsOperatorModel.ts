/**
 * Simplified Programs product model — filter, sort, availability summaries.
 */

import type { ProgramPublicationSnapshot } from "@/lib/programs/publication/programPublicationService";
import {
    compareProgramAgeRanges,
    formatProgramAgeRange,
    formatProgramAgeRangeDetail,
    programLifecycleLabel,
} from "@/lib/programs/programsOperatorPresentation";
import {
    buildLocationProgramAvailabilityView,
    earliestFutureAvailabilityDate,
    formatProgramCollectionAvailabilitySummary,
    type LocationProgramAvailabilityView,
} from "@/lib/programs/locationProgramAvailability";

export type ProgramsLifecycleFilter = "active" | "archived" | "all";

export type ProgramsSortField =
    | "name"
    | "age"
    | "locations"
    | "created"
    | "updated"
    | "available_from";

export type ProgramsSortDirection = "asc" | "desc";

export type ProgramOperatorRow = {
    id: string;
    name: string;
    description: string | null;
    ageRangeLabel: string | null;
    audience: Record<string, unknown>;
    lifecycleStatus: "active" | "retired";
    statusLabel: "Active" | "Archived";
    locationCount: number;
    activeLocationCount: number;
    scheduledLocationCount: number;
    availabilityLabel: string;
    locationLabels: string[];
    createdAt: string | null;
    updatedAt: string | null;
    earliestAvailableFrom: string | null;
};

export type ProgramOperatorDetail = ProgramOperatorRow & {
    descriptionDisplay: string;
    ageRangeDisplay: string;
    canDelete: boolean;
    deleteBlockReason: string | null;
    locationAvailability: LocationProgramAvailabilityView[];
};

export function normalizeProgramsLifecycleFilter(value: string | null | undefined): ProgramsLifecycleFilter {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "archived" || raw === "retired") return "archived";
    if (raw === "all") return "all";
    return "active";
}

export function normalizeProgramsSortField(value: string | null | undefined): ProgramsSortField {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "age" || raw === "age_range") return "age";
    if (raw === "locations" || raw === "location_count") return "locations";
    if (raw === "created" || raw === "date_created") return "created";
    if (raw === "updated" || raw === "date_updated") return "updated";
    if (raw === "available_from" || raw === "available") return "available_from";
    return "name";
}

export function normalizeProgramsSortDirection(value: string | null | undefined): ProgramsSortDirection {
    return String(value ?? "").trim().toLowerCase() === "desc" ? "desc" : "asc";
}

export const PROGRAMS_SORT_OPTIONS: readonly {
    field: ProgramsSortField;
    direction: ProgramsSortDirection;
    label: string;
}[] = [
    { field: "name", direction: "asc", label: "Name — A to Z" },
    { field: "name", direction: "desc", label: "Name — Z to A" },
    { field: "age", direction: "asc", label: "Age range — Youngest first" },
    { field: "age", direction: "desc", label: "Age range — Oldest first" },
    { field: "locations", direction: "desc", label: "Locations — Most first" },
    { field: "locations", direction: "asc", label: "Locations — Fewest first" },
    { field: "updated", direction: "desc", label: "Date updated — Newest first" },
    { field: "updated", direction: "asc", label: "Date updated — Oldest first" },
    { field: "created", direction: "desc", label: "Date created — Newest first" },
    { field: "created", direction: "asc", label: "Date created — Oldest first" },
    { field: "available_from", direction: "asc", label: "Available from — Soonest first" },
    { field: "available_from", direction: "desc", label: "Available from — Latest first" },
] as const;

function availabilityRowsForProgram(
    snapshot: ProgramPublicationSnapshot,
    programId: string,
    organizationProgramName: string,
) {
    const byLocation = new Map<string, LocationProgramAvailabilityView>();
    for (const row of snapshot.availability) {
        if (row.programId !== programId) continue;
        byLocation.set(
            row.locationId,
            buildLocationProgramAvailabilityView({
                locationId: row.locationId,
                locationLabel: row.locationLabel,
                organizationProgramName,
                localDisplayName: row.localDisplayName ?? null,
                availableFrom: row.availableFrom ?? null,
                availableThrough: row.availableThrough ?? null,
                offered: row.offered !== false,
            }),
        );
    }
    // Associated via assignment evidence even if LPC offer flag is sparse
    for (const assignment of snapshot.assignments) {
        if (assignment.programId !== programId) continue;
        if (byLocation.has(assignment.locationId)) continue;
        byLocation.set(
            assignment.locationId,
            buildLocationProgramAvailabilityView({
                locationId: assignment.locationId,
                locationLabel: assignment.locationLabel,
                organizationProgramName,
                localDisplayName: null,
                availableFrom: null,
                availableThrough: null,
                offered: true,
            }),
        );
    }
    return [...byLocation.values()].sort((a, b) =>
        a.locationLabel.localeCompare(b.locationLabel, undefined, { sensitivity: "base" }),
    );
}

export function buildProgramOperatorRow(
    snapshot: ProgramPublicationSnapshot,
    program: ProgramPublicationSnapshot["programs"][number],
): ProgramOperatorRow {
    const definition = program.draft;
    const audience = (definition.audience ?? {}) as Record<string, unknown>;
    const name = String(definition.label ?? "").trim() || "Untitled Program";
    const locations = availabilityRowsForProgram(snapshot, program.id, name);
    const active = locations.filter((row) => row.status === "active");
    const scheduled = locations.filter((row) => row.status === "scheduled");
    const earliestAvailableFrom = earliestFutureAvailabilityDate(
        locations.map((row) => row.availableFrom),
    );
    return {
        id: program.id,
        name,
        description: definition.description?.trim() || null,
        ageRangeLabel: formatProgramAgeRange(audience),
        audience,
        lifecycleStatus: program.lifecycleStatus === "retired" ? "retired" : "active",
        statusLabel: programLifecycleLabel(program.lifecycleStatus),
        locationCount: locations.length,
        activeLocationCount: active.length,
        scheduledLocationCount: scheduled.length,
        availabilityLabel: formatProgramCollectionAvailabilitySummary({
            activeCount: active.length,
            scheduledCount: scheduled.length,
            earliestScheduledFrom: earliestAvailableFrom,
        }),
        locationLabels: locations.map((row) => row.locationLabel),
        createdAt: program.createdAt ?? null,
        updatedAt: definition.updatedAt ?? program.createdAt ?? null,
        earliestAvailableFrom,
    };
}

export function buildProgramsOperatorCollection(
    snapshot: ProgramPublicationSnapshot,
): ProgramOperatorRow[] {
    return snapshot.programs.map((program) => buildProgramOperatorRow(snapshot, program));
}

export function filterProgramOperatorRows(
    rows: readonly ProgramOperatorRow[],
    options: { search: string; filter: ProgramsLifecycleFilter },
): ProgramOperatorRow[] {
    const query = options.search.trim().toLowerCase();
    return rows.filter((row) => {
        if (options.filter === "active" && row.lifecycleStatus !== "active") return false;
        if (options.filter === "archived" && row.lifecycleStatus !== "retired") return false;
        if (!query) return true;
        return (
            row.name.toLowerCase().includes(query)
            || (row.description?.toLowerCase().includes(query) ?? false)
            || (row.ageRangeLabel?.toLowerCase().includes(query) ?? false)
            || row.locationLabels.some((label) => label.toLowerCase().includes(query))
        );
    });
}

export function sortProgramOperatorRows(
    rows: readonly ProgramOperatorRow[],
    field: ProgramsSortField,
    direction: ProgramsSortDirection,
): ProgramOperatorRow[] {
    const copy = [...rows];
    copy.sort((a, b) => {
        let cmp = 0;
        if (field === "name") {
            cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        } else if (field === "age") {
            cmp = compareProgramAgeRanges(a.audience, b.audience, direction);
            return cmp || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        } else if (field === "locations") {
            cmp = a.locationCount - b.locationCount;
        } else if (field === "created") {
            cmp = String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
        } else if (field === "updated") {
            cmp = String(a.updatedAt ?? "").localeCompare(String(b.updatedAt ?? ""));
        } else if (field === "available_from") {
            const left = a.earliestAvailableFrom ?? (direction === "asc" ? "9999-12-31" : "");
            const right = b.earliestAvailableFrom ?? (direction === "asc" ? "9999-12-31" : "");
            cmp = left.localeCompare(right);
        }
        if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        return direction === "asc" ? cmp : -cmp;
    });
    return copy;
}

export function buildProgramOperatorDetail(
    snapshot: ProgramPublicationSnapshot,
    programId: string,
): ProgramOperatorDetail | null {
    const program = snapshot.programs.find((row) => row.id === programId);
    if (!program) return null;
    const row = buildProgramOperatorRow(snapshot, program);
    const locationAvailability = availabilityRowsForProgram(snapshot, program.id, row.name);
    const hasAssociations = locationAvailability.length > 0;
    const hasPublished = Boolean(program.latestPublication?.id);
    const canDelete = !hasAssociations && !hasPublished && program.revisions.length === 0;
    return {
        ...row,
        descriptionDisplay: row.description ?? "No description added",
        ageRangeDisplay: formatProgramAgeRangeDetail(row.audience),
        canDelete,
        deleteBlockReason: canDelete
            ? null
            : "This Program is already in use and its history must be preserved.",
        locationAvailability,
    };
}

export function associatedLocationIdsForProgram(
    snapshot: ProgramPublicationSnapshot,
    programId: string,
): string[] {
    const program = snapshot.programs.find((row) => row.id === programId);
    const name = program?.draft.label?.trim() || "Program";
    return availabilityRowsForProgram(snapshot, programId, name).map((row) => row.locationId);
}
