/**
 * Fixture evidence for the Local Design Lab.
 *
 * The subject is Avery Johnson, taken from the platform's own
 * `buildDemoFocusPanelSummaryViewModel()` so the candidate cards and the REAL Household,
 * Children, Readiness and Current Work cards in the combined review describe one family.
 *
 * This is specimen data. It is never imported by production code, and the lab labels it as
 * fixture data OUTSIDE every card.
 */

import type {
    AttendanceEvidence,
    AddChargeSpecimen,
    ChargeTemplateOption,
    FinancialsEvidence,
    FinancialsCompact,
    FinancialsLedgerPeriod,
    ProcessChildState,
    ProcessEvidence,
    SafetySignal,
    HealthDetailEvidence,
    HealthEvidence,
    JourneyEvidence,
    CareTeamEvidence,
    StaffEvidence,
} from "@/lib/cardLab/cardLabTypes";

export const LAB_SUBJECT = {
    child: "Avery Johnson",
    household: "Johnson Family",
    site: "North Campus",
    program: "Toddler",
    room: "Sunflower Room",
    today: "Mon, Aug 24",
} as const;

/** Stages of the configured Enrollment Business Process — the journey spine. */
export const JOURNEY_FIXTURE: JourneyEvidence = {
    processLabel: "Enrollment Journey",
    answerLine: "Enrolling since Aug 18 · day 22 of 5 stages",
    supportingLine: "",
    stages: [
        { state: "done", value: "Lead", detail: "Aug 2", note: null },
        { state: "done", value: "Tour", detail: "Aug 5 – 8", note: "Completed" },
        { state: "done", value: "Waitlist", detail: "Aug 9 – 18", note: "Offer accepted" },
        { state: "current", value: "Enrolling", detail: "Since Aug 18", note: "2 items remain" },
        { state: "future", value: "Enrolled", detail: "Expected Sep 2", note: null },
    ],
};

/**
 * Health specimens — three densities that prove the hierarchy, not a state matrix.
 *
 *   A  typical      one condition, one dietary restriction, requirements complete
 *   B  higher care  a severe allergy, a condition with its medication, one missing requirement
 *   C  complex      two critical facts, several needs, several medications
 */
export const HEALTH_TYPICAL: HealthEvidence = {
    caseLabel: "A · Typical child",
    critical: [],
    needs: [
        {
            name: "Asthma",
            detail: "Exercise-induced",
            medications: [{ name: "Albuterol inhaler", detail: "As needed · Sunflower Room" }],
        },
        { name: "Dietary", detail: "Dairy restriction · substitute oat milk", medications: [] },
    ],
    unattachedMedications: [],
    requirements: [
        { name: "Physical", value: "Jul 14" },
        { name: "Immunization", value: "Jul 14" },
        { name: "Medication authorization", value: "Jul 14" },
    ],
    emergencyCount: 3,
    emergencyPrimary: "Sam Rivera",
};

export const HEALTH_HIGHER_CARE: HealthEvidence = {
    caseLabel: "B · Higher-care child",
    critical: [
        {
            name: "Peanut allergy",
            severity: "Severe",
            reaction: "Anaphylaxis",
            response: "EpiPen · Sunflower Room cabinet",
        },
    ],
    needs: [
        {
            name: "Asthma",
            detail: "Exercise-induced",
            medications: [{ name: "Albuterol inhaler", detail: "As needed · Sunflower Room" }],
        },
        { name: "Dietary", detail: "Dairy restriction · substitute oat milk", medications: [] },
        { name: "Latex sensitivity", detail: "Contact rash", medications: [] },
    ],
    unattachedMedications: [],
    requirements: [
        { name: "Physical", value: "Jul 14" },
        { name: "Immunization", value: "Jul 14" },
        { name: "Medication authorization", value: "Missing", missing: true },
    ],
    emergencyCount: 3,
    emergencyPrimary: "Sam Rivera",
};

export const HEALTH_COMPLEX: HealthEvidence = {
    caseLabel: "C · Complex child",
    critical: [
        {
            name: "Peanut allergy",
            severity: "Severe",
            reaction: "Anaphylaxis",
            response: "EpiPen · Sunflower Room cabinet",
        },
        {
            name: "Seizure disorder",
            severity: "Active",
            reaction: "Tonic-clonic, 1–2 min",
            response: "Diastat · office fridge · call 911 after 5 min",
        },
    ],
    needs: [
        {
            name: "Asthma",
            detail: "Exercise-induced",
            medications: [{ name: "Albuterol inhaler", detail: "As needed · Sunflower Room" }],
        },
        {
            name: "Type 1 diabetes",
            detail: "Checks before lunch and at 3:00",
            medications: [
                { name: "Insulin pen", detail: "Per sliding scale · office fridge" },
                { name: "Glucagon", detail: "Emergency · office fridge" },
            ],
        },
        { name: "Dietary", detail: "No peanuts, no dairy · carb count at meals", medications: [] },
    ],
    unattachedMedications: [{ name: "Melatonin", detail: "Nap only · parent authorized" }],
    requirements: [
        { name: "Physical", value: "Jul 14" },
        { name: "Immunization", value: "Jul 14" },
        { name: "Medication authorization", value: "Missing", missing: true },
        { name: "Health care plan", value: "Missing", missing: true },
    ],
    emergencyCount: 4,
    emergencyPrimary: "Sam Rivera",
};

