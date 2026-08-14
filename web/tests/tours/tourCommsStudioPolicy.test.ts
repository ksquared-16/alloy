import { describe, expect, it } from "vitest";

import {
    DEFAULT_TOUR_COMMS_CONFIG,
    mergeTourCommsConfig,
    parseTourCommsConfigFragment,
    type TourCommsChannel,
} from "@/lib/tours/comms/tourCommsConfig";
import {
    buildTourCommsStudioDraftFromConfig,
    deriveTourReminderKey,
    isTourSystemTemplateSystemKey,
    reminderAmountToOffsetMinutes,
    serializeTourCommsStudioDraftToFragment,
    serializeTourReminderOffsets,
    tourSystemTemplateEventKey,
    tourTemplateShowsInternalRecipients,
    tourTemplateShowsReminderControls,
    validateTourCommsStudioDraft,
} from "@/lib/tours/comms/tourCommsStudioPolicy";

describe("tourCommsStudioPolicy — UI helpers", () => {
    it("detects tour system templates by system_key prefix", () => {
        expect(isTourSystemTemplateSystemKey("tour_reminder:email")).toBe(true);
        expect(isTourSystemTemplateSystemKey("custom_welcome")).toBe(false);
        expect(tourSystemTemplateEventKey("tour_confirmation:email")).toBe("tour_confirmation");
    });

    it("maps template event keys to section visibility", () => {
        expect(tourTemplateShowsReminderControls("tour_reminder")).toBe(true);
        expect(tourTemplateShowsReminderControls("tour_confirmation")).toBe(false);
        expect(tourTemplateShowsInternalRecipients("tour_cancel")).toBe(true);
        expect(tourTemplateShowsInternalRecipients("tour_invitation")).toBe(false);
    });

    it("builds studio draft from merged config (24h default)", () => {
        const draft = buildTourCommsStudioDraftFromConfig(DEFAULT_TOUR_COMMS_CONFIG);
        expect(draft.reminderEnabled).toBe(true);
        expect(draft.reminderAmount).toBe(24);
        expect(draft.reminderChannels).toEqual(["email"]);
        expect(draft.askParentConfirmAttendance).toBe(true);
    });

    it("serializes 48h reminder toggle and preserves extra offsets", () => {
        const draft = buildTourCommsStudioDraftFromConfig(DEFAULT_TOUR_COMMS_CONFIG);
        draft.reminderAmount = 48;
        const existing = [
            { reminder_key: "tour_reminder_24h", offset_minutes: 24 * 60, channels: ["email"] as TourCommsChannel[] },
            { reminder_key: "tour_reminder_72h", offset_minutes: 72 * 60, channels: ["email"] as TourCommsChannel[] },
        ];
        const offsets = serializeTourReminderOffsets(draft, existing);
        expect(offsets[0].offset_minutes).toBe(48 * 60);
        expect(offsets[0].reminder_key).toBe(deriveTourReminderKey(48));
        expect(offsets[1].reminder_key).toBe("tour_reminder_72h");
    });

    it("disabling reminder drops primary offset but keeps others", () => {
        const draft = buildTourCommsStudioDraftFromConfig(DEFAULT_TOUR_COMMS_CONFIG);
        draft.reminderEnabled = false;
        const existing = [
            { reminder_key: "tour_reminder_24h", offset_minutes: 24 * 60, channels: ["email"] as TourCommsChannel[] },
            { reminder_key: "tour_reminder_72h", offset_minutes: 72 * 60, channels: ["email"] as TourCommsChannel[] },
        ];
        expect(serializeTourReminderOffsets(draft, existing)).toEqual([existing[1]]);
    });

    it("round-trips internal recipients through org fragment", () => {
        const draft = buildTourCommsStudioDraftFromConfig(DEFAULT_TOUR_COMMS_CONFIG);
        draft.internalRecipientUserIds = ["user-a", "user-b"];
        draft.internalRecipientsEnabled = true;
        const fragment = serializeTourCommsStudioDraftToFragment(draft, {});
        const merged = mergeTourCommsConfig(parseTourCommsConfigFragment(fragment), {});
        expect(merged.internal_recipients.user_ids).toEqual(["user-a", "user-b"]);
    });

    it("validates reminder enabled without channels", () => {
        const draft = buildTourCommsStudioDraftFromConfig(DEFAULT_TOUR_COMMS_CONFIG);
        draft.reminderChannels = [];
        const result = validateTourCommsStudioDraft(draft, {
            eventKey: "tour_reminder",
            editingReminderControls: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/Email or SMS/i);
    });

    it("validates confirm attendance requires a capable channel", () => {
        const draft = buildTourCommsStudioDraftFromConfig(DEFAULT_TOUR_COMMS_CONFIG);
        draft.reminderEnabled = true;
        draft.reminderChannels = [];
        draft.askParentConfirmAttendance = true;
        const result = validateTourCommsStudioDraft(draft, {
            eventKey: "tour_reminder",
            editingReminderControls: true,
        });
        expect(result.ok).toBe(false);
    });

    it("allows empty internal recipients", () => {
        const draft = buildTourCommsStudioDraftFromConfig(DEFAULT_TOUR_COMMS_CONFIG);
        draft.internalRecipientUserIds = [];
        const result = validateTourCommsStudioDraft(draft, {
            eventKey: "tour_confirmation",
            editingReminderControls: false,
        });
        expect(result.ok).toBe(true);
    });

    it("converts hours to offset minutes", () => {
        expect(reminderAmountToOffsetMinutes(24, "hours")).toBe(1440);
        expect(reminderAmountToOffsetMinutes(0, "hours")).toBe(0);
    });
});
