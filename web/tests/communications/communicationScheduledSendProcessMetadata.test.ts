import { describe, expect, it } from "vitest";

import {
    buildCommunicationScheduledSendProcessMetadataAugment,
    TASK_ASSIST_SCHEDULED_SEND_METADATA_FLAG,
    TOUR_SCHEDULING_PROCESS_DUE_SOURCE,
} from "@/lib/communications/communicationScheduledSendProcessMetadata";

const sendId = "55555555-5555-4555-8555-555555555555";
const oppId = "33333333-3333-4333-8333-333333333333";
const bookingId = "66666666-6666-4666-8666-666666666666";

describe("buildCommunicationScheduledSendProcessMetadataAugment", () => {
    it("preserves Task Assist metadata flag", () => {
        const augment = buildCommunicationScheduledSendProcessMetadataAugment({
            id: sendId,
            source: "task_assist",
            entity_id: oppId,
            entity_type: "opportunities",
            channel: "sms",
            metadata: {},
        });
        expect(augment).toEqual({
            communication_scheduled_send_id: sendId,
            [TASK_ASSIST_SCHEDULED_SEND_METADATA_FLAG]: true,
        });
    });

    it("passes tour scheduling metadata without Task Assist flag", () => {
        const augment = buildCommunicationScheduledSendProcessMetadataAugment({
            id: sendId,
            source: TOUR_SCHEDULING_PROCESS_DUE_SOURCE,
            entity_id: oppId,
            entity_type: "opportunities",
            channel: "email",
            metadata: {
                tour_booking_id: bookingId,
                reminder_key: "tour_reminder_24h",
                schedule_generation: 42,
                event_key: "tour_reminder",
                tour_start_at: "2026-06-16T12:00:00.000Z",
                location_id: "loc-1",
                quiet_hours_adjusted: true,
            },
        });
        expect(augment).toMatchObject({
            communication_scheduled_send_id: sendId,
            source: TOUR_SCHEDULING_PROCESS_DUE_SOURCE,
            opportunity_id: oppId,
            channel: "email",
            tour_booking_id: bookingId,
            reminder_key: "tour_reminder_24h",
            schedule_generation: 42,
            event_key: "tour_reminder",
            tour_start_at: "2026-06-16T12:00:00.000Z",
            location_id: "loc-1",
            quiet_hours_adjusted: true,
        });
        expect(augment[TASK_ASSIST_SCHEDULED_SEND_METADATA_FLAG]).toBeUndefined();
    });

    it("uses safe fallback for unknown scheduled send source", () => {
        const augment = buildCommunicationScheduledSendProcessMetadataAugment({
            id: sendId,
            source: "future_source",
            entity_id: oppId,
            entity_type: "opportunities",
            channel: "sms",
            metadata: {},
        });
        expect(augment).toEqual({
            communication_scheduled_send_id: sendId,
            scheduled_send_source: "future_source",
        });
        expect(augment[TASK_ASSIST_SCHEDULED_SEND_METADATA_FLAG]).toBeUndefined();
    });
});
