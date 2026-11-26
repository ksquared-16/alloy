/** Read tour-schedule panel inputs from operational truth — no drawer VM dependency. */

export type OpportunityTourScheduleTruthFields = {
    locationId: string | null;
    initialTourDate: string | null;
    initialTourTime: string | null;
};

function readStringField(record: unknown, key: string): string | null {
    if (!record || typeof record !== "object") return null;
    const value = (record as Record<string, unknown>)[key];
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
}

export function resolveOpportunityTourScheduleFromTruth(truth: unknown): OpportunityTourScheduleTruthFields {
    const locationId =
        readStringField(truth, "location_id")
        ?? readStringField(truth, "_location_id");

    const metadata =
        truth && typeof truth === "object" && (truth as Record<string, unknown>).metadata != null
            ? (truth as Record<string, unknown>).metadata
            : null;

    const initialTourDate =
        metadata && typeof metadata === "object" && typeof (metadata as Record<string, unknown>).tour_date === "string"
            ? String((metadata as Record<string, unknown>).tour_date).trim() || null
            : null;

    const initialTourTime =
        metadata && typeof metadata === "object" && typeof (metadata as Record<string, unknown>).tour_time === "string"
            ? String((metadata as Record<string, unknown>).tour_time).trim() || null
            : null;

    return { locationId, initialTourDate, initialTourTime };
}
