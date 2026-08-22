/**
 * Card Lab fixtures — every specimen the Director reviews.
 *
 * ── FIXTURE HONESTY ──
 *
 * A fixture may only carry a fact that has a CANONICAL OWNER in the ownership matrix
 * (spec §2). Where a fact has no owner, the fixture omits it and the card renders its
 * absent/held treatment. That is why these fixtures contain no waitlist "position at entry",
 * no document expiry date, no autopay state, no payment method, and no posted balance:
 * Alloy cannot produce any of them today, so a realistic-looking fixture would be a lie that
 * survives into the approved design.
 */

import { buildJourneyCardEvidence, type JourneyFact } from "@/lib/cardLab/journeyCardEvidence";
import { buildHealthSafetyCardEvidence, type HealthFactRow } from "@/lib/cardLab/healthSafetyCardEvidence";
import { buildStaffCardEvidence, type StaffPersonRow } from "@/lib/cardLab/staffCardEvidence";
import { buildAttendanceCardEvidence, type AttendanceDayRow } from "@/lib/cardLab/attendanceCardEvidence";
import { buildBillingCardEvidence } from "@/lib/cardLab/billingCardEvidence";

// ─────────────────────────────────────────────────────────────────────────────
// The reference Business Process — an Enrollment stage list as a governing
// revision would publish it. Nothing here is hardcoded into a card.
// ─────────────────────────────────────────────────────────────────────────────

export const ENROLLMENT_STAGES = [
    { key: "lead", label: "Lead" },
    { key: "tour", label: "Tour" },
    { key: "waitlist", label: "Waitlist" },
    { key: "enrolling", label: "Enrolling" },
    { key: "enrolled", label: "Enrolled" },
] as const;

function fact(
    id: string,
    typeKey: string,
    label: string,
    at: string | null,
    stageKey: string | null,
    destinationCard: string | null,
): JourneyFact {
    return { id, typeKey, label, at, stageKey, sourceOwner: typeKey, destinationCard, subjectId: null };
}

const ALL_FACTS: JourneyFact[] = [
    fact("f1", "form.submitted", "Lead created", "2026-08-02T14:10:00Z", "lead", "current_work"),
    fact("f2", "form.submitted", "Inquiry form submitted", "2026-08-02T14:12:00Z", "lead", "documents"),
    fact("f3", "tour.booking", "Tour scheduled", "2026-08-05T16:00:00Z", "tour", "tour_summary"),
    fact("f4", "tour.booking", "Tour completed", "2026-08-08T15:00:00Z", "tour", "tour_summary"),
    fact("f5", "process.outcome", "Continue enrollment", "2026-08-08T15:40:00Z", "tour", "current_work"),
    fact("f6", "placement.committed", "Joined waitlist", "2026-08-09T09:00:00Z", "waitlist", "scheduling"),
    fact("f7", "schedule.assigned", "Schedule assigned — M–F", "2026-08-18T11:00:00Z", "enrolling", "scheduling"),
    fact("f8", "billing.setup", "Billing contact set", "2026-08-19T10:00:00Z", "enrolling", "billing"),
];

// ─────────────────────────────────────────────────────────────────────────────
// Journey specimens
// ─────────────────────────────────────────────────────────────────────────────

