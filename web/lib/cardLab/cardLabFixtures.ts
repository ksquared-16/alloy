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
    BillingEvidence,
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
 * Billing specimens — three real financial situations, not a state matrix.
 *
 *   A  current       nothing overdue, multiple payers
 *   B  past due      an overdue amount and a failed payment
 *   C  mixed funding subsidy, discount, split family payers
 */
export const BILLING_CURRENT: BillingEvidence = {
    caseLabel: "A · Current, nothing overdue",
    period: {
        label: "Aug 1 – Aug 31",
        lines: [
            { label: "Tuition", value: "$1,850" },
            { label: "Sibling discount", value: "−$185" },
            { label: "Family responsibility", value: "$1,665", emphasis: true },
        ],
    },
    dueLabel: "Due",
    dueValue: "Sep 1",
    pastDue: null,
    ledger: [
        { when: "Aug 20", label: "Payment received", amount: "−$1,665", kind: "credit" },
        { when: "Aug 15", label: "Tuition — August", amount: "+$1,850", kind: "charge" },
        { when: "Aug 12", label: "Sibling discount", amount: "−$185", kind: "credit" },
        { when: "Jul 20", label: "Payment received", amount: "−$1,665", kind: "credit" },
        { when: "Jul 15", label: "Tuition — July", amount: "+$1,850", kind: "charge" },
    ],
    payers: [
        { name: "Jordan Johnson", share: "70%", method: "Visa •••• 4242" },
        { name: "Taylor Johnson", share: "30%", method: "ACH •••• 8813" },
    ],
};

export const BILLING_PAST_DUE: BillingEvidence = {
    caseLabel: "B · Past due, failed payment",
    period: {
        label: "Aug 1 – Aug 31",
        lines: [
            { label: "Tuition", value: "$1,850" },
            { label: "Registration fee", value: "+$75" },
            { label: "Family responsibility", value: "$1,925", emphasis: true },
        ],
    },
    dueLabel: "Due",
    dueValue: "Sep 1",
    pastDue: {
        amount: "$275",
        oldest: "Aug 15",
        age: "9 days past due",
        note: "Card declined Aug 16 · Visa •••• 4242",
    },
    ledger: [
        { when: "Aug 20", label: "Payment received", amount: "−$925", kind: "credit" },
        { when: "Aug 15", label: "Tuition — August", amount: "+$1,850", kind: "charge" },
        { when: "Aug 12", label: "Registration fee", amount: "+$75", kind: "charge" },
        { when: "Aug 10", label: "Late fee", amount: "+$25", kind: "charge" },
    ],
    payers: [
        { name: "Jordan Johnson", share: "70%", method: "Visa •••• 4242" },
        { name: "Taylor Johnson", share: "30%", method: "ACH •••• 8813" },
    ],
};

export const BILLING_MIXED_FUNDING: BillingEvidence = {
    caseLabel: "C · Mixed funding",
    period: {
        label: "Aug 1 – Aug 31",
        lines: [
            { label: "Tuition", value: "$1,850" },
            { label: "Sibling discount", value: "−$185" },
            { label: "State subsidy", value: "−$600" },
            { label: "Vacation credit", value: "−$100" },
            { label: "Family responsibility", value: "$965", emphasis: true },
        ],
    },
    dueLabel: "Due",
    dueValue: "Sep 1",
    pastDue: null,
    ledger: [
        { when: "Aug 20", label: "Payment received", amount: "−$925", kind: "credit" },
        { when: "Aug 15", label: "Tuition — August", amount: "+$1,850", kind: "charge" },
        { when: "Aug 15", label: "State subsidy", amount: "−$600", kind: "credit" },
        { when: "Aug 12", label: "Sibling discount", amount: "−$185", kind: "credit" },
        { when: "Aug 08", label: "Vacation credit", amount: "−$100", kind: "credit" },
    ],
    payers: [
        { name: "Jordan Johnson", share: "45%", method: "Visa •••• 4242" },
        { name: "Taylor Johnson", share: "25%", method: "ACH •••• 8813" },
        { name: "State subsidy", share: "$600 / mo", method: "Child Care Assistance" },
    ],
};

export const BILLING_FIXTURE = BILLING_PAST_DUE;
export const BILLING_SPECIMENS = [BILLING_CURRENT, BILLING_PAST_DUE, BILLING_MIXED_FUNDING] as const;

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
