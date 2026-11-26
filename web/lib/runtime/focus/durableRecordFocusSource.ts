/**
 * BP V2 S4 — THE SOURCE THAT BROUGHT AN OPERATOR TO A DURABLE RECORD, and how a card resolves it.
 *
 * A Work View row stands on an authoritative source — the schedule assignment ending soon, the agreement
 * with no schedule. Opening the record hands that source to the record's operational card as a FOCUS
 * REQUEST. It is never the record's identity (the child or person is), and it is never trusted as
 * truth: the projection that produced it was read earlier, so the card resolves it against its OWN
 * fresh read and reports honestly when the source has moved on. Nothing here selects by position,
 * newest timestamp or status — an id either matches a row the card holds, or it does not.
 */

export type DurableRecordFocusSource = {
    /** `schedule_assignment` | `enrollment_agreement` today; other kinds resolve to `unsupported`. */
    kind: string;
    id: string;
    /** The Work View's reason, carried for display only. */
    reason: string | null;
};

type FocusAssignment = { id: string; subjectType?: "child" | "staff" | null };
type FocusView = { assignments: FocusAssignment[] } | null | undefined;

/** The slice of the canonical scheduling projection this resolution reads. */
export type SchedulingFocusProjection = {
    current?: FocusView;
    proposed?: FocusView;
    /** Committed, future-dated views. Present on the canonical projection; not listed by the card. */
    upcoming?: Array<{ assignments: FocusAssignment[] }> | null;
    enrollmentAgreementId?: string | null;
};

export type SchedulingFocusResolution =
    | { status: "none" }
    | { status: "assignment"; assignmentId: string; bucket: "current" | "proposed" | "upcoming" }
    /** The assignment the row named is not a current, proposed or upcoming commitment any more. */
    | { status: "assignment_gone"; assignmentId: string }
    /** The agreement the row named is the one this schedule is for, and it still has no commitment. */
    | { status: "agreement_unscheduled"; agreementId: string }
    /** The agreement the row named now has a committed schedule — the gap closed since the row was read. */
    | { status: "agreement_scheduled"; agreementId: string }
    /** This schedule is for a different agreement (or none is recorded) — the row's cannot be confirmed here. */
    | { status: "agreement_elsewhere"; agreementId: string }
    | { status: "unsupported"; kind: string };

export function resolveSchedulingFocus(
    projection: SchedulingFocusProjection | null | undefined,
    subjectKind: "child" | "staff",
    source: DurableRecordFocusSource | null | undefined,
): SchedulingFocusResolution {
    const id = (source?.id ?? "").trim();
    if (!source || !id) return { status: "none" };
    const mine = (a: FocusAssignment) => (a.subjectType ?? "child") === subjectKind;
    if (source.kind === "schedule_assignment") {
        const has = (view: FocusView) => (view?.assignments ?? []).some((a) => a.id === id && mine(a));
        if (has(projection?.current)) return { status: "assignment", assignmentId: id, bucket: "current" };
        if (has(projection?.proposed)) return { status: "assignment", assignmentId: id, bucket: "proposed" };
        if ((projection?.upcoming ?? []).some((view) => has(view))) {
            return { status: "assignment", assignmentId: id, bucket: "upcoming" };
        }
        return { status: "assignment_gone", assignmentId: id };
    }
    if (source.kind === "enrollment_agreement") {
        const agreementId = (projection?.enrollmentAgreementId ?? "").trim();
        if (agreementId !== id) return { status: "agreement_elsewhere", agreementId: id };
        const committed = (projection?.current?.assignments ?? []).some(mine)
            || (projection?.upcoming ?? []).some((view) => view.assignments.some(mine));
        return committed ? { status: "agreement_scheduled", agreementId: id } : { status: "agreement_unscheduled", agreementId: id };
    }
    return { status: "unsupported", kind: source.kind };
}

/** The operator-facing sentence for a resolution that needs one; null when the card speaks for itself. */
export function schedulingFocusNotice(resolution: SchedulingFocusResolution): string | null {
    switch (resolution.status) {
        case "assignment_gone":
            return "The assignment this view pointed to has changed since the list was read. Showing the current schedule.";
        case "agreement_unscheduled":
            return "This enrollment agreement has no committed schedule yet.";
        case "agreement_scheduled":
            return "This agreement now has a committed schedule. The view will update.";
        case "agreement_elsewhere":
            return "The agreement this view pointed to is not the one this schedule is for. Showing the current schedule.";
        default:
            return null;
    }
}
