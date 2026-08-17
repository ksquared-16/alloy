/**
 * THE STAFF SUBJECT OF A SCHEDULE CONTEXT, stated in truth under its own name.
 *
 * The Scheduling card iterates a collection of subjects. On a case that collection is a family's
 * roster of children; on a durable child record it is the one child, carried under
 * `DURABLE_CHILD_ROWS_KEY`. A staff member is neither, and this key exists so that can be said
 * without borrowing either name.
 *
 * ── WHY NOT REUSE THE CHILD ROWS KEY ──
 *
 * It would have worked today. `mapRawInquiryChildrenToDrawerRows` is total, so a person written into
 * `_durable_child_rows` would map to a child-shaped row with null enrollment fields and the card
 * would render it. That is exactly the failure the convergence audit names: the surface would be
 * correct while the TRUTH said a staff member is a child. Every later reader — a roster count, an
 * age policy, an enrollment projection — would inherit that claim, and each would be individually
 * reasonable and collectively wrong.
 *
 * So Jane is a staff subject in truth, the card is told which kind of subject it holds, and the
 * child-shaped enrichment (age, household, tuition) is simply not asked for.
 *
 * ── IT CARRIES IDENTITY, NOT COMMITMENT ──
 *
 * Nothing here states an assignment, a site or a schedule. Those come from `_scheduling_projection`,
 * composed by `composeDurableStaffScheduling` from the canonical rows — the same bag the child path
 * fills. This key answers only "who is this card about", which is why it is three fields.
 */

export const DURABLE_STAFF_SUBJECT_KEY = "_durable_staff_subject" as const;

export type DurableStaffSchedulingSubject = {
    /** `persons.id` — how a staff subject is identified, addressed and keyed everywhere. */
    personId: string;
    /** Operator-facing name. Never a bare id: an unnamed person is a data problem, not a title. */
    name: string;
    imageUrl: string | null;
};

/**
 * Read the staff subject from operational truth, or null.
 *
 * Null means "this card is not about a staff member" — it never means "composition failed". A host
 * that holds a child writes the child rows key and not this one, so there is no precedence to get
 * wrong and no state in which both are present.
 */
export function readDurableStaffSchedulingSubject(
    truth: Record<string, unknown> | null | undefined,
): DurableStaffSchedulingSubject | null {
    const raw = truth?.[DURABLE_STAFF_SUBJECT_KEY];
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    const personId = String(row.personId ?? "").trim();
    if (!personId) return null;
    const name = String(row.name ?? "").trim();
    const imageUrl = String(row.imageUrl ?? "").trim();
    return {
        personId,
        // A subject with no resolvable name still opens — the operator can see the assignment even
        // when the person record is thin. It is labelled honestly rather than with the id.
        name: name || "Staff member",
        imageUrl: imageUrl || null,
    };
}
