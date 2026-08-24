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
    answerLine: "Enrolling · since Aug 18",
    supportingLine: "Lead Aug 2 → Enrolling Aug 18 · 22 days in process",
    stages: [
        { state: "done", value: "Lead", detail: "Aug 2", note: "Inquiry submitted" },
        { state: "done", value: "Tour", detail: "Aug 5 – 8", note: "Tour completed" },
        { state: "done", value: "Waitlist", detail: "Aug 9 – 18", note: "Offer accepted" },
        { state: "current", value: "Enrolling", detail: "Since Aug 18", note: "2 items remain" },
        { state: "future", value: "Enrolled", detail: "Expected Sep 2", note: null },
    ],
};

export const HEALTH_FIXTURE: HealthEvidence = {
    answerLine: "Peanut allergy — severe · EpiPen on site",
    supportingLine: "Asthma · no dairy · 3 emergency contacts",
    statusChip: null,
    allergies: [
        { name: "Peanuts", severe: true, detail: "Anaphylaxis · EpiPen kept in Sunflower Room" },
        { name: "Latex", detail: "Contact rash" },
    ],
    medical: [
        { name: "Asthma", detail: "Exercise-induced" },
    ],
    medications: [
        { name: "Albuterol inhaler", detail: "As needed · 2 puffs · kept in Sunflower Room" },
        { name: "Epinephrine auto-injector", detail: "Emergency use · expires Mar 2027" },
    ],
    dietary: [{ name: "No dairy", detail: "Substitute oat milk" }],
    requirements: [
        { name: "Physical exam", value: "Received Jul 14" },
        { name: "Immunization record", value: "Received Jul 14" },
        { name: "Medication authorization", value: "Missing", missing: true },
    ],
    emergencyCount: 3,
    emergencyPrimary: "Sam Rivera",
    emergencyDetail: "First call · Aunt · (555) 444-0199",
};

export const STAFF_FIXTURE: StaffEvidence = {
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

export const BILLING_FIXTURE: BillingEvidence = {
    answerLine: "$1,065 family share · due Sep 1",
    supportingLine: "Aug 1 – Aug 31 · autopay on",
    statusChip: "$275 past due",
    period: {
        label: "Aug 1 – Aug 31",
        lines: [
            { label: "Tuition", value: "$1,850" },
            { label: "Sibling discount", value: "−$185" },
            { label: "State subsidy", value: "−$600" },
            { label: "Family share", value: "$1,065", emphasis: true },
        ],
    },
    dueLabel: "Next due",
    dueValue: "Sep 1",
    pastDue: {
        amount: "$275",
        oldest: "Aug 15",
        age: "9 days past due",
        note: "Card declined Aug 16 · Visa •••• 4242",
    },
    ledger: [
        { when: "Aug 20", label: "Payment received", amount: "+$925", kind: "credit" },
        { when: "Aug 15", label: "Tuition — August", amount: "$1,850", kind: "charge" },
        { when: "Aug 15", label: "State subsidy", amount: "−$600", kind: "credit" },
        { when: "Aug 12", label: "Sibling discount", amount: "−$185", kind: "credit" },
        { when: "Aug 10", label: "Late fee", amount: "$25", kind: "charge" },
    ],
    payers: [
        { name: "Jordan Johnson", share: "70%", method: "Visa •••• 4242" },
        { name: "Taylor Johnson", share: "30%", method: "ACH •••• 8813" },
        { name: "State subsidy", share: "$600 / mo", method: "Child Care Assistance" },
    ],
};
