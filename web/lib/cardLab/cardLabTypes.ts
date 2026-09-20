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
    /**
     * WHO OWES THIS ROW — charge-grain, exactly as `financial_responsibility_allocations` holds it.
     * "Split" where one charge's allocations name two people; null where no allocation exists at
     * all, which is a different state from an allocation that names nobody.
     */
    responsibleParty: string | null;
    /** An allocation exists and deliberately names no party. Rendered as a state, not as a blank. */
    responsibilityUnassigned: boolean;
    /** Owed by the named party, and owed by nobody yet — a partially allocated obligation is both. */
    responsibilityAssignedCents?: number;
    responsibilityUnassignedCents?: number;
    label: string;
    /** Signed and formatted upstream. Account-balance direction: charge +, payment/credit −. */
    amount: string;
    kind: "charge" | "credit";
    status?: string | null;
    source?: string | null;
    /**
     * The charge this row IS, so the surface can offer the transitions it already qualifies for.
     *
     * Carried rather than displayed. Without it the ledger can describe a posted charge and cannot
     * act on it, which is how `charge.reverse` ended up with no reachable operator path at all.
     */
    /**
     * ── WHY THIS REDUCTION EXISTS ────────────────────────────────────────────────────────────
     *
     * Present only where the row IS a reduction. The ledger could always show that money moved and
     * not what decided it: a row read `Credit −$260.06` while the table that records the decision —
     * which policy, on what basis, capped or not — was never read.
     *
     * `concept` is the operator's word for the row and is deliberately one of FOUR: a discount is a
     * price decision under a policy, a credit is money owed back, an adjustment corrects an
     * established position, and a reversal undoes a specific earlier one. They share infrastructure;
     * they are not the same thing.
     *
     * Every field is a stored fact or an explicit absence. `recurrenceLabel` is empty when the model
     * genuinely cannot say, rather than claiming "one-time".
     */
    /** `reversal` | `credit` | `replacement` — the correction's own record of what it is. */
    correctionKind?: string | null;
    reduction?: {
        applicationId: string;
        concept: "discount" | "credit" | "adjustment" | "reversal";
        conceptLabel: string;
        recurrenceLabel: string;
        decidedBy: string;
        basisSummary: string | null;
        explanation: string | null;
        sourceChargeId: string | null;
        periodLabel: string | null;
        reversesApplicationId: string | null;
        reversedByApplicationId: string | null;
    } | null;
    chargeId?: string | null;
    /**
     * WHICH LENS THIS ROW ANSWERS TO — decided by `ledgerLensOf` where the canonical row still
     * exists, never re-derived from the formatted entry.
     *
     * The card cannot classify this itself: by the time an entry reaches it, the amount is a string
     * and the category is a key, and "is this a reduction" is a question `buildFinancialsCardVM`
     * already answers with `isCollectibleOffsetRow`. A second copy of those category lists in the
     * presentation layer would drift the first time a category was added, and the two Financials
     * surfaces would then disagree about what a row IS while agreeing about what it costs.
     */
    lens: "charges" | "credits" | "funding";
    /** Server-decided, never re-derived here: a draft that may be posted. */
    offersPost?: boolean;
    /** Server-decided: posted, not void, not already reversed, not itself a correction. */
    offersReverse?: boolean;
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
    /**
     * THE NET OBLIGATION — gross plus discounts, funding and adjustments.
     *
     * The field keeps its original name because every fixture and the design lab already write it,
     * but the card no longer LABELS it "Responsibility". That word now belongs only to the split
     * below, and one dollar amount may not appear under two different financial concepts.
     */
    familyResponsibility: string;
    /**
     * WHO OWES THE NET, from Thread 6's persisted allocations.
     *
     * `allocated` and `unassigned` come from the canonical view model and sum to the obligation
     * above by construction; nothing here adds them up to check. `unassigned` is null when there is
     * none, and is otherwise the operator's most actionable fact on the card — money nobody has
     * been made responsible for. It is stated rather than quietly folded into the household.
     */
    responsibility: {
        allocated: string;
        parties: { name: string; amount: string }[];
        unassigned: string | null;
    } | null;
    /**
     * FUNDING THAT HAS NOT ARRIVED. Distinct from the `funding` rows above, which are money that
     * actually came in. An expectation reduces nothing owed, so it is never a line in a total.
     */
    expectedFunding: { label: string; amount: string | null }[];
    /**
     * WHAT MAY BE ASKED OF THE FAMILY TODAY — present only while a submitted or accepted claim is
     * suppressing a bounded amount. With nothing suppressed this equals the balance and a second
     * line would repeat it, so it is null instead.
     */
    collectibleNow: string | null;
    paymentsReceived: string;
    currentBalance: string;
    /**
     * DUE — WHAT MAY BE ASKED OF THIS ACCOUNT TODAY, ALWAYS STATED.
     *
     * This is NOT a new financial figure and no arithmetic was invented for it. It is Thread 9's
     * governed `currentlyCollectibleCents` — outstanding less the amount a submitted or accepted
     * claim is suppressing, never below zero — which already had one canonical owner and one
     * meaning before this field existed.
     *
     * It differs from `collectibleNow` only in WHEN it is rendered, not in what it is:
     * `collectibleNow` is a conditional SECOND line inside the period breakdown, present only while
     * something is actually suppressed so the breakdown does not repeat the balance. `dueNow` is an
     * unconditional headline figure for the account summary, where the operator's question is
     * simply "what can I collect", and an absent answer reads as zero rather than as "same as the
     * balance". Both resolve from the same authority; neither computes.
     *
     * The other candidate names for this slot were rejected on evidence: `dueLabel` is prose about
     * a due DATE ("Was due Aug 15"), and the balance is already `currentBalance`.
     */
    dueNow: string;
    /**
     * MONEY THE FAMILY HAS ALREADY GIVEN THAT IS NOT YET SPENT — and only the spendable part.
     *
     * `null` when there is none, which is the ordinary case and must stay SILENT: a "$0.00" prepaid
     * metric on every account would be noise occupying a slot meant for a fact. Present only when
     * the organisation actually holds this family's money.
     *
     * It is NOT subtracted from `currentBalance`. Current balance sums what was APPLIED, so held
     * money does not pay anything down until it is allocated — which is why `owes $0 with $200
     * prepaid` is two figures and never one `-$200`.
     */
    availablePrepaid: string | null;
    /**
     * Money received and RESTRICTED — a held deposit (Payments V1 · W4).
     *
     * A separate figure from `availablePrepaid` and never merged into it: one is money an operator
     * may spend on an obligation now, the other is money the organisation is holding and may not.
     * Combining them would offer a family's deposit for allocation.
     *
     * Like prepaid it is `null` when there is none, so zero stays silent, and like prepaid it is NOT
     * subtracted from `currentBalance` — a family that owes $500 with $500 held still owes $500.
     */
    heldFunds: string | null;
    dueLabel: string;
};