/** Health detail fixture — the higher-care child, at full record depth. */
export const HEALTH_DETAIL_FIXTURE: HealthDetailEvidence = {
    childLabel: "Avery Johnson",
    critical: HEALTH_HIGHER_CARE.critical,
    allergies: [
        {
            allergen: "Peanuts",
            severity: "Severe",
            reaction: "Anaphylaxis · hives, airway swelling",
            careInstruction: "No peanut products in the room. Wash hands before and after meals.",
            treatment: "Administer EpiPen, then call 911 and the primary contact.",
            emergencyMedication: "Epinephrine auto-injector · Sunflower Room cabinet",
            effective: "Since Jul 14, 2026 · active",
            provenance: {
                source: "Document extraction",
                detail: "Physical exam · Jul 14 · operator confirmed Jul 16",
                confirmed: true,
            },
        },
        {
            allergen: "Latex",
            severity: "Mild",
            reaction: "Contact rash",
            careInstruction: "Use nitrile gloves for first aid.",
            treatment: null,
            emergencyMedication: null,
            effective: "Since Jul 14, 2026 · active",
            provenance: { source: "Parent reported", detail: "Enrollment packet · Jul 12", confirmed: true },
        },
    ],
    conditions: [
        {
            condition: "Asthma",
            symptoms: "Exercise-induced wheezing",
            careInstruction: "Rest and inhaler after sustained activity. Notify parent if used twice in a day.",
            restrictions: "No sustained outdoor activity above 85°F",
            relatedMedications: ["Albuterol inhaler"],
            effective: "Since Jul 14, 2026 · active",
            provenance: { source: "Parent reported", detail: "Enrollment packet · Jul 12", confirmed: true },
        },
    ],
    medications: [
        {
            medication: "Albuterol inhaler",
            dosage: "2 puffs",
            frequency: "As needed (PRN)",
            administration: "Spacer required. Staff-administered.",
            storage: "Sunflower Room · locked cabinet",
            expires: "Mar 2027",
            authorization: { label: "Medication authorization missing", satisfied: false },
            relatedTo: "Asthma",
            provenance: { source: "Parent reported", detail: "Enrollment packet · Jul 12", confirmed: false },
        },
        {
            medication: "Epinephrine auto-injector",
            dosage: "0.15 mg",
            frequency: "Emergency only",
            administration: "Outer thigh. Call 911 immediately after.",
            storage: "Sunflower Room · locked cabinet",
            expires: "Mar 2027",
            authorization: { label: "Medication authorization missing", satisfied: false },
            relatedTo: "Peanut allergy",
            provenance: {
                source: "Document extraction",
                detail: "Physical exam · Jul 14 · operator confirmed Jul 16",
                confirmed: true,
            },
        },
    ],
    profile: [
        { label: "Dietary", value: "Dairy restriction · substitute oat milk" },
        { label: "Accommodations", value: "Weighted blanket at nap" },
        { label: "Physician", value: "Dr. Amara Osei · (541) 555-0117" },
        { label: "Health notes", value: "Tires quickly in heat; offer water breaks." },
    ],
    documents: [
        { docType: "Physical exam", received: "Jul 14, 2026", expires: "Jul 14, 2027", status: "Accepted", version: "v2", source: "Parent upload · extracted" },
        { docType: "Immunization record", received: "Jul 14, 2026", expires: null, status: "Accepted", version: "v1", source: "Parent upload · extracted" },
        { docType: "Medication authorization", received: "—", expires: null, status: "Not received", version: "—", source: "—" },
        { docType: "Health care plan", received: "Jul 20, 2026", expires: "Jul 20, 2027", status: "Accepted", version: "v1", source: "Operator upload" },
    ],
    requirements: [
        { requirement: "Physical exam", state: "satisfied", stateLabel: "Satisfied", evidence: "Physical exam · v2", due: null, appliesBecause: "Enrolling · each child · blocking" },
        { requirement: "Immunization record", state: "satisfied", stateLabel: "Satisfied", evidence: "Immunization record · v1", due: null, appliesBecause: "Enrolling · each child · blocking" },
        { requirement: "Medication authorization", state: "missing", stateLabel: "Missing", evidence: null, due: "Before Enrolled", appliesBecause: "Child has a medication on file" },
        { requirement: "Physical exam renewal", state: "expiring", stateLabel: "Expires Jul 14, 2027", evidence: "Physical exam · v2", due: "Jul 14, 2027", appliesBecause: "Annual · each child" },
    ],
    emergencyContacts: [
        { name: "Sam Rivera", relationship: "Aunt", phone: "(555) 444-0199", order: "1st" },
        { name: "Jordan Johnson", relationship: "Parent · primary contact", phone: "(555) 012-3456", order: "2nd" },
        { name: "Taylor Johnson", relationship: "Parent", phone: "(555) 987-6543", order: "3rd" },
    ],
    lastUpdated: "Updated Jul 20, 2026 · 4 sources",
};

export const HEALTH_FIXTURE = HEALTH_HIGHER_CARE;
export const HEALTH_SPECIMENS = [HEALTH_TYPICAL, HEALTH_HIGHER_CARE, HEALTH_COMPLEX] as const;

