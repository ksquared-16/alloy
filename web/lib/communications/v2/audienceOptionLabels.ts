/**
 * Audience builder option display helpers — dedupe labels for multi-select UIs.
 * Pure logic only; no API or send behavior.
 */

export type LabeledOption = { id: string; label: string };

export type ProgramOptionRow = { id: string; label: string; location_id: string };

/** When duplicate labels exist, append location context for disambiguation. */
export function programOptionsForDisplay(
    programs: ProgramOptionRow[],
    locationLabelById: ReadonlyMap<string, string>,
    selectedLocationIds: string[]
): LabeledOption[] {
    const filtered =
        selectedLocationIds.length > 0
            ? programs.filter((p) => selectedLocationIds.includes(p.location_id))
            : programs;
    const labelCounts = new Map<string, number>();
    for (const p of filtered) {
        const key = p.label.trim().toLowerCase();
        labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
    }
    return filtered.map((p) => {
        const key = p.label.trim().toLowerCase();
        const dup = (labelCounts.get(key) ?? 0) > 1;
        const loc = locationLabelById.get(p.location_id);
        return {
            id: p.id,
            label: dup && loc ? `${p.label} · ${loc}` : p.label,
        };
    });
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
    const allowed = new Set(programs.filter((p) => selectedLocationIds.includes(p.location_id)).map((p) => p.id));
    return programIds.filter((id) => allowed.has(id));
}
