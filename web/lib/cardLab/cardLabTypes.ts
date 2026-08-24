/**
 * Candidate-card evidence shapes for the Local Design Lab.
 *
 * These mirror what a real `build<X>CardEvidence(context)` would return: already-resolved,
 * already-formatted operational answers. No card in the lab reads a record, and no shape here
 * carries review metadata — provenance and open questions live in the lab's review panel, never
 * in the card.
 */

export type StepState = "done" | "current" | "future";

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

export type HealthFact = {
    name: string;
    /** Rendered in the family's risk red — reserved for genuinely severe facts. */
    severe?: boolean;
    detail?: string | null;
};

export type HealthRequirement = {
    name: string;
    value: string;
    missing?: boolean;
};

export type HealthEvidence = {
    answerLine: string;
    supportingLine: string;
    statusChip?: string | null;
    allergies: HealthFact[];
    medical: HealthFact[];
    medications: HealthFact[];
    dietary: HealthFact[];
    requirements: HealthRequirement[];
    emergencyCount: number;
    emergencyPrimary: string | null;
    emergencyDetail: string | null;
};

export type StaffPerson = {
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

export type StaffEvidence = {
    answerLine: string;
    supportingLine: string;
    people: StaffPerson[];
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
    /** Already signed and formatted by the evidence builder — the card never does arithmetic. */
    amount: string;
    /** credit = money toward the balance (payments, subsidy, discounts). Drives colour only. */
    kind: "charge" | "credit";
};

export type BillingPayer = {
    name: string;
    share: string;
    method: string;
};

export type BillingEvidence = {
    answerLine: string;
    supportingLine: string;
    statusChip: string | null;
    period: { label: string; lines: { label: string; value: string; emphasis?: boolean }[] };
    dueLabel: string;
    dueValue: string;
    pastDue: { amount: string; oldest: string; age: string; note: string | null } | null;
    ledger: LedgerEntry[];
    payers: BillingPayer[];
};