export const CARE_TEAM_FIXTURE: CareTeamEvidence = {
    answerLine: "Taylor Reed is Avery's lead teacher",
    supportingLine: "Sunflower Room · Toddler · North Campus · today",
    people: [
        {
            id: "s-1",
            name: "Taylor Reed",
            relationship: "Lead Teacher",
            lead: true,
            facts: [
                { label: "Room", value: "Sunflower Room" },
                { label: "Today", value: "7:30 – 4:00" },
            ],
        },
        {
            id: "s-2",
            name: "Jordan Lee",
            relationship: "Assistant Teacher",
            facts: [
                { label: "Room", value: "Sunflower Room" },
                { label: "Today", value: "9:00 – 5:30" },
            ],
        },
        {
            id: "s-3",
            name: "Sam Ortiz",
            relationship: "Floater",
            facts: [
                { label: "Room", value: "Sunflower Room" },
                { label: "Today", value: "11:00 – 2:00" },
            ],
        },
        {
            id: "s-4",
            name: "Priya Raman",
            relationship: "Enrollment Specialist",
            facts: [
                { label: "Owns", value: "This enrollment" },
                { label: "Since", value: "Aug 2" },
            ],
        },
    ],
    othersCount: 2,
    othersLabel: "Others at North Campus",
};

const MIN = (h: number, m: number) => h * 60 + m;

export const ATTENDANCE_FIXTURE: AttendanceEvidence = {
    answerLine: "In Nap Room since 12:05 PM",
    supportingLine: "Expected 8:00 AM – 4:30 PM · 4h 1m so far",
    statusChip: "Present",
    statusTone: "ready",
    expected: { fromLabel: "8:00 AM", toLabel: "4:30 PM", fromMin: MIN(8, 0), toMin: MIN(16, 30) },
    actual: { fromMin: MIN(8, 4), toMin: MIN(12, 5) },
    tickMinutes: [MIN(8, 4), MIN(10, 15), MIN(11, 5), MIN(12, 5), MIN(16, 30)],
    events: [
        { state: "done", label: "Checked in", value: "8:04 AM", note: "Sunflower Room" },
        { state: "done", label: "Moved", value: "10:15 AM", note: "Playground" },
        { state: "done", label: "Moved", value: "11:05 AM", note: "Sunflower Room" },
        { state: "current", label: "Moved", value: "12:05 PM", note: "Nap Room" },
        { state: "future", label: "Check-out", value: "—", note: "Expected 4:30 PM" },
    ],
    correctionNote: "Check-in corrected from 8:40 AM by Taylor Reed · 8:11 AM",
    recentDays: [
        { day: "Tue 18", state: "present", hours: "8:11 – 4:30" },
        { day: "Wed 19", state: "present", hours: "8:02 – 4:22" },
        { day: "Thu 20", state: "partial", hours: "8:05 – 12:30" },
        { day: "Fri 21", state: "absent", hours: "Illness" },
        { day: "Mon 24", state: "present", hours: "8:04 – now" },
    ],
};

/**
 * Billing specimens. Every one reconciles:
 *   gross − reductions − funding = family responsibility
 *   family responsibility − payments = current balance
 *   past due ⊆ current balance
 */
export const FINANCIALS_CURRENT: FinancialsEvidence = {
    caseLabel: "A · Current, nothing overdue",
    compact: { dueLine: "$0 due · next charge Sep 1", lines: [{ label: "Tuition", value: "$1,850" }, { label: "Sibling discount", value: "−$185" }], paymentLine: "Visa •••• 4242 · Autopay on", paymentHealthy: true },
    subjects: ["Household", "Avery", "Riley"],
    period: {
        label: "Aug 1 – Aug 31",
        charges: [{ label: "Tuition", value: "$1,850" }],
        reductions: [{ label: "Sibling discount", value: "−$185" }],
        funding: [],
        familyResponsibility: "$1,665",
        paymentsReceived: "−$1,665",
        currentBalance: "$0",
        dueLabel: "Next charge Sep 1",
    },
    pastDue: null,
    ledger: [
        { when: "Aug 20", type: "payment", label: "Payment received", amount: "−$1,665", kind: "credit", status: "Settled", source: "Autopay · Visa 4242" , glCode: "1010 · Cash" , subject: "Household" },
        { when: "Aug 12", type: "discount", label: "Sibling discount", amount: "−$185", kind: "credit", status: "Posted", source: "Rate rule" , glCode: "4900 · Discounts" , subject: "Household" },
        { when: "Aug 01", type: "service", label: "Tuition — August", amount: "+$1,850", kind: "charge", status: "Paid", source: "Schedule" , glCode: "4000 · Tuition revenue" , subject: "Avery" },
        { when: "Jul 20", type: "payment", label: "Payment received", amount: "−$1,665", kind: "credit", status: "Settled", source: "Autopay · Visa 4242" , glCode: "1010 · Cash" , subject: "Household" },
        { when: "Jul 01", type: "service", label: "Tuition — July", amount: "+$1,850", kind: "charge", status: "Paid", source: "Schedule" , glCode: "4000 · Tuition revenue" , subject: "Avery" },
    ],
    payers: [
        { name: "Jordan Johnson", share: "70%", method: "Visa •••• 4242" },
        { name: "Taylor Johnson", share: "30%", method: "ACH •••• 8813" },
    ],
    payment: { autopayLabel: "Autopay on", autopayHealthy: true, nextChargeLabel: "Sep 1 · $1,665" },
    historyLine: "Last payment · $1,665 · Aug 20",
    upcoming: [
        { label: "Next period", value: "Sep 1 – Sep 30" },
        { label: "Scheduled charge", value: "$1,850 · Sep 1" },
        { label: "Scheduled payment", value: "Autopay · Sep 1", unowned: true },
    ],
};

