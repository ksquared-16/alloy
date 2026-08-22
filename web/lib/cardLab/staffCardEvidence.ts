/**
 * Staff card evidence — "Which staff members are relevant to this subject, in what role, and
 * under what assignment?"
 *
 * ── A COMPOSED PROJECTION, PRESENTED AS A RELATIONSHIP CARD ──
 *
 * It should FEEL like Household and Children. It is not derived like them. Household reads a
 * stored edge (`customer_persons`); Children reads a stored collection (`customer_members`).
 * There is NO stored edge between a child and a staff member, and there must not be: it would
 * contradict `schedule_assignments` the moment a room changed.
 *
 * Relevance is derived:
 *
 *   child → effective schedule_assignment (subject_type='child') → room_location_id, site, date
 *         → staff schedule_assignments (subject_type='staff') covering that room + date
 *         → employments covering that person on that date       → position_id → label
 *
 * That premise is SHARED OPERATIONAL CONTEXT, not childcare — which is why the card is reusable
 * anywhere a subject resolves to a place and a time.
 *
 * ── UNRESOLVED MATTERS MORE HERE THAN ALMOST ANYWHERE ──
 *
 * "No staff assigned to this child" is an operational alarm. It must never be printed because a
 * projection had not loaded. `unresolved` and `empty` are separate answers.
 *
 * ── NO SECOND SCHEDULER ──
 *
 * `employments` states it directly: "Time-bound room/site staffing stays in schedule_assignments
 * — this is NOT a second scheduler." The Staff card inherits that: it reads assignments and hands
 * off to `scheduling`, which already owns every `assignment.*` capability. It never edits one.
 *
 * @see docs/platform/operator/operational-card-system-expansion.md §5
 */

import { type CardLabEvidenceBase, type CardLabHandoff } from "@/lib/cardLab/cardLabTypes";

/** Why this person is relevant to this subject. Configured which bases are included. */
export type StaffRelevanceBasis =
    | "room_assignment"
    | "site_assignment"
    | "process_owner"
    | "program_leadership";

export type StaffPersonRow = {
    /** `persons.id` — how a staff subject is identified everywhere. */
    personId: string;
    name: string;
    imageUrl: string | null;
    /** `employment_positions.label` — configuration-owned tenant words, not a platform enum. */
    positionLabel: string | null;
    /** `operational_assignment_types.label` — configuration-owned. */
    assignmentTypeLabel: string | null;
    roomLabel: string | null;
    siteLabel: string | null;
    /** `schedule_assignments.is_primary`. */
    isPrimary: boolean;
    basis: StaffRelevanceBasis;
    effectiveFrom: string | null;
    effectiveTo: string | null;
};

export type StaffGroup = {
    key: string;
    /** Configured group label. */
    label: string;
    people: StaffPersonRow[];
};

export type StaffCardEvidence = CardLabEvidenceBase & {
    groups: StaffGroup[];
    totalCount: number;
    primary: StaffPersonRow | null;
    /** Open a person's durable record. Read-only handoff. */
    personHandoff: CardLabHandoff;
    /** Change an assignment — owned by `scheduling`, never executed here. */
    assignmentHandoff: CardLabHandoff;
};

export type StaffGroupDefinition = {
    key: string;
    label: string;
    /** Which relevance bases fall into this group. Configuration. */
    bases: readonly StaffRelevanceBasis[];
};

/** Reference composition. An org authors its own; the blueprint stays industry-agnostic. */
export const STAFF_REFERENCE_GROUPS: readonly StaffGroupDefinition[] = [
    { key: "primary", label: "Primary", bases: ["room_assignment"] },
    { key: "other_assigned", label: "Other assigned staff", bases: ["room_assignment", "site_assignment"] },
    { key: "leadership", label: "Program leadership", bases: ["program_leadership"] },
    { key: "process_owner", label: "Process owner", bases: ["process_owner"] },
];

export type StaffEvidenceInput = {
    /** `null` = the assignment projection has not answered. NOT "nobody is assigned". */
    people: readonly StaffPersonRow[] | null;
    groups?: readonly StaffGroupDefinition[];
};

export function buildStaffCardEvidence(input: StaffEvidenceInput): StaffCardEvidence {
    if (input.people == null) {
        return {
            groups: [],
            totalCount: 0,
            primary: null,
            personHandoff: "child_identity",
            assignmentHandoff: "scheduling",
            answerLine: "",
            supportingLine: null,
            statusChip: null,
            statusTone: "neutral",
            resolution: "unresolved",
        };
    }

    const definitions = input.groups ?? STAFF_REFERENCE_GROUPS;
    const people = [...input.people];
    const primary = people.find((p) => p.isPrimary && p.basis === "room_assignment") ?? null;

    // Each person lands in the FIRST configured group that admits their basis, so a person is
    // never counted twice. "Primary" additionally requires is_primary.
    const claimed = new Set<string>();
    const groups: StaffGroup[] = [];
    for (const def of definitions) {
        const members = people.filter((p) => {
            if (claimed.has(p.personId)) return false;
            if (!def.bases.includes(p.basis)) return false;
            if (def.key === "primary" && !p.isPrimary) return false;
            return true;
        });
        for (const m of members) claimed.add(m.personId);
        if (members.length > 0) groups.push({ key: def.key, label: def.label, people: members });
    }

    const totalCount = people.length;

    let answerLine: string;
    let supportingLine: string | null;
    let statusChip: string | null;

    if (totalCount === 0) {
        // Resolved and genuinely nobody. This is an ANSWER, and an operationally loud one.
        answerLine = "No staff assigned";
        supportingLine = "Nobody covers this subject's room on this date";
        statusChip = null;
    } else if (primary) {
        answerLine = primary.name;
        const detail = [primary.positionLabel, primary.roomLabel].filter(Boolean).join(" · ");
        supportingLine =
            totalCount > 1
                ? `${detail}${detail ? " · " : ""}+${totalCount - 1} other${totalCount - 1 === 1 ? "" : "s"}`
                : detail || null;
        statusChip = null;
    } else {
        answerLine = `${totalCount} staff member${totalCount === 1 ? "" : "s"}`;
        supportingLine = groups[0]?.people[0]?.positionLabel ?? null;
        statusChip = null;
    }

    return {
        groups,
        totalCount,
        primary,
        personHandoff: "child_identity",
        assignmentHandoff: "scheduling",
        answerLine,
        supportingLine,
        statusChip,
        statusTone: totalCount > 0 ? "ready" : "neutral",
        resolution: totalCount === 0 ? "empty" : "settled",
    };
}
