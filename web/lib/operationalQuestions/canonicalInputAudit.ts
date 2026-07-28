/**
 * Canonical input audit — Operational Intelligence expansion (Room Utilization batch).
 *
 * Program Utilization and Ratio Risk are deferred until sources exist.
 */

export type CanonicalInputAuditRow = {
    stableKey: string;
    businessDefinition: string;
    grain: "room" | "program" | "org";
    unit: "seats" | "children" | "staff" | "percent";
    effectiveDateBehavior: string;
    sourceOwner: string;
    resolver: string;
    nullBehavior: string;
    authorization: string;
    provenance: string;
    status: "available" | "missing" | "partial";
};

/** Room Utilization — implemented */
export const ROOM_UTILIZATION_INPUTS: CanonicalInputAuditRow[] = [
    {
        stableKey: "occupancy.expected",
        businessDefinition:
            "Children expected in the room on the selected date from committed schedules / active enrollment expectations.",
        grain: "room",
        unit: "children",
        effectiveDateBehavior: "Point-in-time on selected effective date (not a forecast).",
        sourceOwner: "childcareOperational.expectations + OCCUPANCY_EXPECTED",
        resolver: "web/lib/organizationCalculations/occupancyProjection.ts",
        nullBehavior: "Resolves to 0 when no children expected; incomplete when site missing.",
        authorization: "Org-scoped via admin client + location org check in evaluateForRoom",
        provenance: "Schedule expectations entries for room/date",
        status: "available",
    },
    {
        stableKey: "capacity.room_binding.binding",
        businessDefinition: "Most restrictive known seat limit for the room (effective capacity).",
        grain: "room",
        unit: "seats",
        effectiveDateBehavior: "Effective-dated capacity rule bundle projection.",
        sourceOwner: "childcareOperational.config capacity rules",
        resolver: "web/lib/organizationCalculations/capacityProjection.ts",
        nullBehavior: "Unavailable / incomplete — never treated as zero for utilization denominator.",
        authorization: "Org-scoped capacity config load",
        provenance: "Room binding projection fields",
        status: "available",
    },
];

/** Program Utilization — deferred */
export const PROGRAM_UTILIZATION_BLOCKERS: string[] = [
    "No canonical program-grain occupancy aggregator that sums included rooms with membership resolution.",
    "No approved program membership / room inclusion SoT that excludes unavailable rooms without silent omission.",
    "V1 preference: result unavailable unless all included room capacities are available — needs membership + coverage reporting.",
];

/** Ratio Risk — deferred */
export const RATIO_RISK_BLOCKERS: string[] = [
    "Required staff can be projected from ratio rules, but scheduled/on-hand staff for a room+date lacks a canonical org-scoped resolver (G3).",
    "Do not substitute enrollment count for staffing data.",
    "Without scheduled staff, Covered / At risk answers would be dishonest.",
];

export const EXPANSION_QUESTION_STATUS = {
    future_room_capacity: "implemented",
    room_utilization: "implemented",
    program_utilization: "deferred",
    ratio_risk: "deferred",
} as const;