export const FINANCIALS_PAST_DUE: FinancialsEvidence = {
    caseLabel: "B · Past due, failed payment",
    compact: { dueLine: "$255 due · was due Aug 15", lines: [{ label: "Tuition", value: "$1,850" }, { label: "Registration fee", value: "$75" }, { label: "Field trip", value: "$40" }], paymentLine: "Visa •••• 4242 · Autopay paused", paymentHealthy: false },
    subjects: ["Household", "Avery", "Riley"],
    period: {
        label: "Aug 1 – Aug 31",
        charges: [
            { label: "Tuition", value: "$1,850" },
            { label: "Registration fee", value: "$75" },
            { label: "Field trip", value: "$40" },
        ],
        reductions: [{ label: "Sibling discount", value: "−$185" }],
        funding: [{ label: "State subsidy", value: "−$600" }],
        familyResponsibility: "$1,180",
        paymentsReceived: "−$925",
        currentBalance: "$255",
        dueLabel: "Was due Aug 15",
    },
    pastDue: {
        amount: "$255",
        oldest: "Aug 15",
        age: "10 days past due",
        note: "Visa •••• 4242 declined Aug 16",
    },
    ledger: [
        { when: "Aug 20", type: "payment", label: "Payment received", amount: "−$925", kind: "credit", status: "Settled", source: "Operator · ACH 8813" , glCode: "1010 · Cash" , subject: "Household" },
        { when: "Aug 16", type: "payment", label: "Payment attempt", amount: "$0", kind: "charge", status: "Declined", source: "Autopay · Visa 4242" , glCode: "1010 · Cash" , subject: "Household" },
        { when: "Aug 15", type: "subsidy_offset", label: "State subsidy", amount: "−$600", kind: "credit", status: "Posted", source: "Child Care Assistance" , glCode: "4200 · Subsidy revenue" , subject: "Riley" },
        { when: "Aug 12", type: "discount", label: "Sibling discount", amount: "−$185", kind: "credit", status: "Posted", source: "Rate rule" , glCode: "4900 · Discounts" , subject: "Household" },
        { when: "Aug 01", type: "fee", label: "Field trip", amount: "+$40", kind: "charge", status: "Unpaid", source: "Manual · operator" , glCode: "4100 · Fee revenue" , subject: "Avery" },
        { when: "Aug 01", type: "fee", label: "Registration fee", amount: "+$75", kind: "charge", status: "Partially paid", source: "Enrollment" , glCode: "4100 · Fee revenue" , subject: "Avery" },
        { when: "Aug 01", type: "service", label: "Tuition — August", amount: "+$1,850", kind: "charge", status: "Partially paid", source: "Schedule" , glCode: "4000 · Tuition revenue" , subject: "Avery" },
    ],
    payers: [
        { name: "Jordan Johnson", share: "70%", method: "Visa •••• 4242", methodIssue: "Declined Aug 16" },
        { name: "Taylor Johnson", share: "30%", method: "ACH •••• 8813" },
    ],
    payment: {
        autopayLabel: "Autopay paused",
        autopayHealthy: false,
        nextChargeLabel: "Retry after payment method update",
    },
    historyLine: "Last payment · $925 · Aug 20",
    upcoming: [
        { label: "Next period", value: "Sep 1 – Sep 30" },
        { label: "Scheduled charge", value: "$1,850 · Sep 1" },
        { label: "Subsidy expires", value: "Dec 31", unowned: true },
    ],
};

export const FINANCIALS_MIXED_FUNDING: FinancialsEvidence = {
    caseLabel: "C · Mixed funding",
    compact: { dueLine: "$40 due · Sep 1", lines: [{ label: "Tuition", value: "$1,850" }, { label: "Subsidy & discounts", value: "−$885" }], paymentLine: "Visa •••• 4242 · Autopay on", paymentHealthy: true },
    subjects: ["Household", "Avery", "Riley"],
    period: {
        label: "Aug 1 – Aug 31",
        charges: [{ label: "Tuition", value: "$1,850" }],
        reductions: [
            { label: "Sibling discount", value: "−$185" },
            { label: "Vacation credit", value: "−$100" },
        ],
        funding: [{ label: "State subsidy", value: "−$600" }],
        familyResponsibility: "$965",
        paymentsReceived: "−$925",
        currentBalance: "$40",
        dueLabel: "Due Sep 1",
    },
    pastDue: null,
    ledger: [
        { when: "Aug 20", type: "payment", label: "Payment received", amount: "−$925", kind: "credit", status: "Settled", source: "Autopay · Visa 4242" , glCode: "1010 · Cash" , subject: "Household" },
        { when: "Aug 15", type: "subsidy_offset", label: "State subsidy", amount: "−$600", kind: "credit", status: "Posted", source: "Child Care Assistance" , glCode: "4200 · Subsidy revenue" , subject: "Riley" },
        { when: "Aug 12", type: "discount", label: "Sibling discount", amount: "−$185", kind: "credit", status: "Posted", source: "Rate rule" , glCode: "4900 · Discounts" , subject: "Household" },
        { when: "Aug 08", type: "credit", label: "Vacation credit", amount: "−$100", kind: "credit", status: "Posted", source: "Operator" , glCode: "4900 · Discounts" , subject: "Household" },
        { when: "Aug 01", type: "service", label: "Tuition — August", amount: "+$1,850", kind: "charge", status: "Partially paid", source: "Schedule" , glCode: "4000 · Tuition revenue" , subject: "Avery" },
    ],
    payers: [
        { name: "Jordan Johnson", share: "45%", method: "Visa •••• 4242" },
        { name: "Taylor Johnson", share: "25%", method: "ACH •••• 8813" },
        { name: "State subsidy", share: "$600 / mo", method: "Child Care Assistance", funding: true },
    ],
    payment: { autopayLabel: "Autopay on", autopayHealthy: true, nextChargeLabel: "Sep 1 · $965" },
    historyLine: "Last payment · $925 · Aug 20",
    upcoming: [
        { label: "Next period", value: "Sep 1 – Sep 30" },
        { label: "Scheduled charge", value: "$1,850 · Sep 1" },
        { label: "Subsidy renewal", value: "Jan 1", unowned: true },
    ],
};

