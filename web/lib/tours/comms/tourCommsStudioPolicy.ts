/**
 * Communications Studio — Tour delivery/automation UI ↔ TourCommsConfig fragment helpers.
 * Pure parse/serialize/validate only (no React).
 */

import {
    DEFAULT_TOUR_COMMS_CONFIG,
    type TourCommsChannel,
    type TourCommsConfig,
    type TourCommsConfigMetadataFragment,
    type TourCommsEventKey,
    type TourReminderOffset,
} from "@/lib/tours/comms/tourCommsConfig";
import { parseTourSystemTemplateKey, type TourSystemTemplateKey } from "@/lib/tours/comms/tourSystemTemplates";

export const TOUR_COMMS_STUDIO_INHERITANCE_HELPER =
    "Inherited from Tour communications policy — changes apply to all Tour lifecycle notifications.";

export const TOUR_COMMS_STUDIO_PARENT_RECIPIENT_LABEL = "Primary contact";

export type TourCommsStudioReminderUnit = "hours";

export type TourCommsStudioDraft = {
    reminderEnabled: boolean;
    reminderAmount: number;
    reminderUnit: TourCommsStudioReminderUnit;
    reminderKey: string;
    reminderChannels: TourCommsChannel[];
    askParentConfirmAttendance: boolean;
    internalRecipientsEnabled: boolean;
    internalRecipientUserIds: string[];
};

export type TourCommsStudioValidationContext = {
    eventKey: TourSystemTemplateKey | null;
    editingReminderControls: boolean;
};

export type TourCommsStudioValidationResult = { ok: true } | { ok: false; error: string };

const REMINDER_UNIT_MINUTES: Record<TourCommsStudioReminderUnit, number> = {
    hours: 60,
};

export function isTourSystemTemplateSystemKey(systemKey: string | null | undefined): boolean {
    return typeof systemKey === "string" && systemKey.trim().startsWith("tour_");
}

export function tourSystemTemplateEventKey(systemKey: string | null | undefined): TourSystemTemplateKey | null {
    return parseTourSystemTemplateKey(systemKey)?.eventKey ?? null;
}

export function tourTemplateShowsReminderControls(eventKey: TourSystemTemplateKey | null): boolean {
    return eventKey === "tour_reminder";
}

export function tourTemplateShowsInternalRecipients(eventKey: TourSystemTemplateKey | null): boolean {
    return (
        eventKey === "tour_confirmation"
        || eventKey === "tour_reschedule"
        || eventKey === "tour_cancel"
        || eventKey === "tour_reminder"
    );
}

export function reminderOffsetToStudioDraft(offset: TourReminderOffset | undefined): Pick<
    TourCommsStudioDraft,
    "reminderEnabled" | "reminderAmount" | "reminderUnit" | "reminderKey" | "reminderChannels"
> {
    if (!offset) {
        return {
            reminderEnabled: false,
            reminderAmount: 24,
            reminderUnit: "hours",
            reminderKey: DEFAULT_TOUR_COMMS_CONFIG.reminder_offsets[0]?.reminder_key ?? "tour_reminder_24h",
            reminderChannels: [],
        };
    }
    const hours = Math.max(1, Math.round(offset.offset_minutes / REMINDER_UNIT_MINUTES.hours));
    return {
        reminderEnabled: true,
        reminderAmount: hours,
        reminderUnit: "hours",
        reminderKey: offset.reminder_key,
        reminderChannels: [...offset.channels],
    };
}

export function buildTourCommsStudioDraftFromConfig(config: TourCommsConfig): TourCommsStudioDraft {
    const reminder = reminderOffsetToStudioDraft(config.reminder_offsets[0]);
    return {
        ...reminder,
        askParentConfirmAttendance: config.ask_parent_confirm_attendance,
        internalRecipientsEnabled: config.internal_recipients.enabled,
        internalRecipientUserIds: [...config.internal_recipients.user_ids],
    };
}

export function deriveTourReminderKey(hours: number): string {
    const h = Math.max(1, Math.floor(hours));
    return `tour_reminder_${h}h`;
}

export function reminderAmountToOffsetMinutes(amount: number, unit: TourCommsStudioReminderUnit): number {
    const n = Math.floor(Number(amount));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n * REMINDER_UNIT_MINUTES[unit];
}

export function serializeTourReminderOffsets(
    draft: TourCommsStudioDraft,
    existingOffsets: TourReminderOffset[],
): TourReminderOffset[] {
    const preserved = existingOffsets.slice(1);
    if (!draft.reminderEnabled) return preserved;

    const offsetMinutes = reminderAmountToOffsetMinutes(draft.reminderAmount, draft.reminderUnit);
    if (offsetMinutes <= 0) return preserved;

    const channels = draft.reminderChannels.filter((c, i, arr) => arr.indexOf(c) === i);
    if (channels.length === 0) return preserved;

    const hours = Math.max(1, Math.floor(draft.reminderAmount));
    const reminder_key = deriveTourReminderKey(hours);

    return [{ reminder_key, offset_minutes: offsetMinutes, channels }, ...preserved];
}

export function validateTourCommsStudioDraft(
    draft: TourCommsStudioDraft,
    ctx: TourCommsStudioValidationContext,
): TourCommsStudioValidationResult {
    if (ctx.editingReminderControls && draft.reminderEnabled) {
        const offsetMinutes = reminderAmountToOffsetMinutes(draft.reminderAmount, draft.reminderUnit);
        if (offsetMinutes <= 0) {
            return { ok: false, error: "Reminder timing must be at least 1 hour before the tour." };
        }
        if (draft.reminderChannels.length === 0) {
            return { ok: false, error: "Turn on Email or SMS for the tour reminder, or disable the reminder." };
        }
        if (draft.askParentConfirmAttendance && !draft.reminderChannels.some((c) => c === "email" || c === "sms")) {
            return {
                ok: false,
                error: "Ask parent to confirm attendance requires Email or SMS on the reminder.",
            };
        }
    }

    if (
        ctx.editingReminderControls
        && draft.askParentConfirmAttendance
        && draft.reminderEnabled
        && draft.reminderChannels.length === 0
    ) {
        return {
            ok: false,
            error: "Ask parent to confirm attendance requires at least one reminder channel.",
        };
    }

    return { ok: true };
}

export function serializeTourCommsStudioDraftToFragment(
    draft: TourCommsStudioDraft,
    existingFragment: TourCommsConfigMetadataFragment,
): TourCommsConfigMetadataFragment {
    const existingOffsets =
        existingFragment.reminder_offsets ?? DEFAULT_TOUR_COMMS_CONFIG.reminder_offsets.map((r) => ({
            ...r,
            channels: [...r.channels],
        }));

    return {
        reminder_offsets: serializeTourReminderOffsets(draft, existingOffsets),
        ask_parent_confirm_attendance: draft.askParentConfirmAttendance,
        parent_recipient_policy: "primary_contact",
        internal_recipients: {
            enabled: draft.internalRecipientsEnabled,
            user_ids: [...draft.internalRecipientUserIds],
        },
    };
}

/** Map event key to orchestrator event for docs/tests parity. */
export function tourStudioEventKeyToCommsEventKey(eventKey: TourSystemTemplateKey): TourCommsEventKey {
    return eventKey;
}
