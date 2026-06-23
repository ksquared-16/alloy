/**
 * Audience builder option display helpers — dedupe labels for multi-select UIs.
 * Pure logic only; no API or send behavior.
 */

import { filterInquiryChildSiteLocationOptions } from "@/lib/admin/drawer/inquiryChildPlacementScope";
import { readLocationMetadataPresentation } from "@/lib/admin/location/locationMetadataFields";
import {
    resolveRoomsForSiteAndProgram,
    type InquiryChildPlacementHierarchyRow,
} from "@/lib/admin/location/inquiryChildPlacementOptions";

export type LabeledOption = { id: string; label: string };

export type ProgramOptionRow = { id: string; label: string; location_id: string; key: string };

/** Physical schools/sites only — excludes unit/classroom rows from the locations table. */
export function siteLocationOptionsFromHierarchy(
    hierarchy: InquiryChildPlacementHierarchyRow[]
): LabeledOption[] {
    return filterInquiryChildSiteLocationOptions(hierarchy).map((s) => ({
        id: s.id,
        label: s.label,
    }));
}

/** True when a row looks like a program category, not a physical site or room unit. */
export function isProgramCategoryOptionRow(row: ProgramOptionRow): boolean {
    return Boolean(row.id.trim() && row.label.trim() && row.location_id.trim());
}

/** One program row per location + label (drops duplicate category rows at the same site). */
function dedupeProgramRowsByLocationAndLabel(programs: ProgramOptionRow[]): ProgramOptionRow[] {
    const byLocLabel = new Map<string, ProgramOptionRow>();
    for (const p of programs) {
        const k = `${p.location_id}::${p.label.trim().toLowerCase()}`;
        if (!byLocLabel.has(k)) byLocLabel.set(k, p);
    }
    return [...byLocLabel.values()];
}