export const JOURNEY_SPECIMENS = {
    early: buildJourneyCardEvidence({
        processStages: ENROLLMENT_STAGES,
        currentStageKey: "lead",
        currentStageEnteredAt: "2026-08-02T14:10:00Z",
        stateLabel: null,
        closeReasonLabel: null,
        facts: ALL_FACTS.filter((f) => f.stageKey === "lead"),
        requirementsSatisfied: 1,
        requirementsTotal: 3,
        openWorkCount: 2,
    }),
    midProcess: buildJourneyCardEvidence({
        processStages: ENROLLMENT_STAGES,
        currentStageKey: "tour",
        currentStageEnteredAt: "2026-08-05T09:00:00Z",
        stateLabel: null,
        closeReasonLabel: null,
        facts: ALL_FACTS.filter((f) => ["lead", "tour"].includes(f.stageKey ?? "")),
        requirementsSatisfied: 2,
        requirementsTotal: 2,
        openWorkCount: 1,
    }),
    waitlist: buildJourneyCardEvidence({
        processStages: ENROLLMENT_STAGES,
        currentStageKey: "waitlist",
        currentStageEnteredAt: "2026-08-09T09:00:00Z",
        stateLabel: "Waitlisted",
        closeReasonLabel: null,
        facts: ALL_FACTS.filter((f) => ["lead", "tour", "waitlist"].includes(f.stageKey ?? "")),
        requirementsSatisfied: 0,
        requirementsTotal: 1,
        openWorkCount: 1,
    }),
    enrolling: buildJourneyCardEvidence({
        processStages: ENROLLMENT_STAGES,
        currentStageKey: "enrolling",
        currentStageEnteredAt: "2026-08-18T09:00:00Z",
        stateLabel: "Enrolling",
        closeReasonLabel: null,
        facts: ALL_FACTS,
        requirementsSatisfied: 2,
        requirementsTotal: 4,
        openWorkCount: 2,
    }),
    completed: buildJourneyCardEvidence({
        processStages: ENROLLMENT_STAGES,
        currentStageKey: "enrolled",
        currentStageEnteredAt: "2026-08-20T09:00:00Z",
        stateLabel: "Enrolled",
        closeReasonLabel: null,
        facts: ALL_FACTS,
        requirementsSatisfied: 4,
        requirementsTotal: 4,
        openWorkCount: 0,
    }),
    /** A passed stage with no anchored fact — status INFERRED, never asserted. */
    skipped: buildJourneyCardEvidence({
        processStages: ENROLLMENT_STAGES,
        currentStageKey: "enrolling",
        currentStageEnteredAt: "2026-08-18T09:00:00Z",
        stateLabel: "Enrolling",
        closeReasonLabel: null,
        // Waitlist carries no fact — the family went straight from tour to enrolling.
        facts: ALL_FACTS.filter((f) => f.stageKey !== "waitlist"),
        requirementsSatisfied: 2,
        requirementsTotal: 4,
        openWorkCount: 2,
    }),
    /** Observed backwards transition in `mutation_events`. */
    reopened: buildJourneyCardEvidence({
        processStages: ENROLLMENT_STAGES,
        currentStageKey: "tour",
        currentStageEnteredAt: "2026-08-21T09:00:00Z",
        stateLabel: null,
        closeReasonLabel: null,
        facts: ALL_FACTS.filter((f) => ["lead", "tour"].includes(f.stageKey ?? "")),
        reopenedStageKeys: ["tour"],
        requirementsSatisfied: 1,
        requirementsTotal: 2,
        openWorkCount: 1,
    }),
    closed: buildJourneyCardEvidence({
        processStages: ENROLLMENT_STAGES,
        currentStageKey: "waitlist",
        currentStageEnteredAt: "2026-08-09T09:00:00Z",
        stateLabel: "Not enrolling",
        closeReasonLabel: "Chose another provider",
        facts: ALL_FACTS.filter((f) => ["lead", "tour", "waitlist"].includes(f.stageKey ?? "")),
        isClosed: true,
        openWorkCount: 0,
    }),
    unresolved: buildJourneyCardEvidence({
        processStages: null,
        currentStageKey: null,
        currentStageEnteredAt: null,
        stateLabel: null,
        closeReasonLabel: null,
        facts: [],
    }),
} as const;

/** Multi-child family — ONE rail per child, because a journey is per process_instance. */
export const JOURNEY_MULTI_CHILD = [
    { childName: "Emma Johnson", evidence: JOURNEY_SPECIMENS.enrolling },
    { childName: "Liam Johnson", evidence: JOURNEY_SPECIMENS.waitlist },
    { childName: "Noah Johnson", evidence: JOURNEY_SPECIMENS.early },
];

// ─────────────────────────────────────────────────────────────────────────────
// Health & Safety specimens
// ─────────────────────────────────────────────────────────────────────────────

