export type TourAvailabilityRulePatch = Partial<{
    location_id: string | null;
    user_id: string | null;
    day_of_week: number;
    start_time: string;
    end_time: string;
    timezone: string;
    slot_duration_minutes: number;
    buffer_minutes: number;
    max_bookings_per_slot: number;
    approval_required: boolean;
    is_active: boolean;
    metadata: Record<string, unknown>;
}>;

type PatchResult =
    | { ok: true; patch: TourAvailabilityRulePatch }
    | { ok: false; error: string };

const ALLOWED_FIELDS = new Set<keyof TourAvailabilityRulePatch>([
    "location_id",
    "user_id",
    "day_of_week",
    "start_time",
    "end_time",
    "timezone",
    "slot_duration_minutes",
    "buffer_minutes",
    "max_bookings_per_slot",
    "approval_required",
    "is_active",
    "metadata",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

export function buildTourAvailabilityRulePatch(input: unknown): PatchResult {
    if (!isPlainObject(input)) return { ok: false, error: "Invalid tour availability payload" };

    const unsupported = Object.keys(input).find(
        (key) => !ALLOWED_FIELDS.has(key as keyof TourAvailabilityRulePatch),
    );
    if (unsupported) return { ok: false, error: `Unsupported field: ${unsupported}` };
    if (Object.keys(input).length === 0) return { ok: false, error: "No fields to update" };

    const patch: TourAvailabilityRulePatch = {};

    for (const field of ["location_id", "user_id"] as const) {
        if (input[field] === undefined) continue;
        if (input[field] === null) {
            patch[field] = null;
            continue;
        }
        if (typeof input[field] !== "string" || !input[field].trim()) {
            return { ok: false, error: `${field} must be a non-empty string or null` };
        }
        patch[field] = input[field].trim();
    }

    if (input.day_of_week !== undefined) {
        if (!Number.isInteger(input.day_of_week) || Number(input.day_of_week) < 0 || Number(input.day_of_week) > 6) {
            return { ok: false, error: "day_of_week must be an integer from 0 through 6" };
        }
        patch.day_of_week = Number(input.day_of_week);
    }

    for (const field of ["start_time", "end_time", "timezone"] as const) {
        if (input[field] === undefined) continue;
        if (typeof input[field] !== "string" || !input[field].trim()) {
            return { ok: false, error: `${field} must be a non-empty string` };
        }
        patch[field] = input[field].trim();
    }

    for (const [field, minimum] of [
        ["slot_duration_minutes", 1],
        ["buffer_minutes", 0],
        ["max_bookings_per_slot", 1],
    ] as const) {
        if (input[field] === undefined) continue;
        if (!Number.isInteger(input[field]) || Number(input[field]) < minimum) {
            return { ok: false, error: `${field} must be an integer of at least ${minimum}` };
        }
        patch[field] = Number(input[field]);
    }

    for (const field of ["approval_required", "is_active"] as const) {
        if (input[field] === undefined) continue;
        if (typeof input[field] !== "boolean") {
            return { ok: false, error: `${field} must be a boolean` };
        }
        patch[field] = input[field];
    }

    if (input.metadata !== undefined) {
        if (!isPlainObject(input.metadata)) return { ok: false, error: "metadata must be an object" };
        patch.metadata = input.metadata;
    }

    return { ok: true, patch };
}
