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

/** Where a health fact came from — reused provenance, not a new audit system. */
export type HealthProvenance = {
    /** "Parent reported", "Document extraction", "Operator confirmed". */
    source: string;
    detail: string | null;
    confirmed: boolean;
};

export type HealthAllergyDetail = {
    allergen: string;
    severity: string;
    reaction: string;
    careInstruction: string;
    treatment: string | null;
    emergencyMedication: string | null;
    effective: string;
    provenance: HealthProvenance;
};

export type HealthConditionDetail = {
    condition: string;
    symptoms: string | null;
    careInstruction: string;
    restrictions: string | null;
    relatedMedications: string[];
    effective: string;
    provenance: HealthProvenance;
};

export type HealthMedicationDetail = {
    medication: string;
    dosage: string;
    frequency: string;
    administration: string;
    storage: string;
    expires: string | null;
    /** Authorization is a REQUIREMENT, kept distinct from the medication fact itself. */
    authorization: { label: string; satisfied: boolean };
    relatedTo: string | null;
    provenance: HealthProvenance;
};

export type HealthDocumentRow = {
    docType: string;
    received: string;
    expires: string | null;
    status: string;
    version: string;
    source: string;
};

export type HealthRequirementRow = {
    requirement: string;
    state: "satisfied" | "missing" | "expiring";
    stateLabel: string;
    evidence: string | null;
    due: string | null;
    appliesBecause: string;
};

export type HealthEmergencyContact = {
    name: string;
    relationship: string;
    phone: string;
    order: string;
};

export type HealthProfileFact = { label: string; value: string };

export type HealthDetailEvidence = {
    childLabel: string;
    critical: HealthCritical[];
    allergies: HealthAllergyDetail[];
    conditions: HealthConditionDetail[];
    medications: HealthMedicationDetail[];
    profile: HealthProfileFact[];
    documents: HealthDocumentRow[];
    requirements: HealthRequirementRow[];
    emergencyContacts: HealthEmergencyContact[];
    lastUpdated: string;
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
    /** Canonical `charges.charge_type` / payment kind, for the detail ledger's Type column. */
    type: string;
    label: string;
    /** Signed and formatted upstream. Account-balance direction: charge +, payment/credit −. */
    amount: string;
    kind: "charge" | "credit";
    status?: string | null;
    source?: string | null;
};

export type FinancialsPayer = {
    name: string;
    share: string;
    method: string;
    /** A funding source is not an ordinary parent payer and must not be drawn as one. */
    funding?: boolean;
    methodIssue?: string | null;
};

/**
 * Current-period reconciliation, in the platform's own financial grammar.
 *
 * `CHARGE_CATEGORIES` splits into two groups, and the split is the whole point:
 *
 *   gross charges   tuition · deposit · consumable_fee · late_pickup · one_time · fee
 *   reductions      discount · credit · adjustment · subsidy_offset
 *
 * `subsidy_offset` is a CHARGE CATEGORY, not a payment — so subsidy reduces FAMILY
 * RESPONSIBILITY. Payments are a separate object (`payments` + `payment_allocations`) and reduce
 * BALANCE. Collapsing the two into one total is the error this shape exists to prevent.
 *
 *   grossCharges − discountsCredits − funding = familyResponsibility
 *   familyResponsibility − paymentsReceived   = currentBalance
 *   pastDue ⊆ currentBalance                  (the portion whose due_date has passed)
 */
export type FinancialsPeriod = {
    label: string;
    charges: { label: string; value: string }[];
    reductions: { label: string; value: string }[];
    funding: { label: string; value: string }[];
    /** Only totals carry weight. Individual rows stay regular. */
    familyResponsibility: string;
    paymentsReceived: string;
    currentBalance: string;
    dueLabel: string;
};

export type FinancialsEvidence = {
    /** Specimen label for the lab only — never rendered inside the card. */
    caseLabel: string;
    period: FinancialsPeriod;
    pastDue: { amount: string; oldest: string; age: string; note: string | null } | null;
    ledger: LedgerEntry[];
    payers: FinancialsPayer[];
    payment: {
        autopayLabel: string | null;
        autopayHealthy: boolean;
        nextChargeLabel: string | null;
    };
    /** Quiet context line on the summary card — never a ledger reproduction. */
    historyLine: string;
    /** Detail-only: forward-looking facts, and only where authoritative. */
    upcoming: { label: string; value: string; unowned?: boolean }[];
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

/** A ledger period group for the Financials detail. */
export type FinancialsLedgerPeriod = {
    label: string;
    summary: string;
    open: boolean;
    entries: LedgerEntry[];
};

/**
 * Add charge — driven entirely by `financial_charge_templates`, the L1 commercial configuration.
 * The template decides whether the amount is editable, when the charge becomes billable, and who
 * is responsible; the card hardcodes none of it.
 */
export type ChargeTemplateOption = {
    key: string;
    label: string;
    /** `amount_strategy` — fixed locks the amount, manual lets the operator set it. */
    amountStrategy: "fixed" | "manual" | "rate_derived";
    amount: string | null;
    /** `billable_on` — decides the default due date. */
    billableOn: string;
    /** `responsibility` — household | employer | third_party | agency. */
    responsibility: string;
    requiresSubject: boolean;
    requiresNote: boolean;
};

export type AddChargeSpecimen = {
    template: ChargeTemplateOption;
    subject: string;
    amount: string;
    period: string;
    due: string;
    note: string;
    previewBefore: string;
    previewAfter: string;
    blockers: string[];
};

/** A configured Business Process, as the combined Process card consumes it. */
export type ProcessStage = {
    label: string;
    state: "done" | "current" | "future";
    when: string | null;
    outcome: string | null;
};

export type ProcessAction = { label: string; primary?: boolean };

export type ProcessEvidence = {
    processLabel: string;
    stages: ProcessStage[];
    currentStageLabel: string;
    workLine: string;
    dueLine: string | null;
    actions: ProcessAction[];
    stillNeeded: string[];
};

/** A health fact configured to project outside the Health card. */
export type SafetySignal = {
    label: string;
    tone: "critical" | "dietary" | "medication";
    /** Which configured surfaces this signal projects to. */
    surfaces: string[];
};
