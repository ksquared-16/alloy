/**
 * Parent attendance confirmation + ICS SEQUENCE helpers for Tour bookings.
 *
 * Parent attendance is operational state around a confirmed booking — never a
 * gate that cancels or unconfirms `status_key`.
 *
 * Internal calendar recipients are configured via TourCommsConfig.internal_recipients
 * (not persisted as Tour Host / additional attendees on the booking).
 */

export const TOUR_BOOKING_METADATA_KEYS = {
    attendanceConfirmation: "attendance_confirmation",
    icsSequence: "ics_sequence",
    ruleId: "rule_id",
} as const;

export type TourAttendanceConfirmationStatus =
    | "awaiting_response"
    | "confirmed_by_parent"
    | "declined_needs_change";

export type TourAttendanceConfirmation = {
    status: TourAttendanceConfirmationStatus;
    confirmed_at?: string | null;
    confirmed_by_person_id?: string | null;
    source?: "email_action" | "sms_reply" | "operator" | null;
    action_link_id?: string | null;
};

export function asMetadataRecord(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        return { ...(raw as Record<string, unknown>) };
    }
    return {};
}

export function readAttendanceConfirmation(metadata: unknown): TourAttendanceConfirmation | null {
    const md = asMetadataRecord(metadata);
    const raw = md[TOUR_BOOKING_METADATA_KEYS.attendanceConfirmation];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const status = String((raw as { status?: unknown }).status ?? "").trim();
    if (
        status !== "awaiting_response"
        && status !== "confirmed_by_parent"
        && status !== "declined_needs_change"
    ) {
        return null;
    }
    const confirmedAt = (raw as { confirmed_at?: unknown }).confirmed_at;
    const personId = (raw as { confirmed_by_person_id?: unknown }).confirmed_by_person_id;
    const source = (raw as { source?: unknown }).source;
    const actionLinkId = (raw as { action_link_id?: unknown }).action_link_id;
    return {
        status,
        confirmed_at: typeof confirmedAt === "string" ? confirmedAt : null,
        confirmed_by_person_id: typeof personId === "string" ? personId : null,
        source:
            source === "email_action" || source === "sms_reply" || source === "operator"
                ? source
                : null,
        action_link_id: typeof actionLinkId === "string" ? actionLinkId : null,
    };
}

export function withAttendanceConfirmation(
    metadata: unknown,
    confirmation: TourAttendanceConfirmation,
): Record<string, unknown> {
    const md = asMetadataRecord(metadata);
    return {
        ...md,
        [TOUR_BOOKING_METADATA_KEYS.attendanceConfirmation]: {
            status: confirmation.status,
            ...(confirmation.confirmed_at ? { confirmed_at: confirmation.confirmed_at } : {}),
            ...(confirmation.confirmed_by_person_id
                ? { confirmed_by_person_id: confirmation.confirmed_by_person_id }
                : {}),
            ...(confirmation.source ? { source: confirmation.source } : {}),
            ...(confirmation.action_link_id ? { action_link_id: confirmation.action_link_id } : {}),
        },
    };
}

/** After a material reschedule, parent attendance must be re-affirmed. */
export function resetAttendanceAwaitingResponse(metadata: unknown): Record<string, unknown> {
    return withAttendanceConfirmation(metadata, { status: "awaiting_response" });
}

export function readIcsSequence(metadata: unknown): number {
    const md = asMetadataRecord(metadata);
    const raw = md[TOUR_BOOKING_METADATA_KEYS.icsSequence];
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
}

export function withIcsSequence(metadata: unknown, sequence: number): Record<string, unknown> {
    const md = asMetadataRecord(metadata);
    return {
        ...md,
        [TOUR_BOOKING_METADATA_KEYS.icsSequence]: Math.max(0, Math.floor(sequence)),
    };
}

export function bumpIcsSequence(metadata: unknown): { metadata: Record<string, unknown>; sequence: number } {
    const next = readIcsSequence(metadata) + 1;
    return { metadata: withIcsSequence(metadata, next), sequence: next };
}

export function attendanceStatusLabel(status: TourAttendanceConfirmationStatus | null | undefined): string {
    if (status === "confirmed_by_parent") return "Confirmed by parent";
    if (status === "declined_needs_change") return "Needs change";
    if (status === "awaiting_response") return "Awaiting response";
    return "Awaiting response";
}