export const FINANCIALS_FIXTURE = FINANCIALS_PAST_DUE;
export const FINANCIALS_SPECIMENS = [FINANCIALS_CURRENT, FINANCIALS_PAST_DUE, FINANCIALS_MIXED_FUNDING] as const;

/**
 * Overflow specimens — one child's day at 0, 2, 5, 8 and 12 movements, through the SAME card.
 * They exist to prove the projection rule holds its width budget, not to enumerate states.
 */
const ROOMS = [
    "Playground", "Sunflower Room", "Nap Room", "Art Room", "Gym", "Library",
    "Sunflower Room", "Playground", "Music Room", "Nap Room", "Sunflower Room", "Playground",
];

function movementSteps(count: number): AttendanceEvidence["events"] {
    const start = MIN(8, 30);
    const step = Math.floor((MIN(15, 30) - start) / Math.max(1, count));
    return Array.from({ length: count }, (_, i) => {
        const at = start + step * i;
        const h = Math.floor(at / 60);
        const m = at % 60;
        const hh = h > 12 ? h - 12 : h;
        const ampm = h >= 12 ? "PM" : "AM";
        return {
            state: (i === count - 1 ? "current" : "done") as "current" | "done",
            label: "Moved",
            value: `${hh}:${String(m).padStart(2, "0")} ${ampm}`,
            note: ROOMS[i % ROOMS.length]!,
        };
    });
}

export function attendanceWithMovements(count: number): AttendanceEvidence {
    const movements = movementSteps(count);
    const last = movements[movements.length - 1];
    // The day bar must advance with the last recorded fact, or a busy afternoon reads as a
    // morning that stopped — the specimen would then be testing the wrong thing.
    const lastMin = count === 0 ? MIN(8, 4) : MIN(8, 30) + Math.floor((MIN(15, 30) - MIN(8, 30)) / count) * (count - 1);
    return {
        ...ATTENDANCE_FIXTURE,
        actual: { fromMin: MIN(8, 4), toMin: lastMin },
        answerLine:
            count === 0
                ? "In Sunflower Room since 8:04 AM"
                : `In ${last!.note} since ${last!.value}`,
        supportingLine: `Expected 8:00 AM – 4:30 PM · ${count} ${count === 1 ? "movement" : "movements"} today`,
        events: [
            { state: "done", label: "Checked in", value: "8:04 AM", note: "Sunflower Room" },
            ...movements,
            { state: "future", label: "Check-out", value: "—", note: "Expected 4:30 PM" },
        ],
        correctionNote: null,
    };
}

export const ATTENDANCE_OVERFLOW_SPECIMENS = [0, 2, 5, 8, 12] as const;

/**
 * Employee-grain Staff fixture. Taylor Reed is the SUBJECT here, not a row on a child's card.
 * Values map one-to-one onto canonical shapes — `PersonEmploymentPeriod` for employment,
 * `StaffPresenceDayState` for today, `schedule_assignments` for the rooms.
 */
export const STAFF_FIXTURE: StaffEvidence = {
    name: "Taylor Reed",
    stateLabel: "Active",
    stateTone: "ready",
    answerLine: "Lead Teacher · Full time · North Campus",
    supportingLine: "Since Aug 12, 2024",
    employment: [
        { label: "Position", value: "Lead Teacher" },
        { label: "Type", value: "Full time" },
        { label: "Started", value: "Aug 12, 2024" },
        { label: "Primary site", value: "North Campus" },
    ],
    today: [
        { label: "Scheduled", value: "7:30 AM – 4:00 PM" },
        { label: "Room", value: "Sunflower Room" },
    ],
    presenceLine: "On site since 7:27 AM · Sunflower Room",
    assignments: [
        { room: "Sunflower Room", when: "Mon – Fri · 7:30 – 4:00" },
        { room: "Playground", when: "Mon, Wed · 10:00 – 10:45" },
    ],
    contact: { email: "taylor.reed@example.com", phone: "(541) 555-0148" },
};

