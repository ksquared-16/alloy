/**
 * Enrollment placement requiredness by Business Process phase — operator doctrine.
 * @see docs/system/enrollment-placement-doctrine.md
 */

export type EnrollmentPlacementPhase =
    | "lead"
    | "qualification"
    | "tour"
    | "decision"
    | "placement_enrolling"
    | "enrolled";

export type PlacementFieldKey = "location" | "program" | "room" | "schedule";

export type PhasePlacementRequirement = {
    phase: EnrollmentPlacementPhase;
    label: string;
    required: readonly PlacementFieldKey[];
    not_required: readonly PlacementFieldKey[];
    /** Lead also requires family identity — not a placement field but noted in doctrine. */
    notes?: string;
};

export const ENROLLMENT_PLACEMENT_PHASE_REQUIREMENTS: readonly PhasePlacementRequirement[] = [
    {
        phase: "lead",
        label: "Lead",
        required: ["location"],
        not_required: ["program", "room", "schedule"],
        notes: "Family identity required; Location anchors site context.",
    },
    {
        phase: "qualification",
        label: "Qualification",
        required: ["program"],
        not_required: ["room", "schedule"],
    },
    {
        phase: "tour",
        label: "Tour",
        required: ["program"],
        not_required: ["room", "schedule"],
    },
    {
        phase: "decision",
        label: "Decision",
        required: ["program"],
        not_required: ["room", "schedule"],
    },
    {
        phase: "placement_enrolling",
        label: "Placement / Enrolling",
        required: ["program", "room", "schedule"],
        not_required: [],
    },
    {
        phase: "enrolled",
        label: "Enrolled",
        required: ["program", "room", "schedule"],
        not_required: [],
    },
] as const;

export function placementRequiredForPhase(
    phase: EnrollmentPlacementPhase,
    field: PlacementFieldKey
): boolean {
    const row = ENROLLMENT_PLACEMENT_PHASE_REQUIREMENTS.find((r) => r.phase === phase);
    return row?.required.includes(field) ?? false;
}
