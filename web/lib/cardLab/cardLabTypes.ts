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
    /**
     * The empty state's line, when the default cannot be stated truthfully.
     *
     * The specimen's default reads "Expected 8:00 AM – 4:30 PM. Nothing recorded yet." Alloy has no
     * expected arrival or departure TIME — scheduling is day-grain, and `schedule_patterns` carries
     * start_date/end_date, not times of day — so production supplies a line built from what it does
     * own rather than printing an empty window. Absent in the lab, where the fixture has both times.
     */
    emptyLine?: string | null;
};

export type LedgerEntry = {
    when: string;
    /**
     * WHO OR WHAT the financial item is for — household, or a specific child. This is a different
     * dimension from the payer, and the two must never be collapsed: a charge for Avery may be
     * paid by Jordan, and a household charge has no child subject at all.
     */
    subject: string;
    /**
     * Canonical charge category key. The card NEVER renders this — it renders
     * `chargeCategoryLabel(type)` from `lib/financials/chargeCategories.ts`, which the
     * configuration catalog already owns. No ad-hoc display map lives in the card.
     */
    type: string;
    /** Resolved via `resolveGlMapping` from the charge category. Null = genuinely unmapped. */
    glCode: string | null;
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

/** The compact card's reduced content — the same read model, fewer questions answered. */
export type FinancialsCompact = {
    dueLine: string;
    lines: { label: string; value: string }[];
    paymentLine: string;
    paymentHealthy: boolean;
};

export type FinancialsEvidence = {
    /** Specimen label for the lab only — never rendered inside the card. */
    caseLabel: string;
    compact: FinancialsCompact;
    /** Subjects a charge may be for. Household is always present; children when they exist. */
    subjects: string[];
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
    /** `occurs_on` — now | event_date | service_period_start. Decides the SERVICE date. */
    occursOn: string;
    /** `billable_on` — immediate | offset_days | next_billing_cycle. Decides the BILLING period. */
    billableOn: string;
    /** `responsibility` — household | employer | third_party | agency. */
    responsibility: string;
    /** Whether the operator may override the template's dating. */
    allowsDateOverride: boolean;
    /** Whether the operator may target a specific payer, or the split applies. */
    payerTargeting: "default_split" | "operator_selectable" | "single_payer" | "third_party";
    requiresSubject: boolean;
    requiresNote: boolean;
};

export type AddChargeSpecimen = {
    template: ChargeTemplateOption;
    subject: string;
    amount: string;
    /** `charges.service_date` — when the thing happened. */
    serviceDate: string;
    /** The billing period the charge lands in, derived from billable_on unless overridden. */
    period: string;
    /** `charges.due_date`. */
    due: string;
    /** Which date the operator changed, if any. */
    overridden: string | null;
    chargeTo: string;
    /** Only rendered when allocation is authoritative. */
    allocation: { payer: string; share: string; amount: string }[] | null;
    note: string;
    previewBefore: string;
    previewAfter: string;
};

/** A configured Business Process, as the combined Process card consumes it. */
/**
 * A stage node. The PLATFORM owns the anatomy — node shape, state treatment, connector, marker
 * placement, typography, truncation, density, and the hard cap of TWO supporting lines.
 * CONFIGURATION owns only which canonical facts populate those two slots.
 *
 * This is deliberately not a mini-layout builder: there is no per-stage composition, no arbitrary
 * schema, and no business truth stored in presentation config. A slot holds a projection of an
 * authoritative fact, resolved at read time.
 */
export type ProcessStage = {
    label: string;
    state: "done" | "current" | "future";
    /** Configured slot 1 — date/time, rank, amount. */
    primarySupport: string | null;
    /** Configured slot 2 — location, program, outcome, count. Never a third line. */
    secondarySupport: string | null;
};

/** A participant projected onto the stage they are actually at. */
export type RailParticipant = {
    name: string;
    /** First name only on the rail — the full name lives in expanded detail. */
    shortName: string;
    imageUrl?: string | null;
    scoped?: boolean;
};

/**
 * A command on the Process card.
 *
 * `key` is the registered action's identity and is what execution keys on. The lab's specimens
 * omit it — they are fixtures, and a fixture has nothing to execute — but every production command
 * carries one, because a command matched by its LABEL is a command that silently becomes a
 * different command the moment configuration renames it.
 */
export type ProcessAction = {
    label: string;
    primary?: boolean;
    /** Registered action identity. Absent only in design-lab fixtures. */
    key?: string;
    /** Configured but not currently executable — the platform's own verdict, never the card's. */
    disabled?: boolean;
    /** Why it is unavailable, as the action system stated it. */
    disabledReason?: string | null;
    /** Executes through the shared command host. Absent in the lab. */
    onInvoke?: () => void;
    /**
     * Operator intent ahead of the click — hover, keyboard focus, or opening the group this command
     * sits in. The runtime decides what that is worth warming; the card only reports the gesture,
     * and a command that warms nothing simply omits it. Absent in the lab.
     */
    onIntent?: () => void;
    /**
     * Secondary operations on the SAME operational concept, presented behind this control.
     *
     * Present only when the command runtime has already decided these belong together — the
     * card never groups on its own. Tour is the reference case: one state-bearing control
     * ("Tour scheduled · Sep 8, 10:00 AM") with reschedule / cancel / send invitation behind
     * it, instead of four unrelated buttons from which the operator has to infer the state.
     *
     * Each entry is an ordinary action and executes exactly as a top-level one does.
     */
    menu?: ProcessAction[];
};

/**
 * A child's own participation. FIRST-CLASS truth at its own grain — not a chip, not decoration.
 * The case's stage and a child's stage are both authoritative and may legitimately differ.
 */
export type ProcessChildState = {
    name: string;
    /** Operator-facing participant state, e.g. "Waitlisted". */
    stage: string;
    /**
     * The stage this participant is projected onto — matches a `ProcessStage.label` exactly.
     * Explicit rather than string-matched: "Waitlisted" and "Waitlist" are different vocabularies
     * and inferring one from the other would silently drop a marker.
     */
    stageKey: string;
    /** Since when, where the participant state carries one. */
    since: string | null;
    /** True when the queue/context was scoped to this child. */
    scoped?: boolean;
    /** Actions whose SUBJECT is this child, never the case. */
    actions: ProcessAction[];
    imageUrl?: string | null;
};

/**
 * One row of CANONICAL activity — the same projection the Focus Panel activity mode reads.
 *
 * The card persists nothing and infers nothing. It never renders a historical STAGE event, because
 * no durable stage-history projection exists: an activity row is something that happened and was
 * recorded, not a reconstruction of when a stage was entered.
 */
export type ProcessActivityRow = {
    /**
     * The canonical event id. Rows are keyed on THIS, never on `label`+`when` — `when` is a
     * FORMATTED, minute-granular string, and two canonical events with the same title in the same
     * minute collide on it. That was observed live 18 times in one journey, and
     * `currentWorkActivityRowKey` exists to own the rule.
     */
    id?: string | null;
    label: string;
    when: string;
};

export type ProcessEvidence = {
    caseLabel: string;
    /** The Focus Panel subject. Always the case today — see the grain doctrine. */
    subjectLabel: string;
    /** The lens the panel was opened from. Context only; it NEVER decides the stage. */
    sourceWorkView: string | null;
    /** Child participations, when the subject is a case with more than one child. */
    childStates: ProcessChildState[];
    processLabel: string;
    stages: ProcessStage[];
    currentStageLabel: string;
    workLine: string;
    dueLine: string | null;
    /** Actions whose SUBJECT is the case. */
    actions: ProcessAction[];
    stillNeeded: string[];
    /**
     * Canonical activity, revealed ON DEMAND. **No row is printed onto the card face** — the whole
     * list lives behind the `Recent activity` trigger in the foot row, so activity costs the card
     * no height beyond the row it shares with the participants. Omitted entirely when empty: a
     * control that opens an empty menu is a broken promise.
     *
     * Whether a placement carries activity at all is configuration. The bound is on the MENU's
     * height, never on the truth — the menu scrolls rather than silently truncating the record.
     */
    activity: ProcessActivityRow[];
    /**
     * Present only when the process has participant grain at all. Assignment and Billing omit it,
     * and the card renders no children region — there is no Enrollment-specific section here.
     */
    participantsLabel: string | null;
};

/** A health fact configured to project outside the Health card. */
export type SafetySignal = {
    label: string;
    tone: "critical" | "dietary" | "medication";
    /** Which configured surfaces this signal projects to. */
    surfaces: string[];
};