/** The compact card's reduced content — the same read model, fewer questions answered. */
export type FinancialsCompact = {
    /**
     * The headline, and ONLY when it says something the lines below do not.
     *
     * It used to be the balance whenever nothing was past due — while `lines` already carried
     * "Current balance" with that same figure, so the card printed the number twice, once without a
     * label. Null now means "the lines already say this"; the card renders no headline rather than a
     * detached amount.
     */
    dueLine: string | null;
    lines: { label: string; value: string }[];
    /** Null when payment setup is unknown — the card then says nothing rather than claiming absence. */
    paymentLine: string | null;
    paymentHealthy: boolean;
};

export type FinancialsEvidence = {
    /** Specimen label for the lab only — never rendered inside the card. */
    caseLabel: string;
    compact: FinancialsCompact;
    /** Subjects a charge may be for. Household is always present; children when they exist. */
    subjects: string[];
    period: FinancialsPeriod;
    /** `age` is the DURATION alone ("1 day"); the surface supplies the words "past due". */
    pastDue: { amount: string; oldest: string; age: string; note: string | null } | null;
    ledger: LedgerEntry[];
    payers: FinancialsPayer[];
    payment: {
        autopayLabel: string | null;
        autopayHealthy: boolean;
        nextChargeLabel: string | null;
    };
    /** Quiet context line on the summary card — never a ledger reproduction. */
    /** Detail-only: forward-looking facts, and only where authoritative. */
    upcoming: { label: string; value: string; unowned?: boolean }[];
    /**
     * Detail-only: the receipts themselves, and what each one is currently answering.
     *
     * Every figure here arrives already formatted from canonical truth. The card must not add them
     * up, difference them, or decide what "applied" means — a receipt's applied and unapplied money
     * are the account VM's answers, which are the service's answers.
     */
    payments: FinancialsEvidencePayment[];
    /** Manual reductions recorded against this account, newest first. Formatting only. */
    adjustments: FinancialsEvidenceAdjustment[];
};

