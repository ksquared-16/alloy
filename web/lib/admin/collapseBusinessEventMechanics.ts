/**
 * ONE OPERATOR ACTION, ONE ACTIVITY LINE.
 *
 * A business action writes several facts: the outcome or decision itself, the child's status, the
 * child's or family's stage, a booking closed because of it, notifications sent because of it. All of
 * them belong in the ledger. On an operator's timeline they told the wrong story — "Ava moved to
 * Waitlist / Ava moved to Offered" for one Offer spot, "Tour cancelled" for a tour the family had just
 * completed, "SMS queued" as the last thing anyone did.
 *
 * This runs once over the loaded event list, before any surface formats it, so Recent activity, the
 * Activity tab and Last action all read the same normalized story. It never edits the ledger, and it
 * is generic: it knows business events by type, and their mechanics by subject and time — nothing about
 * Enrollment stages or labels.
 *
 *  - A lifecycle line (status/stage move) for the same subject within a few seconds of a business
 *    event IS that business event's mechanics, and is folded into it.
 *  - A booking lifecycle event marked `closed_by_outcome` is the outcome's mechanics, and is folded.
 *  - Notification rows shortly after a business event are its consequence: kept on the timeline, but
 *    marked `_consequence` so Last action never reports them as what the operator did.
 */

const BUSINESS_EVENT_TYPES = new Set(["stage_work_outcome_recorded", "participant_decision_recorded"]);
const CHILD_LIFECYCLE = "child_lifecycle_status_changed";
const FAMILY_LIFECYCLE = new Set(["opportunity_status_changed", "entity_status_changed"]);
const NOTIFICATION_TYPES = new Set(["message_queued", "message_sent", "message_delivered", "message_failed"]);
const CAUSE_TYPES = new Set([
    ...BUSINESS_EVENT_TYPES,
    "tour_canceled",
    "tour_completed",
    "tour_confirmed",
    "tour_booked",
    "tour_rescheduled",
    "tour_no_show",
]);

/** Mechanics are written in the same transaction as the action: seconds apart, never minutes. */
const MECHANICS_WINDOW_MS = 20_000;
/** Notifications follow their cause through the comms pipeline. */
const CONSEQUENCE_WINDOW_MS = 120_000;

type Row = {
    id?: string | null;
    event_type?: string | null;
    occurred_at?: string | null;
    payload?: Record<string, unknown> | null;
};

function str(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

function at(row: Row): number {
    const t = Date.parse(String(row.occurred_at ?? ""));
    return Number.isFinite(t) ? t : NaN;
}

function payload(row: Row): Record<string, unknown> {
    return row.payload && typeof row.payload === "object" ? row.payload : {};
}

type Subject = { family: true } | { child: { ids: Set<string>; name: string | null } };

function subjectOf(row: Row): Subject {
    const p = payload(row);
    const ids = new Set(
        [p.customer_member_id, p.opportunity_customer_member_id].map(str).filter((v): v is string => Boolean(v)),
    );
    const name = str(p.child_display_name);
    if (ids.size || name) return { child: { ids, name } };
    return { family: true };
}

/**
 * Whose activity is this row? The child it names (participation / child ids, or the child's display
 * name), or null when it is the FAMILY's (a tour, a family message). The same reading the collapse uses.
 */
export type ActivityRowSubject = { childIds: string[]; childName: string | null };

export function activityRowSubject(rowPayload: unknown): ActivityRowSubject | null {
    const s = subjectOf({ payload: rowPayload } as Row);
    return "child" in s ? { childIds: [...s.child.ids], childName: s.child.name } : null;
}

function sameChild(a: { ids: Set<string>; name: string | null }, b: { ids: Set<string>; name: string | null }): boolean {
    for (const id of a.ids) if (b.ids.has(id)) return true;
    return Boolean(a.name && b.name && a.name.toLowerCase() === b.name.toLowerCase());
}

export function collapseBusinessEventMechanics<T extends Row>(rows: T[]): T[] {
    const causes = rows
        .filter((r) => BUSINESS_EVENT_TYPES.has(String(r.event_type ?? "").toLowerCase()))
        .map((r) => ({ t: at(r), subject: subjectOf(r) }))
        .filter((c) => Number.isFinite(c.t));
    const consequenceCauses = rows
        .filter((r) => CAUSE_TYPES.has(String(r.event_type ?? "").toLowerCase()))
        .map(at)
        .filter((t) => Number.isFinite(t));

    const out: T[] = [];
    for (const row of rows) {
        const type = String(row.event_type ?? "").toLowerCase();
        const t = at(row);
        const p = payload(row);

        if (type.startsWith("tour_") && p.closed_by_outcome && typeof p.closed_by_outcome === "object") continue;

        if (Number.isFinite(t) && (type === CHILD_LIFECYCLE || FAMILY_LIFECYCLE.has(type))) {
            const subject = subjectOf(row);
            const folded = causes.some((c) => {
                if (Math.abs(c.t - t) > MECHANICS_WINDOW_MS) return false;
                if ("child" in subject) return "child" in c.subject && sameChild(c.subject.child, subject.child);
                // A family stage/status line folds into a family-level action only.
                return "family" in c.subject && FAMILY_LIFECYCLE.has(type);
            });
            if (folded) continue;
        }

        if (Number.isFinite(t) && NOTIFICATION_TYPES.has(type)) {
            const isConsequence = consequenceCauses.some((ct) => t >= ct && t - ct <= CONSEQUENCE_WINDOW_MS);
            if (isConsequence) {
                out.push({ ...row, payload: { ...p, _consequence: true } });
                continue;
            }
        }
        out.push(row);
    }
    return out;
}