/** Program categories only; optionally scoped to selected school site ids. */
export function programOptionsForDisplay(
    programs: ProgramOptionRow[],
    locationLabelById: ReadonlyMap<string, string>,
    selectedLocationIds: string[]
): LabeledOption[] {
    const scoped = programs.filter(isProgramCategoryOptionRow);
    const filtered =
        selectedLocationIds.length > 0
            ? scoped.filter((p) => selectedLocationIds.includes(p.location_id))
            : scoped;

    const deduped = dedupeProgramRowsByLocationAndLabel(filtered);

    // Single location: unique labels only — never append location context.
    if (selectedLocationIds.length === 1) {
        const byLabel = new Map<string, LabeledOption>();
        for (const p of deduped) {
            const labelKey = p.label.trim().toLowerCase();
            if (!byLabel.has(labelKey)) {
                byLabel.set(labelKey, { id: p.id, label: p.label.trim() });
            }
        }
        return [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label));
    }

    const labelCounts = new Map<string, number>();
    for (const p of deduped) {
        const key = p.label.trim().toLowerCase();
        labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
    }
    const out: LabeledOption[] = [];
    for (const p of deduped) {
        const labelKey = p.label.trim().toLowerCase();
        const dup = (labelCounts.get(labelKey) ?? 0) > 1;
        const loc = locationLabelById.get(p.location_id);
        out.push({
            id: p.id,
            label: dup && loc ? `${p.label.trim()} · ${loc}` : p.label.trim(),
        });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** Dedupe status options by status_key; disambiguate duplicate labels with status key. */
export function statusOptionsForDisplay(options: { status_key: string; label: string }[]): LabeledOption[] {
    const labelCounts = new Map<string, number>();
    for (const o of options) {
        const key = o.label.trim().toLowerCase();
        labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
    }
    const seen = new Set<string>();
    const out: LabeledOption[] = [];
    for (const o of options) {
        if (seen.has(o.status_key)) continue;
        seen.add(o.status_key);
        const dup = (labelCounts.get(o.label.trim().toLowerCase()) ?? 0) > 1;
        out.push({ id: o.status_key, label: dup ? `${o.label} (${o.status_key})` : o.label });
    }
    return out;
}

/** Drop program ids that no longer match selected locations. */
export function filterProgramIdsForLocations(
    programIds: string[],
    programs: ProgramOptionRow[],
    selectedLocationIds: string[]
): string[] {
    if (selectedLocationIds.length === 0) return programIds;
    const allowed = new Set(
        programs.filter((p) => selectedLocationIds.includes(p.location_id)).map((p) => p.id)
    );
    return programIds.filter((id) => allowed.has(id));
}

export type RoomAudienceBuilderState = {
    enabled: boolean;
    options: LabeledOption[];
    helper: string;
};

function isActiveUnitRow(row: InquiryChildPlacementHierarchyRow): boolean {
    if (String(row.location_type ?? "").trim() !== "unit") return false;
    return row.is_active !== false;
}

/** Resolve unit/classroom options for a site + program category row. */
export function resolveRoomsForProgramCategoryRow(
    hierarchy: InquiryChildPlacementHierarchyRow[],
    siteId: string,
    programRow: ProgramOptionRow | undefined
): LabeledOption[] {
    const site = siteId.trim();
    if (!site || !programRow) return [];

    const programKey = programRow.key.trim();
    if (programKey) {
        const byKey = resolveRoomsForSiteAndProgram(hierarchy, site, programKey);
        if (byKey.length > 0) {
            return byKey.map((o) => ({ id: o.value, label: o.label }));
        }
    }

    // Some units store the program category id in metadata.category instead of the stable key.
    const categoryId = programRow.id.trim();
    if (!categoryId) return [];

    return hierarchy
        .filter((row) => {
            if (!isActiveUnitRow(row)) return false;
            if (String(row.parent_location_id ?? "").trim() !== site) return false;
            const category = readLocationMetadataPresentation(row.metadata).category;
            return (category ?? "").trim() === categoryId;
        })
        .map((row) => ({
            id: String(row.id),
            label: (row.label ?? row.id).trim() || String(row.id),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Room/classroom options scoped to a single selected school + program category.
 * Uses inquiry-child unit rows (`location_type = unit`) under the selected site.
 */
export function roomAudienceBuilderState(
    hierarchy: InquiryChildPlacementHierarchyRow[],
    programs: ProgramOptionRow[],
    selectedLocationIds: string[],
    selectedProgramIds: string[],
    locationLabelById: ReadonlyMap<string, string> = new Map()
): RoomAudienceBuilderState {
    if (hierarchy.length === 0) {
        return {
            enabled: false,
            options: [],
            helper: "Room list is unavailable — location hierarchy has not loaded yet.",
        };
    }
    if (selectedLocationIds.length !== 1 || selectedProgramIds.length !== 1) {
        return {
            enabled: false,
            options: [],
            helper: "Select exactly one school and one program to choose a room/classroom.",
        };
    }
    const locationId = selectedLocationIds[0]!;
    const programId = selectedProgramIds[0]!;
    const programRow = programs.find((p) => p.id === programId);
    const locationLabel = locationLabelById.get(locationId) ?? "selected location";
    const programLabel = programRow?.label?.trim() || "selected program";

    if (!programRow) {
        return {
            enabled: false,
            options: [],
            helper: "Selected program could not be resolved — choose a program again.",
        };
    }

    const options = resolveRoomsForProgramCategoryRow(hierarchy, locationId, programRow);
    if (options.length === 0) {
        return {
            enabled: false,
            options: [],
            helper: `No classrooms are configured for ${locationLabel} → ${programLabel}.`,
        };
    }
    return {
        enabled: true,
        options,
        helper: "Rooms are scoped to the selected school and program.",
    };
}

/** Resolve the category label map for program/site disambiguation from hierarchy sites. */
export function siteLocationLabelById(
    hierarchy: InquiryChildPlacementHierarchyRow[]
): Map<string, string> {
    return new Map(siteLocationOptionsFromHierarchy(hierarchy).map((s) => [s.id, s.label]));
}