/** Ledger grouped by billing period — prior periods collapsed by default. */
export const FINANCIALS_LEDGER_PERIODS: FinancialsLedgerPeriod[] = [
    { label: "August 2026", summary: "Balance $255", open: true, entries: FINANCIALS_PAST_DUE.ledger },
    {
        label: "July 2026",
        summary: "Closed · $0",
        open: false,
        entries: [
            { when: "Jul 20", type: "payment", label: "Payment received", amount: "−$1,665", kind: "credit", status: "Settled", source: "Autopay · Visa 4242" , glCode: "1010 · Cash" , subject: "Household" },
            { when: "Jul 01", type: "service", label: "Tuition — July", amount: "+$1,850", kind: "charge", status: "Paid", source: "Schedule" , glCode: "4000 · Tuition revenue" , subject: "Avery" },
            { when: "Jul 01", type: "discount", label: "Sibling discount", amount: "−$185", kind: "credit", status: "Posted", source: "Rate rule" , glCode: "4900 · Discounts" , subject: "Household" },
        ],
    },
    { label: "June 2026", summary: "Closed · $0", open: false, entries: [] },
];

/**
 * Add charge specimen. Every input is decided by the selected `financial_charge_templates` row —
 * `amount_strategy` decides whether the amount is editable, `billable_on` decides the due date,
 * `responsibility` decides who is billed. The card hardcodes none of it.
 */
export const CHARGE_TEMPLATES: ChargeTemplateOption[] = [
    { key: "field_trip", label: "Field trip", amountStrategy: "manual", amount: null, occursOn: "Event date", billableOn: "Next billing cycle", responsibility: "Household", allowsDateOverride: true, payerTargeting: "default_split", requiresSubject: true, requiresNote: true },
    { key: "registration", label: "Registration fee", amountStrategy: "fixed", amount: "$75.00", occursOn: "When configured (now)", billableOn: "Immediately", responsibility: "Household", allowsDateOverride: false, payerTargeting: "default_split", requiresSubject: true, requiresNote: false },
    { key: "late_pickup", label: "Late pickup", amountStrategy: "rate_derived", amount: "$1.00 / min", occursOn: "Event date", billableOn: "Next billing cycle", responsibility: "Household", allowsDateOverride: false, payerTargeting: "operator_selectable", requiresSubject: true, requiresNote: false },
    { key: "supplies", label: "Supplies & materials", amountStrategy: "manual", amount: null, occursOn: "When configured (now)", billableOn: "Next billing cycle", responsibility: "Household", allowsDateOverride: true, payerTargeting: "default_split", requiresSubject: false, requiresNote: true },
    { key: "agency_placement", label: "Agency placement fee", amountStrategy: "fixed", amount: "$250.00", occursOn: "Service period start", billableOn: "Next billing cycle", responsibility: "Agency", allowsDateOverride: false, payerTargeting: "third_party", requiresSubject: true, requiresNote: false },
];

/**
 * Add charge specimen — a FUTURE-DATED charge, to prove the dating semantics.
 * Service date Sep 18 (the trip), billing period September (billable_on = next cycle),
 * due Sep 30 per the configured policy. No date is invented: each maps to one column on `charges`.
 */
export const ADD_CHARGE_SPECIMEN: AddChargeSpecimen = {
    template: CHARGE_TEMPLATES[0]!,
    subject: "Avery Johnson",
    amount: "$40.00",
    serviceDate: "Sep 18, 2026",
    period: "September 2026",
    due: "Sep 30, 2026",
    overridden: "Service date set by operator",
    chargeTo: "All responsible payers (default split)",
    allocation: [
        { payer: "Jordan Johnson", share: "70%", amount: "+$28.00" },
        { payer: "Taylor Johnson", share: "30%", amount: "+$12.00" },
    ],
    note: "Zoo field trip",
    previewBefore: "$255",
    previewAfter: "$295",
};

/** Safety Signals — configured projections of canonical health facts. */
export const SAFETY_SIGNALS: SafetySignal[] = [
    { label: "Peanut allergy · severe", tone: "critical", surfaces: ["Child header", "Attendance", "Roster", "Meals"] },
    { label: "EpiPen on site", tone: "medication", surfaces: ["Child header", "Attendance", "Roster"] },
    { label: "No dairy", tone: "dietary", surfaces: ["Meals", "Attendance"] },
];

/** Three configured Business Processes, through ONE process card. */
export const PROCESS_ENROLLMENT: ProcessEvidence = {
    participantsLabel: null,
    activity: [],
    caseLabel: "Enrollment · Johnson",
    subjectLabel: "Johnson Family",
    sourceWorkView: null,
    childStates: [],
    processLabel: "Enrollment",
    stages: [
        { label: "Lead", state: "done", primarySupport: "Aug 2", secondarySupport: null },
        { label: "Tour", state: "done", primarySupport: "Aug 5 – 8", secondarySupport: "Completed" },
        { label: "Waitlist", state: "done", primarySupport: "Aug 9 – 18", secondarySupport: "Offer accepted" },
        { label: "Enrolling", state: "current", primarySupport: "Since Aug 18", secondarySupport: null },
        { label: "Enrolled", state: "future", primarySupport: "Expected Sep 2", secondarySupport: null },
    ],
    currentStageLabel: "Enrolling",
    workLine: "2 items remain",
    dueLine: "Enrollment packet due Aug 28",
    actions: [
        { label: "Send packet", primary: true },
        { label: "Complete placement" },
        { label: "Contact family" },
    ],
    stillNeeded: ["Medication authorization", "Payment setup"],
};

