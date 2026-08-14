/**
 * RECORD COHORTS — overlapping views over a record population.
 *
 * A cohort is a PREDICATE with a label. It is not a lifecycle stage, not a queue, and not a saved
 * filter: a record can belong to several cohorts at once, and membership is DERIVED on read from the
 * record's own truth. Nothing about cohort membership is ever stored, so a cohort can never disagree
 * with the record it describes.
 *
 * ── WHY THIS IS NOT A FILTER ENGINE ──
 *
 * The temptation with "views" is to build a query builder. That would make Records the owner of a
 * second way to ask questions about people, competing with Search and with Work Views. This is
 * deliberately the smallest thing that answers "show me the cohort I need to review": a declared
 * list of predicates over an already-loaded projection. If a question needs more than that, it is a
 * Search question or a Work View question, not a Records one.
 *
 * ── CONFIGURED, NOT HARDCODED ──
 *
 * `Lead Teachers` is not a platform concept and must never become one. Position cohorts are BUILT
 * FROM THE TENANT'S OWN `employment_positions` — a tenant that configures "Room Lead" gets a Room
 * Lead cohort, and a tenant with no positions gets none. The platform supplies the shape; the tenant
 * supplies the vocabulary.
 */

export type RecordCohort<T> = {
    key: string;
    label: string;
    /** Membership, derived from the record. Pure — no IO, no clock read of its own. */
    predicate: (record: T) => boolean;
};

/** Count a cohort without materialising it — the row count shown on the tab. */
export function cohortCount<T>(cohort: RecordCohort<T>, records: readonly T[]): number {
    let n = 0;
    for (const r of records) if (cohort.predicate(r)) n += 1;
    return n;
}

export function applyCohort<T>(cohort: RecordCohort<T>, records: readonly T[]): T[] {
    return records.filter((r) => cohort.predicate(r));
}

// ── STAFF ────────────────────────────────────────────────────────────────────────────────────────

export type StaffCohortRecord = {
    isOpen: boolean;
    startDate: string;
    endDate: string | null;
    positionKey: string | null;
};

/** Days ahead that still counts as "starting soon". A month covers a normal hiring runway. */
export const STARTING_SOON_DAYS = 30;

function ymd(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function addDays(todayYmd: string, days: number): string {
    const d = new Date(`${todayYmd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return ymd(d);
}

/**
 * The staff cohorts, for a tenant's configured positions.
 *
 * `todayYmd` is passed in rather than read here: the operational day is the ORGANISATION's, not the
 * browser's, and a cohort that silently used the client clock would disagree with every other
 * surface on what "today" means.
 */
export function buildStaffCohorts(
    todayYmd: string,
    positions: readonly { key: string; label: string }[],
): RecordCohort<StaffCohortRecord>[] {
    const soonCutoff = addDays(todayYmd, STARTING_SOON_DAYS);

    const cohorts: RecordCohort<StaffCohortRecord>[] = [
        { key: "all", label: "All Staff", predicate: () => true },
    ];

    // One cohort per CONFIGURED position. This is where "Lead Teachers" comes from — the tenant's
    // own row, not a platform string. Positions with nobody in them still appear, because "nobody is
    // a Lead Teacher right now" is an answer a director wants.
    for (const position of positions) {
        cohorts.push({
            key: `position:${position.key}`,
            label: pluralizePosition(position.label),
            predicate: (r) => r.positionKey === position.key,
        });
    }

    cohorts.push(
        {
            key: "starting_soon",
            label: "Starting Soon",
            // Employment that has not begun. An open employment with a future start date is a real
            // and distinct state from "active": the person is staff, and is not here yet.
            predicate: (r) => r.isOpen && r.startDate > todayYmd && r.startDate <= soonCutoff,
        },
        {
            key: "inactive",
            label: "Inactive",
            predicate: (r) => !r.isOpen,
        },
    );

    return cohorts;
}

/**
 * "Lead Teacher" → "Lead Teachers".
 *
 * Presentation only, and deliberately naive: it appends an `s` (or `es` after s/x/z/ch/sh) because a
 * cohort tab reads as a group. A tenant whose position label pluralises irregularly gets a slightly
 * awkward tab, which is a far smaller cost than the platform owning an inflection dictionary for
 * tenant-authored vocabulary.
 */
export function pluralizePosition(label: string): string {
    const trimmed = label.trim();
    if (!trimmed) return trimmed;
    if (/(s|x|z|ch|sh)$/i.test(trimmed)) return `${trimmed}es`;
    if (/[^aeiou]y$/i.test(trimmed)) return `${trimmed.slice(0, -1)}ies`;
    return `${trimmed}s`;
}

// ── CHILDREN ─────────────────────────────────────────────────────────────────────────────────────

export type ChildCohortRecord = {
    isActive: boolean;
    /** Participation state derived from canonical process truth. Null = no participation at all. */
    participationState: "in_process" | "enrolled" | "closed" | null;
};

/**
 * The child cohorts.
 *
 * These are RECORD cohorts, not Enrollment stages. `Enrolled` means the platform holds enrollment
 * truth for this child; it is not a clone of an Enrollment Work View, and it does not go stale when
 * a process is reconfigured. A child with no participation at all belongs to `All Children` and to
 * nothing else — which is correct: they are a record, not a work item.
 *
 * All four are derivable from canonical truth today. Three of them may be legitimately EMPTY in a
 * tenant with no child operational data — empty is an answer, and hiding a cohort because it has no
 * members would make "nobody is enrolled" indistinguishable from "we do not track enrollment".
 */
export function buildChildCohorts(): RecordCohort<ChildCohortRecord>[] {
    return [
        { key: "all", label: "All Children", predicate: () => true },
        { key: "enrolled", label: "Enrolled", predicate: (r) => r.participationState === "enrolled" },
        { key: "in_process", label: "In Process", predicate: (r) => r.participationState === "in_process" },
        { key: "inactive", label: "Inactive", predicate: (r) => !r.isActive },
    ];
}
