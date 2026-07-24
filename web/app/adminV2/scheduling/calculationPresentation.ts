/**
 * Operator presentation for the Operational Calculations catalogue.
 *
 * The Calculations section in Studio is an OPERATOR EXPLANATION surface, not an
 * engineering registry: operators should read "Room Recommendation", not
 * `placement.room_fit`. This maps each registered calculation key to a plain name +
 * explanation (and, where useful, the human inputs it weighs). The technical key stays
 * available as secondary metadata. Unmapped keys fall back to the registry's own purpose.
 *
 * This is presentation only — it never changes what a calculation computes or owns.
 */

export type CalculationPresentation = {
    /** Operator-facing name. */
    name: string;
    /** One plain sentence an operator understands. */
    description: string;
    /** Optional human inputs the calculation weighs (shown as chips). */
    inputs?: string[];
};

const BY_KEY: Record<string, CalculationPresentation> = {
    "placement.room_fit": {
        name: "Room Recommendation",
        description: "Finds the best eligible room for a child.",
        inputs: ["Age", "Program", "Schedule", "Ratios", "Capacity"],
    },
    "occupancy.expected": {
        name: "Expected Occupancy",
        description: "How many children are expected in a room on a day, from committed schedules.",
    },
    "occupancy.actual": {
        name: "Actual Occupancy",
        description: "How many children were actually present in a room on a day.",
    },
    "capacity.room_binding": {
        name: "Room Capacity",
        description: "The most seats a room can hold, and which limit sets it.",
    },
    "capacity.remaining": {
        name: "Remaining Seats",
        description: "How many seats remain in a room right now.",
    },
    "resource.required_staff": {
        name: "Required Staff",
        description: "How many staff a room needs to stay within ratio for its children.",
    },
    "resource.ratio": {
        name: "Ratio Capacity",
        description: "The most children a room can hold under its ratio tiers.",
    },
    "scheduling.expected_staffing": {
        name: "Expected Staffing",
        description: "The staff the expected occupancy requires.",
    },
    "scheduling.actual_staffing": {
        name: "Actual Staffing",
        description: "The staff the actual occupancy requires.",
    },
};

/** Operator group name for a calculation family (falls back to a title-cased family). */
const FAMILY_LABEL: Record<string, string> = {
    placement: "Placement",
    occupancy: "Occupancy",
    capacity: "Capacity",
    resource_requirements: "Staffing & ratios",
    scheduling: "Staffing",
};

export function presentCalculation(key: string, purpose: string): CalculationPresentation {
    return BY_KEY[key] ?? { name: prettyKey(key), description: purpose };
}

export function presentFamily(family: string): string {
    return FAMILY_LABEL[family] ?? family.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Last-resort readable name from a key (e.g. "capacity.remaining" → "Remaining"). */
function prettyKey(key: string): string {
    const tail = key.split(".").pop() ?? key;
    return tail.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
