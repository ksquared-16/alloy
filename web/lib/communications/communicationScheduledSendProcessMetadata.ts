import type { CommunicationScheduledSendRow } from "@/lib/communications/communicationScheduledSendsService";

/** Legacy Task Assist flag on outbound message metadata from process-due. */
export const TASK_ASSIST_SCHEDULED_SEND_METADATA_FLAG = "task_assist_scheduled_send" as const;

export const TOUR_SCHEDULING_PROCESS_DUE_SOURCE = "tour_scheduling" as const;

const TOUR_SCHEDULED_SEND_METADATA_KEYS = {
    tourBookingId: "tour_booking_id",
    reminderKey: "reminder_key",
    scheduleGeneration: "schedule_generation",
    eventKey: "event_key",
    tourStartAt: "tour_start_at",
    locationId: "location_id",
    quietHoursAdjusted: "quiet_hours_adjusted",
} as const;

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function metadataString(meta: Record<string, unknown>, key: string): string | undefined {
    const v = meta[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function metadataNumber(meta: Record<string, unknown>, key: string): number | undefined {
    const v = meta[key];
    if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
    return undefined;
}

/**
 * Build outbound message metadata augment for process-due scheduled send execution.
 * Task Assist rows keep legacy `task_assist_scheduled_send`; tour rows pass tour metadata.
 */
export function buildCommunicationScheduledSendProcessMetadataAugment(
    row: Pick<CommunicationScheduledSendRow, "id" | "source" | "entity_id" | "entity_type" | "channel" | "metadata">
): Record<string, unknown> {
    const base = { communication_scheduled_send_id: row.id };
    const meta = isRecord(row.metadata) ? row.metadata : {};
    const source = String(row.source ?? "").trim();

    if (source === TOUR_SCHEDULING_PROCESS_DUE_SOURCE) {
        const out: Record<string, unknown> = {
            ...base,
            source: TOUR_SCHEDULING_PROCESS_DUE_SOURCE,
            channel: row.channel,
        };
        if (row.entity_type === "opportunities" && row.entity_id) {
            out.opportunity_id = row.entity_id;
        }
        const tourBookingId = metadataString(meta, TOUR_SCHEDULED_SEND_METADATA_KEYS.tourBookingId);
        if (tourBookingId) out[TOUR_SCHEDULED_SEND_METADATA_KEYS.tourBookingId] = tourBookingId;
        const reminderKey = metadataString(meta, TOUR_SCHEDULED_SEND_METADATA_KEYS.reminderKey);
        if (reminderKey) out[TOUR_SCHEDULED_SEND_METADATA_KEYS.reminderKey] = reminderKey;
        const scheduleGeneration = metadataNumber(meta, TOUR_SCHEDULED_SEND_METADATA_KEYS.scheduleGeneration);
        if (scheduleGeneration != null) out[TOUR_SCHEDULED_SEND_METADATA_KEYS.scheduleGeneration] = scheduleGeneration;
        const eventKey = metadataString(meta, TOUR_SCHEDULED_SEND_METADATA_KEYS.eventKey);
        if (eventKey) out[TOUR_SCHEDULED_SEND_METADATA_KEYS.eventKey] = eventKey;
        const tourStartAt = metadataString(meta, TOUR_SCHEDULED_SEND_METADATA_KEYS.tourStartAt);
        if (tourStartAt) out[TOUR_SCHEDULED_SEND_METADATA_KEYS.tourStartAt] = tourStartAt;
        const locationId = metadataString(meta, TOUR_SCHEDULED_SEND_METADATA_KEYS.locationId);
        if (locationId) out[TOUR_SCHEDULED_SEND_METADATA_KEYS.locationId] = locationId;
        if (meta[TOUR_SCHEDULED_SEND_METADATA_KEYS.quietHoursAdjusted] === true) {
            out[TOUR_SCHEDULED_SEND_METADATA_KEYS.quietHoursAdjusted] = true;
        }
        return out;
    }

    if (source === "task_assist") {
        return {
            ...base,
            [TASK_ASSIST_SCHEDULED_SEND_METADATA_FLAG]: true,
        };
    }

    return {
        ...base,
        scheduled_send_source: source || "unknown",
    };
}
