/**
 * Candidate-card evidence shapes for the Local Design Lab.
 *
 * These mirror what a real `build<X>CardEvidence(context)` would return: already-resolved,
 * already-formatted operational answers. No card in the lab reads a record, and no shape here
 * carries review metadata — provenance and open questions live in the lab's review panel, never
 * in the card.
 */

/** `collapsed` is a projection artefact — N events the card is not showing, not an event. */
export type StepState = "done" | "current" | "future" | "collapsed";

/** One column of a progression band — shared by Journey (stages) and Attendance (day events). */
export type ProgressionStep = {
    state: StepState;
    /** Uppercase micro-label above the value. Journey leaves this null; Attendance uses it. */
    label?: string | null;
    value: string;
    detail?: string | null;
    /** Second, quieter line — Journey's outcome, Attendance's room. */
    note?: string | null;
};

export type JourneyEvidence = {
    processLabel: string;
    answerLine: string;
    supportingLine: string;
    stages: ProgressionStep[];
};

/**
 * One critical safety fact — what an adult needs BEFORE they can safely care for the child.
 * Deliberately a separate type from an ordinary need: critical is not "a need with high
 * severity", it is a different operational object, with a care instruction attached.
 */
export type HealthCritical = {
    name: string;
    severity: string;
    reaction: string | null;
    /** What staff do, and where the thing they need is kept. */
    response: string | null;
};

/** A medication, shown WITH the need it supports when that relationship exists. */
export type HealthMedication = {
    name: string;
    detail: string | null;
};

/**
 * An ongoing care need. Medication nests inside the need it supports, because that is how an
 * operator understands it — canonical ownership stays separate underneath.
 */
export type HealthNeed = {
    name: string;
    detail: string | null;
    medications: HealthMedication[];
};

export type HealthRequirement = {
    name: string;
    value: string;
    missing?: boolean;
};

export type HealthEvidence = {
    /** Specimen label for the lab only — never rendered inside the card. */
    caseLabel: string;
    /** Empty means the region does not render at all — never "No alerts". */
    critical: HealthCritical[];
    needs: HealthNeed[];
    /** Medications with no associated need. */
    unattachedMedications: HealthMedication[];
    requirements: HealthRequirement[];
    emergencyCount: number;
    emergencyPrimary: string | null;
};

/** A person on the CHILD-grain Care Team card. Not the employee-grain Staff card. */
export type CareTeamPerson = {
    id: string;
    name: string;
    /** The relationship pill — why this person is on this child's card. */
    relationship: string;
    /** True for the operational owner of the child right now. */
    lead?: boolean;
    /** Two label-over-value facts, in the Children row idiom. Labels are per-person truth —
     *  a room teacher is placed by room and shift; an enrollment owner is not. */
    facts: { label: string; value: string }[];
};

export type CareTeamEvidence = {
    answerLine: string;
    supportingLine: string;
    people: CareTeamPerson[];
    othersCount: number;
    othersLabel: string;
};

export type AttendanceEvidence = {
    answerLine: string;
    supportingLine: string;
    statusChip: string;
    statusTone: "ready" | "due" | "neutral";
    /** Expected window, as minutes from midnight, for the day track. */
    expected: { fromLabel: string; toLabel: string; fromMin: number; toMin: number };
    /** Actual span so far, as minutes from midnight. */
    actual: { fromMin: number; toMin: number };
    events: ProgressionStep[];
    /** Ticks positioned on the track, as minutes from midnight. */
    tickMinutes: number[];
    correctionNote: string | null;
    recentDays: { day: string; state: "present" | "absent" | "partial"; hours: string }[];
};

export type LedgerEntry = {
    when: string;
    label: string;
    /**
     * Already signed and formatted by the evidence builder — the card never does arithmetic.
     * Direction is account balance: a charge INCREASES what is owed (`+`), a payment, credit,
     * discount or subsidy REDUCES it (`−`). The sign is in the text, so the meaning survives
     * without colour.
     */
    amount: string;
    /** Reinforces the sign; never the only carrier of it. */
    kind: "charge" | "credit";
};

export type BillingPayer = {
    name: string;
    share: string;
    method: string;
};

export type BillingEvidence = {
    /** Specimen label for the lab only — never rendered inside the card. */
    caseLabel: string;
    period: { label: string; lines: { label: string; value: string; emphasis?: boolean }[] };
    dueLabel: string;
    dueValue: string;
    pastDue: { amount: string; oldest: string; age: string; note: string | null } | null;
    ledger: LedgerEntry[];
    payers: BillingPayer[];
};

/**
 * Employee-grain Staff evidence.
 *
 * Every field here has a canonical owner today:
 *   identity     persons
 *   employment   employments / employment_positions  → PersonEmploymentPeriod
 *   assignment   schedule_assignments (subject_type = 'staff')
 *   today        staff_presence_events               → StaffPresenceDayState
 *   contact      persons
 *
 * Qualifications and credentials are DELIBERATELY absent — no store exists (see the lab's
 * review panel). Adding them here would be inventing employment truth to make a specimen richer.
 */
export type StaffEvidence = {
    name: string;
    stateLabel: string;
    stateTone: "ready" | "due" | "neutral";
    answerLine: string;
    supportingLine: string;
    employment: { label: string; value: string }[];
    today: { label: string; value: string }[];
    presenceLine: string | null;
    assignments: { room: string; when: string }[];
    contact: { email: string | null; phone: string | null };
};
