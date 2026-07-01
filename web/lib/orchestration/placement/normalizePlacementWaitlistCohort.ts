/**
 * Canonical cohort key + human label for waitlist candidate rows (Card 4.6).
 */

import {
    resolveProgramRoomCohort,
    slugifyProgramRoomCohortKey,
    UNKNOWN_PROGRAM_ROOM_COHORT_KEY,
    UNKNOWN_PROGRAM_ROOM_GROUP_LABEL,
} from "@/lib/orchestration/placement/resolveProgramRoomCohort";

export type NormalizedPlacementWaitlistCohort = {
    cohortKey: string;
    cohortLabel: string;
};

/** Slug-like keys must not be shown as human labels in the UI. */
export function cohortKeyLooksLikeRawSlug(label: string, cohortKey: string): boolean {
    const l = label.trim();
    const k = cohortKey.trim();
    if (!l || !k) return false;
    if (l === k) return true;
    if (/^[a-z0-9_]+$/.test(l) && slugifyProgramRoomCohortKey(l) === k) return true;
    return false;
}

function titleCaseFromSlug(slug: string): string {
    if (slug === UNKNOWN_PROGRAM_ROOM_COHORT_KEY) return UNKNOWN_PROGRAM_ROOM_GROUP_LABEL;
    return slug
        .split("_")
        .filter(Boolean)
        .map((w) => (w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(" ");
}

/**
 * Normalize cohort partition key and display label for waitlist grouping.
 * Prefers explicit human labels; never returns a label that equals the raw slug key.
 */
export function normalizePlacementWaitlistCohort(
    rawKey: string | null | undefined,
    rawLabel: string | null | undefined
): NormalizedPlacementWaitlistCohort {
    const keyTrim = rawKey?.trim() ?? "";
    const labelTrim = rawLabel?.trim() ?? "";

    const cohortKey = keyTrim
        ? slugifyProgramRoomCohortKey(keyTrim)
        : labelTrim
          ? slugifyProgramRoomCohortKey(labelTrim)
          : UNKNOWN_PROGRAM_ROOM_COHORT_KEY;

    if (labelTrim && !cohortKeyLooksLikeRawSlug(labelTrim, cohortKey)) {
        return { cohortKey, cohortLabel: labelTrim };
    }

    const resolved = resolveProgramRoomCohort({
        program_room_cohort_key: cohortKey,
        program_room_group_label: labelTrim || null,
    });

    let cohortLabel = resolved.program_room_group_label;
    if (!cohortLabel.trim() || cohortKeyLooksLikeRawSlug(cohortLabel, cohortKey)) {
        cohortLabel = titleCaseFromSlug(cohortKey);
    }

    return { cohortKey, cohortLabel };
}

export function readNormalizedCohortFromWaitlistRow(
    row: Record<string, unknown>
): NormalizedPlacementWaitlistCohort | null {
    const wr = row._placement_waitlist_row;
    if (wr == null || typeof wr !== "object" || Array.isArray(wr)) return null;
    const o = wr as { program_room_cohort_key?: string; program_room_group_label?: string };
    const key = typeof o.program_room_cohort_key === "string" ? o.program_room_cohort_key.trim() : "";
    if (!key) return null;
    const label = typeof o.program_room_group_label === "string" ? o.program_room_group_label.trim() : "";
    return normalizePlacementWaitlistCohort(key, label);
}
