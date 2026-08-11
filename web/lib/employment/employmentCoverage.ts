/**
 * Pure employment-coverage predicate.
 *
 * Mirrors `public.person_is_employed_on` exactly, for read models that must
 * answer the question for many (person × date) pairs without one round trip
 * each. The database function remains the WRITE-path authority — nothing here
 * admits an assignment.
 *
 * The two definitions are kept honest by `employmentCoverageParity.test.ts`,
 * which runs the same matrix through both.
 *
 * Semantics that matter:
 *  - Window-based, NOT status-based. An `ended` employment still covers days
 *    inside its own window; that is what keeps historical supply readable.
 *  - Only `canceled` is excluded outright — a canceled employment never
 *    happened.
 */

export type EmploymentCoverageRow = {
    person_id: string;
    employment_status: string;
    start_date: string;
    end_date: string | null;
};

/** True when `row` covers `date` (inclusive both ends, open when end is null). */
export function employmentRowCoversDate(row: EmploymentCoverageRow, date: string): boolean {
    if (row.employment_status === "canceled") return false;
    if (row.start_date > date) return false;
    if (row.end_date != null && row.end_date < date) return false;
    return true;
}

/** True when any of `rows` (already scoped to one org) covers `personId` on `date`. */
export function personIsEmployedOnFromRows(
    rows: readonly EmploymentCoverageRow[],
    personId: string,
    date: string
): boolean {
    return rows.some((r) => r.person_id === personId && employmentRowCoversDate(r, date));
}

/**
 * Index rows by person so a week-wide projection evaluates coverage in O(1) per
 * person·date instead of rescanning the whole set.
 */
export function indexEmploymentCoverage(
    rows: readonly EmploymentCoverageRow[]
): Map<string, EmploymentCoverageRow[]> {
    const byPerson = new Map<string, EmploymentCoverageRow[]>();
    for (const r of rows) {
        const list = byPerson.get(r.person_id);
        if (list) list.push(r);
        else byPerson.set(r.person_id, [r]);
    }
    return byPerson;
}