export const PROCESS_ASSIGNMENT: ProcessEvidence = {
    participantsLabel: null,
    // No participants at all, and activity still lands — the foot row is not Enrollment-specific.
    activity: [
        { id: "evt_room_move", label: "Moved to Sunflower Room", when: "Aug 18" },
        { id: "evt_assignment_confirmed", label: "Assignment confirmed", when: "Aug 18" },
        { id: "evt_offer_sent", label: "Offer sent", when: "Aug 12" },
    ],
    caseLabel: "Assignment",
    subjectLabel: "Johnson Family",
    sourceWorkView: null,
    childStates: [],
    processLabel: "Assignment",
    stages: [
        { label: "Requested", state: "done", primarySupport: "Aug 9", secondarySupport: null },
        { label: "Offered", state: "done", primarySupport: "Aug 12", secondarySupport: "Sunflower Room" },
        { label: "Confirmed", state: "done", primarySupport: "Aug 18", secondarySupport: null },
        { label: "Active", state: "current", primarySupport: "Sunflower Room", secondarySupport: "Mon – Fri" },
        { label: "Ended", state: "future", primarySupport: null, secondarySupport: null },
    ],
    currentStageLabel: "Active",
    workLine: "Sunflower Room · Mon – Fri",
    dueLine: null,
    actions: [{ label: "Change assignment", primary: true }, { label: "End assignment" }],
    stillNeeded: [],
};

export const PROCESS_BILLING: ProcessEvidence = {
    participantsLabel: null,
    activity: [],
    caseLabel: "Billing",
    subjectLabel: "Johnson Family",
    sourceWorkView: null,
    childStates: [],
    processLabel: "Billing",
    stages: [
        { label: "Setup", state: "done", primarySupport: "Aug 1", secondarySupport: null },
        { label: "Active", state: "done", primarySupport: "Aug 1 – 15", secondarySupport: null },
        { label: "Past due", state: "current", primarySupport: "$255 · 10 days", secondarySupport: "Visa declined Aug 16" },
        { label: "Recovery", state: "future", primarySupport: null, secondarySupport: null },
        { label: "Current", state: "future", primarySupport: null, secondarySupport: null },
    ],
    currentStageLabel: "Past due",
    workLine: "$255 outstanding · 10 days",
    dueLine: "Payment failed Aug 16",
    actions: [{ label: "Pay now", primary: true }, { label: "Contact payer" }],
    stillNeeded: ["Payment method update"],
};

/**
 * ── MIXED-GRAIN PRESSURE TEST — the Wright family ──
 *
 * Three facts, all authoritative, at two grains:
 *     CASE  Tour   ·   AVERY  Waitlisted   ·   RILEY  Tour
 *
 * The card must not replace the case's Tour with Avery's Waitlist, must not reduce Avery's
 * Waitlist to an incidental chip, must not imply the family is waitlisted, and must not imply
 * Riley shares Avery's state. Case stage and participant stage are SEPARATE LAYERS.
 *
 * Per `operational-grain-doctrine.md` §2.4 the Focus Panel stays case-grain; a child selection is
 * a scope hint that emphasises a participant, never a change of subject.
 */
/**
 * Configured supporting information — two slots per stage, chosen per Business Process.
 * Enrollment fills them with tour time + campus, waitlist rank + program, start date + readiness.
 */
const WRIGHT_STAGES: ProcessEvidence["stages"] = [
    { label: "Lead", state: "done", primarySupport: "Aug 11", secondarySupport: null },
    { label: "Tour", state: "current", primarySupport: "Aug 27 · 10:00 AM", secondarySupport: "North Campus" },
    { label: "Waitlist", state: "future", primarySupport: "#4 · Toddler", secondarySupport: "Joined Aug 19" },
    { label: "Enrolling", state: "future", primarySupport: "Start Sep 2", secondarySupport: null },
    { label: "Enrolled", state: "future", primarySupport: null, secondarySupport: null },
];

const AVERY = (scoped: boolean): ProcessChildState => ({
    name: "Avery Wright",
    stage: "Waitlisted",
    stageKey: "Waitlist",
    since: "Joined Aug 19",
    scoped,
    actions: [{ label: "Review waitlist position", primary: scoped }],
    imageUrl: null,
});
const RILEY = (scoped: boolean): ProcessChildState => ({
    name: "Riley Wright",
    stage: "Tour",
    stageKey: "Tour",
    since: "Tour Aug 27",
    scoped,
    actions: [{ label: "Complete tour", primary: scoped }],
    imageUrl: null,
});

function wright(caseLabel: string, scoped: "Avery" | "Riley" | null): ProcessEvidence {
    return {
        participantsLabel: "Children",
        // More than three, deliberately: the menu shows the whole record, so the fixture must
        // exceed what the old bounded region could have printed.
        activity: [
            { id: "evt_tour_invite", label: "Tour invitation sent", when: "Today · 9:47 AM" },
            { id: "evt_avery_waitlist", label: "Avery joined waitlist", when: "Aug 19" },
            { id: "evt_immunization_doc", label: "Immunization record uploaded", when: "Aug 18" },
            { id: "evt_call_voicemail", label: "Called — left voicemail", when: "Aug 15" },
            { id: "evt_inquiry_received", label: "Enrollment inquiry received", when: "Aug 11" },
        ],
        caseLabel,
        subjectLabel: "Wright Family",
        sourceWorkView: null,
        childStates: [AVERY(scoped === "Avery"), RILEY(scoped === "Riley")],
        processLabel: "Enrollment",
        stages: WRIGHT_STAGES,
        currentStageLabel: "Tour",
        workLine: "Tour scheduled Aug 27 · 10:00 AM",
        dueLine: null,
        actions: [{ label: "Complete tour", primary: true }, { label: "Contact family" }],
        stillNeeded: [],
    };
}