/**
 * A manual reduction, as the operator reads it.
 *
 * `appliedById` is the application id the reversal action addresses. It is carried rather than
 * displayed: reversing needs it, and an operator cannot be asked to know it.
 */
export type FinancialsEvidenceAdjustment = {
    applicationId: string;
    /** credit / adjustment / discount, in the operator's words. */
    categoryLabel: string;
    /** Signed money, already formatted — e.g. "−$25.00". */
    amountLabel: string;
    /** True when this lowers what the family owes. The card asks; it does not infer from a string. */
    reducesObligation: boolean;
    reason: string | null;
    periodLabel: string | null;
    recordedOn: string | null;
    /** Which child's enrolment it was recorded against, when the account has more than one. */
    subjectName: string | null;
    /**
     * True once the reduction's charge is posted. A draft is recorded but NOT yet owed — the money
     * has not moved, and the card must not imply that it has.
     */
    applied: boolean;
    /** A reduction already reversed cannot be reversed again. */
    reversed: boolean;
    /** True when this row IS a reversal of an earlier one. */
    isReversal: boolean;
};

export type FinancialsEvidencePayment = {
    paymentId: string;
    receivedLabel: string;
    /** The household the receipt was taken against. Null when canonical data cannot name it. */
    payerLabel: string | null;
    receivedOn: string | null;
    method: string | null;
    appliedLabel: string;
    unappliedLabel: string;
    /** Raw cents, so the card can ASK whether there is money to apply without doing arithmetic. */
    unappliedCents: number;
    applications: FinancialsEvidenceApplication[];
};

export type FinancialsEvidenceApplication = {
    allocationId: string;
    chargeId: string | null;
    chargeLabel: string;
    amountLabel: string;
    /** `active` is answering an obligation now; `reversed` is history that no longer counts. */
    status: string;
    reversalReason: string | null;
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
    /**
     * WHETHER CONFIRMING WILL WAIT FOR REVIEW, resolved by the server from the tenant's
     * `posting_review` policy OR'd with the template's own flag.
     *
     * The command previews the act it will PERFORM. Before this existed the preview hardcoded
     * "Creates a draft", which was true of every tenant when it was written and is not true of a
     * tenant that has configured no review boundary — the operator was told the balance would not
     * move, and it moved.
     */
    reviewRequired: boolean;
    /** The code-owned charge category, for grain decisions. Optional: older payloads omit it. */
    categoryKey?: string;
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
    /**
     * Resolving the current work — carried apart from `actions` because it is not a peer of them.
     *
     * The other commands start something new; this one closes what the stage already says is open,
     * so it reads under the stage's own line as a consequence of it rather than as a fifth button
     * competing for the same row. Splitting it is also what lets the command row stay one row at a
     * consistent size: five content-sized commands wrapped, and a wrapped command reads as a
     * separate, lesser group.
     *
     * The CARD does not decide which command this is — it renders whatever the runtime puts here.
     * Null or absent whenever the stage projects no outcome affordance, which is most stages — and
     * absent in every design-lab specimen, which has no runtime to resolve work against. Optional
     * for that reason rather than to spare callers the field.
     */
    outcomeAction?: ProcessAction | null;
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
