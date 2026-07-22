/**
 * Simplified Programs product model derived from ProgramPublicationSnapshot.
 * Hides publication/draft/readiness vocabulary from the operator surface.
 */

import type { ProgramPublicationSnapshot } from "@/lib/programs/publication/programPublicationService";
import {
    formatAvailabilityCount,
    formatProgramAgeRange,
    formatProgramAgeRangeDetail,
    programLifecycleLabel,
} from "@/lib/programs/programsOperatorPresentation";

export type ProgramsLifecycleFilter = "active" | "archived" | "all";

export type ProgramOperatorRow = {
    id: string;
    name: string;
    description: string | null;
    ageRangeLabel: string | null;
    lifecycleStatus: "active" | "retired";
    statusLabel: "Active" | "Archived";
    locationCount: number;
    availabilityLabel: string;
    locationLabels: string[];
};

export type ProgramOperatorDetail = ProgramOperatorRow & {
    descriptionDisplay: string;
    ageRangeDisplay: string;
    canDelete: boolean;
    deleteBlockReason: string | null;
};

function locationsForProgram(
    snapshot: ProgramPublicationSnapshot,
    programId: string,
): { id: string; label: string }[] {
    const byId = new Map<string, string>();
    for (const assignment of snapshot.assignments) {
        if (assignment.programId !== programId) continue;
        byId.set(assignment.locationId, assignment.locationLabel);
    }
    // Associated via LPC even when consumption evidence is sparse
    for (const row of snapshot.availability) {
        if (row.programId !== programId) continue;
        if (!byId.has(row.locationId)) {
            byId.set(row.locationId, row.locationLabel);
        }
    }
    return [...byId.entries()]
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

export function buildProgramOperatorRow(
    snapshot: ProgramPublicationSnapshot,
    program: ProgramPublicationSnapshot["programs"][number],
): ProgramOperatorRow {
    const definition = program.draft;
    const audience = (definition.audience ?? {}) as Record<string, unknown>;
    const locations = locationsForProgram(snapshot, program.id);
    const locationCount = locations.length;
    return {
        id: program.id,
        name: String(definition.label ?? "").trim() || "Untitled Program",
        description: definition.description?.trim() || null,
        ageRangeLabel: formatProgramAgeRange(audience),
        lifecycleStatus: program.lifecycleStatus === "retired" ? "retired" : "active",
        statusLabel: programLifecycleLabel(program.lifecycleStatus),
        locationCount,
        availabilityLabel: formatAvailabilityCount(locationCount),
        locationLabels: locations.map((row) => row.label),
    };
}

export function buildProgramsOperatorCollection(
    snapshot: ProgramPublicationSnapshot,
): ProgramOperatorRow[] {
    return snapshot.programs
        .map((program) => buildProgramOperatorRow(snapshot, program))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
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

export function buildProgramOperatorDetail(
    snapshot: ProgramPublicationSnapshot,
    programId: string,
): ProgramOperatorDetail | null {
    const program = snapshot.programs.find((row) => row.id === programId);
    if (!program) return null;
    const row = buildProgramOperatorRow(snapshot, program);
    const hasAssociations = row.locationCount > 0;
    const hasPublished = Boolean(program.latestPublication?.id);
    const canDelete = !hasAssociations && !hasPublished && program.revisions.length === 0;
    return {
        ...row,
        descriptionDisplay: row.description ?? "No description added",
        ageRangeDisplay: formatProgramAgeRangeDetail(
            (program.draft.audience ?? {}) as Record<string, unknown>,
        ),
        canDelete,
        deleteBlockReason: canDelete
            ? null
            : "This Program is already in use and its history must be preserved.",
    };
}

export function associatedLocationIdsForProgram(
    snapshot: ProgramPublicationSnapshot,
    programId: string,
): string[] {
    return locationsForProgram(snapshot, programId).map((row) => row.id);
}