export const PROCESS_WRIGHT_TOUR = wright("A · case from Tour", null);
export const PROCESS_WRIGHT_ALL = wright("B · same case from All", null);
export const PROCESS_WRIGHT_AVERY = wright("C · scoped to Avery", "Avery");
export const PROCESS_WRIGHT_RILEY = wright("D · scoped to Riley", "Riley");

/** E — the case has moved on and the children have diverged further. */
export const PROCESS_WRIGHT_DIVERGENT: ProcessEvidence = {
    ...wright("E · divergent children", null),
    stages: [
        { label: "Lead", state: "done", primarySupport: "Aug 11", secondarySupport: null },
        { label: "Tour", state: "done", primarySupport: "Aug 16 – 27", secondarySupport: "Completed" },
        { label: "Waitlist", state: "done", primarySupport: "Aug 27 – 30", secondarySupport: null },
        { label: "Enrolling", state: "current", primarySupport: "Since Aug 30", secondarySupport: null },
        { label: "Enrolled", state: "future", primarySupport: null, secondarySupport: null },
    ],
    currentStageLabel: "Enrolling",
    workLine: "1 of 2 children enrolling",
    dueLine: "Packet due Sep 6",
    actions: [{ label: "Send packet", primary: true }, { label: "Contact family" }],
    childStates: [
        { name: "Avery Wright", stage: "Waitlisted", stageKey: "Waitlist", since: "Joined Aug 19", actions: [{ label: "Review waitlist position" }], imageUrl: null },
        { name: "Riley Wright", stage: "Enrolling", stageKey: "Enrolling", since: "Since Aug 30", actions: [{ label: "Complete placement" }], imageUrl: null },
    ],
};

/** F — every child at the same state as the case. The region collapses to one line. */
export const PROCESS_WRIGHT_ALIGNED: ProcessEvidence = {
    ...wright("G · children aligned", null),
    workLine: "Tour scheduled Aug 27 · 10:00 AM · both children",
    childStates: [
        { name: "Avery Wright", stage: "Tour", stageKey: "Tour", since: "Tour Aug 27", actions: [], imageUrl: null },
        { name: "Riley Wright", stage: "Tour", stageKey: "Tour", since: "Tour Aug 27", actions: [], imageUrl: null },
    ],
};

function kid(first: string, stage: string, stageKey: string, scoped = false): ProcessChildState {
    return { name: `${first} Wright`, stage, stageKey, since: null, actions: [], imageUrl: null, scoped };
}

/** Bounded-projection pressure: 1, 2, 3, 5 and 8 children. */
export const PROCESS_COUNT_SPECIMENS: ProcessEvidence[] = [1, 2, 3, 5, 8].map((n) => {
    const names = ["Riley", "Avery", "Sam", "Noa", "Jules", "Kit", "Ari", "Wren"];
    const stages = ["Tour", "Waitlist", "Tour", "Tour", "Lead", "Tour", "Waitlist", "Tour"];
    const labels = ["Tour", "Waitlisted", "Tour", "Tour", "Lead", "Tour", "Waitlisted", "Tour"];
    return {
        ...wright(`${n} ${n === 1 ? "child" : "children"}`, null),
        childStates: names.slice(0, n).map((nm, i) => kid(nm, labels[i]!, stages[i]!)),
    };
});

/** F — five children across three stages. Proves the bounded marker rule. */
export const PROCESS_WRIGHT_MANY: ProcessEvidence = {
    ...wright("F · five children, three stages", null),
    workLine: "Tour scheduled Aug 27 · 10:00 AM",
    childStates: [
        { name: "Avery Wright", stage: "Waitlisted",
    stageKey: "Waitlist", since: "Joined Aug 19", actions: [], imageUrl: null },
        { name: "Riley Wright", stage: "Tour", stageKey: "Tour", since: null, actions: [], imageUrl: null },
        { name: "Sam Wright", stage: "Tour", stageKey: "Tour", since: null, actions: [], imageUrl: null },
        { name: "Noa Wright", stage: "Tour", stageKey: "Tour", since: null, actions: [], imageUrl: null },
        { name: "Jules Wright", stage: "Lead", stageKey: "Lead", since: null, actions: [], imageUrl: null },
    ],
};

/** The same case with the activity region omitted — proving the modest delta. */
export const PROCESS_WRIGHT_NO_ACTIVITY: ProcessEvidence = {
    ...wright("A0 · no recent activity", null),
    activity: [],
};

export const PROCESS_GRAIN_SPECIMENS = [
    PROCESS_WRIGHT_NO_ACTIVITY,
    PROCESS_WRIGHT_TOUR,
    PROCESS_WRIGHT_ALL,
    PROCESS_WRIGHT_AVERY,
    PROCESS_WRIGHT_RILEY,
    PROCESS_WRIGHT_DIVERGENT,
    PROCESS_WRIGHT_ALIGNED,
    PROCESS_WRIGHT_MANY,
] as const;

export const PROCESS_SPECIMENS = [PROCESS_ENROLLMENT, PROCESS_ASSIGNMENT, PROCESS_BILLING] as const;
