/**
 * Generic parser for process tracks_v1 metadata.
 * No enrollment or template constants.
 */

import type {
    ProcessSplitOutcomeV1,
    ProcessSplitRuleV1,
    ProcessTrackV1,
    ProcessTracksV1,
} from "@/lib/businessProcesses/processConfigTypes";

function trimKey(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const t = value.trim();
    return t || null;
}

function parseSplitOutcomes(raw: unknown): ProcessSplitOutcomeV1[] {
    if (!Array.isArray(raw)) return [];
    const out: ProcessSplitOutcomeV1[] = [];
    for (const row of raw) {
        if (row == null || typeof row !== "object" || Array.isArray(row)) continue;
        const r = row as Record<string, unknown>;
        const outcome_key = trimKey(r.outcome_key);
        const label = trimKey(r.label);
        if (!outcome_key || !label) continue;
        const targetRaw = r.target_stage_key;
        const target_stage_key = targetRaw === null ? null : trimKey(targetRaw);
        out.push({ outcome_key, label, target_stage_key });
    }
    return out;
}

/** Parse raw tracks_v1 blob from process metadata. */
export function parseProcessTracksV1(raw: unknown): ProcessTracksV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.version !== 1) return null;
    if (!Array.isArray(o.tracks)) return null;

    const tracks: ProcessTrackV1[] = [];
    for (const t of o.tracks) {
        if (t == null || typeof t !== "object" || Array.isArray(t)) continue;
        const row = t as Record<string, unknown>;
        const key = trimKey(row.key);
        const label = trimKey(row.label);
        const subject = trimKey(row.subject);
        if (!key || !label || !subject) continue;
        tracks.push({
            key,
            label,
            subject,
            sort_order: typeof row.sort_order === "number" ? row.sort_order : tracks.length,
        });
    }
    tracks.sort((a, b) => a.sort_order - b.sort_order);

    const split_rules: ProcessSplitRuleV1[] = [];
    if (Array.isArray(o.split_rules)) {
        for (const sr of o.split_rules) {
            if (sr == null || typeof sr !== "object" || Array.isArray(sr)) continue;
            const row = sr as Record<string, unknown>;
            if (row.version !== 1) continue;
            const from_track_key = trimKey(row.from_track_key);
            const from_stage_key = trimKey(row.from_stage_key);
            const into_track_key = trimKey(row.into_track_key);
            if (!from_track_key || !from_stage_key || !into_track_key) continue;
            const outcomesRaw =
                row.per_subject_outcomes ?? row.per_child_outcomes;
            split_rules.push({
                version: 1,
                from_track_key,
                from_stage_key,
                into_track_key,
                per_subject_outcomes: parseSplitOutcomes(outcomesRaw),
            });
        }
    }

    if (!tracks.length) return null;
    return { version: 1, tracks, split_rules };
}