/** The org's configured health field set. Labels and prominence are configuration. */
function healthFields(values: Partial<Record<string, string>>): HealthFactRow[] {
    return [
        { fieldKey: "allergies", label: "Allergies", value: values.allergies ?? null, safetyCritical: true },
        { fieldKey: "medical_notes", label: "Medical notes", value: values.medical_notes ?? null, safetyCritical: false },
        { fieldKey: "special_instructions", label: "Special instructions", value: values.special_instructions ?? null, safetyCritical: false },
        // An org-added field — proves the vocabulary is not platform-fixed.
        { fieldKey: "dietary_restriction", label: "Dietary restriction", value: values.dietary_restriction ?? null, safetyCritical: false },
    ];
}

const HEALTH_DOCS = [
    { docTypeKey: "physical", label: "Physical exam", onFile: true, expiresAt: null },
    { docTypeKey: "immunization", label: "Immunization record", onFile: true, expiresAt: null },
    { docTypeKey: "medication_auth", label: "Medication authorization", onFile: false, expiresAt: null },
];

export const HEALTH_SPECIMENS = {
    complete: buildHealthSafetyCardEvidence({
        fields: healthFields({ medical_notes: "Mild asthma — inhaler at school" }),
        documents: HEALTH_DOCS.map((d) => ({ ...d, onFile: true })),
        requirements: [
            { key: "physical", label: "Physical received", resolved: true, met: true, detail: null, ownerCard: "documents" },
            { key: "immunization", label: "Immunization record", resolved: true, met: true, detail: null, ownerCard: "documents" },
            { key: "med_auth", label: "Medication authorization", resolved: true, met: true, detail: null, ownerCard: "documents" },
        ],
        emergencyContactCount: 2,
    }),
    needsAttention: buildHealthSafetyCardEvidence({
        fields: healthFields({ medical_notes: "Asthma", dietary_restriction: "Dairy" }),
        documents: HEALTH_DOCS,
        requirements: [
            { key: "physical", label: "Physical received", resolved: true, met: true, detail: null, ownerCard: "documents" },
            { key: "immunization", label: "Immunization record", resolved: true, met: false, detail: "Not received", ownerCard: "documents" },
            { key: "med_auth", label: "Medication authorization", resolved: true, met: false, detail: "Missing", ownerCard: "documents" },
        ],
        emergencyContactCount: 2,
    }),
    severeAlert: buildHealthSafetyCardEvidence({
        fields: healthFields({
            allergies: "Severe peanut allergy — EpiPen required",
            medical_notes: "Asthma",
            dietary_restriction: "Dairy",
        }),
        documents: HEALTH_DOCS,
        requirements: [
            { key: "physical", label: "Physical received", resolved: true, met: true, detail: null, ownerCard: "documents" },
            { key: "immunization", label: "Immunization record", resolved: true, met: true, detail: null, ownerCard: "documents" },
            { key: "med_auth", label: "Medication authorization", resolved: true, met: false, detail: "Missing", ownerCard: "documents" },
        ],
        emergencyContactCount: 3,
    }),
    /** New enrollment — resolved and genuinely nothing recorded. NOT "no known allergies". */
    empty: buildHealthSafetyCardEvidence({
        fields: healthFields({}),
        documents: [],
        requirements: [],
        emergencyContactCount: 0,
    }),
    /** The requirement projection has not answered. Held, never counted. */
    heldRequirements: buildHealthSafetyCardEvidence({
        fields: healthFields({ allergies: "Peanuts" }),
        documents: HEALTH_DOCS,
        requirements: [
            { key: "physical", label: "Physical received", resolved: true, met: true, detail: null, ownerCard: "documents" },
            { key: "immunization", label: "Immunization record", resolved: false, met: false, detail: null, ownerCard: "documents" },
            { key: "med_auth", label: "Medication authorization", resolved: false, met: false, detail: null, ownerCard: "documents" },
        ],
        emergencyContactCount: 1,
    }),
    unresolved: buildHealthSafetyCardEvidence({ fields: null }),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Staff specimens
// ─────────────────────────────────────────────────────────────────────────────

function person(
    personId: string,
    name: string,
    positionLabel: string,
    basis: StaffPersonRow["basis"],
    opts: Partial<StaffPersonRow> = {},
): StaffPersonRow {
    return {
        personId,
        name,
        imageUrl: null,
        positionLabel,
        assignmentTypeLabel: opts.assignmentTypeLabel ?? null,
        roomLabel: opts.roomLabel ?? null,
        siteLabel: opts.siteLabel ?? "Firefly Main",
        isPrimary: opts.isPrimary ?? false,
        basis,
        effectiveFrom: opts.effectiveFrom ?? "2026-08-01",
        effectiveTo: opts.effectiveTo ?? null,
    };
}

export const STAFF_SPECIMENS = {
    one: buildStaffCardEvidence({
        people: [
            person("p1", "Taylor Reed", "Lead Teacher", "room_assignment", {
                isPrimary: true,
                roomLabel: "Infant Room",
                assignmentTypeLabel: "Classroom coverage",
            }),
        ],
    }),
    severalRoles: buildStaffCardEvidence({
        people: [
            person("p1", "Taylor Reed", "Lead Teacher", "room_assignment", {
                isPrimary: true,
                roomLabel: "Infant Room",
                assignmentTypeLabel: "Classroom coverage",
            }),
            person("p2", "Jordan Lee", "Assistant Teacher", "room_assignment", {
                roomLabel: "Infant Room",
                assignmentTypeLabel: "Classroom coverage",
            }),
            person("p3", "Sam Ortiz", "Floater", "site_assignment", {
                assignmentTypeLabel: "Site float",
            }),
            person("p4", "Maya Singh", "Center Director", "program_leadership"),
            person("p5", "Alex Kim", "Enrollment Specialist", "process_owner"),
        ],
    }),
    none: buildStaffCardEvidence({ people: [] }),
    unresolved: buildStaffCardEvidence({ people: null }),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Attendance specimens
// ─────────────────────────────────────────────────────────────────────────────

function day(
    serviceDate: string,
    weekdayLabel: string,
    state: AttendanceDayRow["state"],
    opts: Partial<AttendanceDayRow> = {},
): AttendanceDayRow {
    return {
        serviceDate,
        weekdayLabel,
        expected: opts.expected ?? state !== "closed",
        expectedWindowLabel: opts.expectedWindowLabel ?? "8:00 AM – 4:30 PM",
        checkInLabel: opts.checkInLabel ?? null,
        checkOutLabel: opts.checkOutLabel ?? null,
        state,
        absenceReasonLabel: opts.absenceReasonLabel ?? null,
        absenceExcused: opts.absenceExcused ?? null,
        missingCheckout: opts.missingCheckout ?? false,
        corrected: opts.corrected ?? false,
        roomLabel: opts.roomLabel ?? "Infant Room",
    };
}

const WEEK_BASE = [
    day("2026-08-17", "Mon", "checked_out", { checkInLabel: "8:01 AM", checkOutLabel: "4:26 PM" }),
    day("2026-08-18", "Tue", "checked_out", { checkInLabel: "8:07 AM", checkOutLabel: "4:31 PM" }),
];

export const ATTENDANCE_SPECIMENS = {
    present: buildAttendanceCardEvidence({
        days: [...WEEK_BASE, day("2026-08-19", "Wed", "present", { checkInLabel: "8:04 AM" })],
        todayServiceDate: "2026-08-19",
    }),
    notArrived: buildAttendanceCardEvidence({
        days: [...WEEK_BASE, day("2026-08-19", "Wed", "not_arrived")],
        todayServiceDate: "2026-08-19",
        varianceCount: 1,
    }),
    completedDay: buildAttendanceCardEvidence({
        days: [...WEEK_BASE, day("2026-08-19", "Wed", "checked_out", { checkInLabel: "8:04 AM", checkOutLabel: "4:22 PM" })],
        todayServiceDate: "2026-08-19",
    }),
    absent: buildAttendanceCardEvidence({
        days: [
            ...WEEK_BASE,
            day("2026-08-19", "Wed", "absent", { absenceReasonLabel: "Illness", absenceExcused: true }),
        ],
        todayServiceDate: "2026-08-19",
        varianceCount: 1,
    }),
    missingCheckout: buildAttendanceCardEvidence({
        days: [
            ...WEEK_BASE,
            day("2026-08-19", "Wed", "present", { checkInLabel: "8:04 AM", missingCheckout: true }),
        ],
        todayServiceDate: "2026-08-19",
        varianceCount: 1,
    }),
    corrected: buildAttendanceCardEvidence({
        days: [
            day("2026-08-17", "Mon", "checked_out", { checkInLabel: "8:01 AM", checkOutLabel: "4:26 PM", corrected: true }),
            WEEK_BASE[1]!,
            day("2026-08-19", "Wed", "checked_out", { checkInLabel: "8:04 AM", checkOutLabel: "4:20 PM" }),
        ],
        todayServiceDate: "2026-08-19",
    }),
    closedDay: buildAttendanceCardEvidence({
        days: [...WEEK_BASE, day("2026-08-19", "Wed", "closed", { expected: false, expectedWindowLabel: null })],
        todayServiceDate: "2026-08-19",
    }),
    /** The pattern configures no default hours — the window is omitted, never substituted. */
    noConfiguredWindow: buildAttendanceCardEvidence({
        days: [day("2026-08-19", "Wed", "not_arrived", { expectedWindowLabel: null })],
        todayServiceDate: "2026-08-19",
    }),
    unresolved: buildAttendanceCardEvidence({ days: null, todayServiceDate: null }),
} as const;

/** Staff variant — same blueprint, facts from `staff_presence_events`. */
export const ATTENDANCE_STAFF_VARIANT = buildAttendanceCardEvidence({
    days: [
        day("2026-08-17", "Mon", "checked_out", { checkInLabel: "7:28 AM", checkOutLabel: "4:02 PM", roomLabel: "Infant Room" }),
        day("2026-08-18", "Tue", "checked_out", { checkInLabel: "7:31 AM", checkOutLabel: "4:00 PM", roomLabel: "Infant Room" }),
        day("2026-08-19", "Wed", "present", { checkInLabel: "7:26 AM", roomLabel: "Infant Room" }),
    ],
    todayServiceDate: "2026-08-19",
    // Staff DOES have registered capabilities: staff_presence.record / staff_presence.correct.
    mutationCapabilitiesRegistered: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Billing specimens
// ─────────────────────────────────────────────────────────────────────────────

export const BILLING_SPECIMENS = {
    setupIncomplete: buildBillingCardEvidence({
        billingContactName: null,
        billingContactEmail: null,
        tuitionRateLabel: null,
        tuitionResolved: true,
    }),
    configured: buildBillingCardEvidence({
        billingContactName: "Sarah Wright",
        billingContactEmail: "sarah@example.com",
        tuitionRateLabel: "$1,850 / month",
        tuitionResolved: true,
        charges: [
            { id: "c1", label: "August tuition", amountLabel: "$1,850.00", status: "posted", serviceDate: "2026-08-01", dueDate: "2026-08-01", isPreview: false },
            { id: "c2", label: "Registration fee", amountLabel: "$150.00", status: "posted", serviceDate: "2026-08-01", dueDate: "2026-08-01", isPreview: false },
        ],
    }),
    balanceDue: buildBillingCardEvidence({
        billingContactName: "Sarah Wright",
        billingContactEmail: "sarah@example.com",
        tuitionRateLabel: "$1,850 / month",
        tuitionResolved: true,
        feeBalanceCents: 125000,
        charges: [
            { id: "c3", label: "September tuition", amountLabel: "$1,850.00", status: "draft", serviceDate: "2026-09-01", dueDate: "2026-09-01", isPreview: false },
            { id: "c4", label: "Late-pickup obligation", amountLabel: "$25.00", status: "draft", serviceDate: "2026-08-18", dueDate: null, isPreview: true },
        ],
    }),
    /** The financial-config API has not answered — HOLD, do not print "1 item missing". */
    unresolved: buildBillingCardEvidence({
        billingContactName: "Sarah Wright",
        billingContactEmail: "sarah@example.com",
        tuitionRateLabel: null,
        tuitionResolved: false,
    }),
} as const;
